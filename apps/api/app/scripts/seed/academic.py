"""Academic structure group — subjects, classes, class_teachers,
class_subjects, students, enrollments, student_guardians.

Ten classes (2 KG + 3 Lower Primary + 3 Upper Primary + 3 JHS), ten
students each, one homeroom teacher per class drawn from the staff
roster `identity.py` built. JHS subjects rotate across its three
teachers rather than all landing on one class teacher, since JHS
practice is subject-specialist, not homeroom-only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_structure import Division
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.students.model import Student, StudentGuardian
from app.scripts.seed.identity import IdentityResult
from app.scripts.seed.names import full_name
from app.scripts.seed.reference import ACADEMIC_YEAR, SUBJECTS_BY_DIVISION, ensure_subjects

# (name, slug, division, birth_year, class_teacher_slug)
_CLASSES: tuple[tuple[str, str, Division, int, str], ...] = (
    ("KG 1", "class-kg1", "KG", 2021, "STAFF-006"),
    ("KG 2", "class-kg2", "KG", 2020, "STAFF-008"),
    ("Primary 1", "class-p1", "Lower Primary", 2019, "STAFF-009"),
    ("Primary 2", "class-p2", "Lower Primary", 2018, "STAFF-010"),
    ("Primary 3", "class-p3", "Lower Primary", 2017, "STAFF-011"),
    ("Primary 4", "class-p4", "Upper Primary", 2016, "STAFF-012"),
    ("Primary 5", "class-p5", "Upper Primary", 2015, "STAFF-013"),
    ("Primary 6", "class-p6", "Upper Primary", 2014, "STAFF-014"),
    ("JHS 1", "class-jhs1", "JHS", 2013, "STAFF-004"),
    ("JHS 2", "class-jhs2", "JHS", 2012, "STAFF-005"),
    ("JHS 3", "class-jhs3", "JHS", 2011, "STAFF-015"),
)

STUDENTS_PER_CLASS = 10

# JHS runs subject specialists rather than one class teacher covering everything.
_JHS_SUBJECT_TEACHERS = ("STAFF-004", "STAFF-005", "STAFF-015")


@dataclass
class ClassRoster:
    class_id: UUID
    slug: str
    division: Division
    teacher_staff_id: UUID
    student_ids: list[UUID] = field(default_factory=list)
    subject_ids: dict[str, UUID] = field(default_factory=dict)  # subject name -> id


@dataclass
class AcademicResult:
    school_id: UUID
    class_ids: dict[str, UUID] = field(default_factory=dict)  # slug -> id
    student_ids: list[UUID] = field(default_factory=list)
    rosters: dict[str, ClassRoster] = field(default_factory=dict)  # class slug -> roster


async def seed_academic(session: AsyncSession, identity: IdentityResult) -> AcademicResult:
    # No relationship() exists anywhere in this codebase, so the ORM can't
    # infer cross-table insert ordering — each phase below flushes before
    # the next phase adds rows that FK to it.
    school_id = identity.school_id

    # Phase 1: subjects (reference data — shared idempotent helper) + classes.
    # Both FK only to schools, already flushed by seed_identity.
    subject_ids = await ensure_subjects(session, school_id)

    class_ids: dict[str, UUID] = {}
    rosters: dict[str, ClassRoster] = {}
    for name, slug, division, _birth_year, teacher_slug in _CLASSES:
        class_id = uuid4()
        class_ids[slug] = class_id
        session.add(
            Class(
                id=class_id,
                slug=slug,
                school_id=school_id,
                name=name,
                division=division,
                academic_year=ACADEMIC_YEAR,
            )
        )
        rosters[slug] = ClassRoster(
            class_id=class_id,
            slug=slug,
            division=division,
            teacher_staff_id=identity.staff_ids[teacher_slug],
        )
    await session.flush()

    # Phase 2: class_teachers + class_subjects (FK to classes/subjects/staff,
    # all flushed) and students (FK only to schools).
    teacher_slug_by_slug = {slug: teacher_slug for _, slug, _, _, teacher_slug in _CLASSES}
    for slug, roster in rosters.items():
        teacher_slug = teacher_slug_by_slug[slug]
        session.add(
            ClassTeacher(
                class_id=roster.class_id, staff_id=roster.teacher_staff_id, is_primary=True
            )
        )
        subject_names = SUBJECTS_BY_DIVISION[roster.division]
        for i, subject_name in enumerate(subject_names):
            teacher_slug_for_subject = (
                _JHS_SUBJECT_TEACHERS[i % len(_JHS_SUBJECT_TEACHERS)]
                if roster.division == "JHS"
                else teacher_slug
            )
            subject_id = subject_ids[f"{roster.division}:{subject_name}"]
            roster.subject_ids[subject_name] = subject_id
            session.add(
                ClassSubject(
                    class_id=roster.class_id,
                    subject_id=subject_id,
                    teacher_id=identity.staff_ids[teacher_slug_for_subject],
                )
            )

    birth_year_by_slug = {slug: birth_year for _, slug, _, birth_year, _ in _CLASSES}
    student_ids: list[UUID] = []
    student_index = 0
    for slug, roster in rosters.items():
        birth_year = birth_year_by_slug[slug]
        for j in range(STUDENTS_PER_CLASS):
            female = j % 2 == 0
            first, last = full_name(student_index, female=female)
            student_id = uuid4()
            student_ids.append(student_id)
            roster.student_ids.append(student_id)
            month = (student_index % 12) + 1
            day = (student_index % 27) + 1
            session.add(
                Student(
                    id=student_id,
                    slug=f"UHAS-2025-{student_index + 1:04d}",
                    school_id=school_id,
                    first_name=first,
                    last_name=last,
                    dob=date(birth_year, month, day),
                    gender="Female" if female else "Male",
                    is_active=True,
                )
            )
            student_index += 1

    # The seeded Parent test account's own children — two siblings, in
    # different classes, sharing the Parent's own last name.
    primary_guardian_id = identity.guardian_ids["guardian-001"]
    sibling_class_slugs = ("class-p4", "class-jhs1")
    sibling_student_ids: dict[str, UUID] = {}
    for k, class_slug in enumerate(sibling_class_slugs):
        student_id = uuid4()
        student_ids.append(student_id)
        rosters[class_slug].student_ids.append(student_id)
        sibling_student_ids[class_slug] = student_id
        female = k == 0
        first, _ = full_name(900 + k, female=female)
        session.add(
            Student(
                id=student_id,
                slug=f"UHAS-2025-{student_index + 1:04d}",
                school_id=school_id,
                first_name=first,
                last_name="Agbeko",
                dob=date(2016 if k == 0 else 2013, 6, 15),
                gender="Female" if female else "Male",
                is_active=True,
            )
        )
        student_index += 1
    await session.flush()

    # Phase 3: enrollments + student_guardians (FK to students/classes/guardians,
    # all flushed).
    for roster in rosters.values():
        for student_id in roster.student_ids:
            session.add(
                Enrollment(
                    id=uuid4(),
                    student_id=student_id,
                    class_id=roster.class_id,
                    academic_year=ACADEMIC_YEAR,
                    status=ACTIVE,
                    enrollment_date=date(2025, 9, 8),
                )
            )
            if student_id in sibling_student_ids.values():
                guardian_id = primary_guardian_id
                relation = "father"
            else:
                idx = student_ids.index(student_id)
                guardian_slug = f"guardian-{(idx % 40) + 2:03d}"
                guardian_id = identity.guardian_ids[guardian_slug]
                relation = "mother" if idx % 2 == 0 else "father"
            session.add(
                StudentGuardian(
                    student_id=student_id,
                    guardian_id=guardian_id,
                    relation=relation,
                    is_primary=True,
                )
            )

    await session.flush()
    return AcademicResult(
        school_id=school_id, class_ids=class_ids, student_ids=student_ids, rosters=rosters
    )
