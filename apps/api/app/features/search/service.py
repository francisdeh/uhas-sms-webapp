"""Role branching + result assembly for global search.

Kept out of `router.py` so the role gate is unit-testable without
FastAPI. The four branches map one-to-one to the app's four dashboard
roles; Accountant + any unknown role falls through to an empty
payload rather than 403 so the palette silently degrades.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT, TEACHER
from app.core.security import CurrentUser
from app.features.classes.model import Class
from app.features.schools.service import SchoolsService
from app.features.search.repository import SearchRepository
from app.features.search.schema import ClassHit, SearchResults, StaffHit, StudentHit
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.students.model import Student

_MIN_QUERY_LENGTH = 2
_PER_DOMAIN_CAP = 8


def _empty() -> SearchResults:
    return SearchResults(students=[], staff=[], classes=[])


def _student_hits(rows: list[tuple[Student, str | None]]) -> list[StudentHit]:
    return [
        StudentHit(
            id=student.id,
            name=f"{student.first_name} {student.last_name}",
            slug=student.slug,
            class_name=class_name,
        )
        for student, class_name in rows
    ]


def _staff_hits(rows: list[Staff]) -> list[StaffHit]:
    return [
        StaffHit(
            id=s.id,
            name=f"{s.first_name} {s.last_name}",
            slug=s.slug,
            role=s.system_role,
        )
        for s in rows
    ]


def _class_hits(rows: list[Class]) -> list[ClassHit]:
    return [ClassHit(id=c.id, name=c.name, slug=c.slug, division=c.division) for c in rows]


class SearchService:
    @staticmethod
    async def search(
        session: AsyncSession,
        user: CurrentUser,
        q: str,
    ) -> SearchResults:
        """Fan out to the three domain queries, respecting role scope.

        The short-query early return avoids touching the DB at all —
        the palette fires a request on every keystroke, and a two-char
        floor keeps the first single letter cheap.
        """
        trimmed = q.strip()
        if len(trimmed) < _MIN_QUERY_LENGTH:
            return _empty()

        if not user.school_id or not user.role:
            return _empty()

        school = await SchoolsService.get(session, user.school_id)
        year = school.academic_year
        school_id = user.school_id
        role = user.role

        if role == ADMIN:
            students = await SearchRepository.find_students(
                session,
                school_id=school_id,
                q=trimmed,
                academic_year=year,
                limit=_PER_DOMAIN_CAP,
            )
            staff = await SearchRepository.find_staff(
                session, school_id=school_id, q=trimmed, limit=_PER_DOMAIN_CAP
            )
            classes = await SearchRepository.find_classes(
                session, school_id=school_id, q=trimmed, limit=_PER_DOMAIN_CAP
            )
            return SearchResults(
                students=_student_hits(students),
                staff=_staff_hits(staff),
                classes=_class_hits(classes),
            )

        if role == DEPUTY_HEAD:
            division = await _deputy_division(session, school_id, user.linked_id)
            if not division:
                return _empty()
            class_ids = await SearchRepository.division_class_ids(
                session,
                school_id=school_id,
                academic_year=year,
                division=division,
            )
            students = await SearchRepository.find_students(
                session,
                school_id=school_id,
                q=trimmed,
                academic_year=year,
                allowed_class_ids=class_ids,
                limit=_PER_DOMAIN_CAP,
            )
            staff = await SearchRepository.find_staff(
                session,
                school_id=school_id,
                q=trimmed,
                allowed_division=division,
                limit=_PER_DOMAIN_CAP,
            )
            classes = await SearchRepository.find_classes(
                session,
                school_id=school_id,
                q=trimmed,
                allowed_division=division,
                limit=_PER_DOMAIN_CAP,
            )
            return SearchResults(
                students=_student_hits(students),
                staff=_staff_hits(staff),
                classes=_class_hits(classes),
            )

        if role == TEACHER:
            if not user.linked_id:
                return _empty()
            class_ids = await SearchRepository.teacher_class_ids(
                session, staff_id=UUID(user.linked_id), academic_year=year
            )
            students = await SearchRepository.find_students(
                session,
                school_id=school_id,
                q=trimmed,
                academic_year=year,
                allowed_class_ids=class_ids,
                limit=_PER_DOMAIN_CAP,
            )
            return SearchResults(
                students=_student_hits(students),
                staff=[],
                classes=[],
            )

        if role == PARENT:
            if not user.linked_id:
                return _empty()
            students = await SearchRepository.find_students(
                session,
                school_id=school_id,
                q=trimmed,
                academic_year=year,
                guardian_id=UUID(user.linked_id),
                limit=_PER_DOMAIN_CAP,
            )
            return SearchResults(
                students=_student_hits(students),
                staff=[],
                classes=[],
            )

        return _empty()


async def _deputy_division(
    session: AsyncSession,
    school_id: UUID | str,
    linked_id: str | None,
) -> str | None:
    if not linked_id:
        return None
    staff = await StaffRepository.get_by_id(session, school_id, linked_id)
    return staff.division if staff else None
