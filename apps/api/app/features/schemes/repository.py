"""Data-access layer for Schemes."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.features.classes.model import Class
from app.features.schemes.model import Scheme, SchemeComment
from app.features.staff.model import Staff
from app.features.subjects.model import Subject


class SchemesRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        teacher_id: UUID | str | None = None,
        status: str | None = None,
        division: str | None = None,
        term: int | None = None,
        academic_year: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Scheme, Staff, Subject, Class, Staff | None]], int]:
        reviewer = aliased(Staff, name="reviewer")
        teacher = aliased(Staff, name="teacher")

        where = [
            Scheme.school_id == school_id,
            Scheme.deleted_at.is_(None),
        ]
        if teacher_id:
            where.append(Scheme.teacher_id == teacher_id)
        if status:
            where.append(Scheme.status == status)
        if division:
            where.append(Class.division == division)
        if term is not None:
            where.append(Scheme.term == term)
        if academic_year:
            where.append(Scheme.academic_year == academic_year)

        where_clause = and_(*where)

        count_stmt = (
            select(func.count(Scheme.id))
            .join(Class, Class.id == Scheme.class_id)
            .where(where_clause)
        )
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(Scheme, teacher, Subject, Class, reviewer)
            .join(teacher, teacher.id == Scheme.teacher_id)
            .join(Subject, Subject.id == Scheme.subject_id)
            .join(Class, Class.id == Scheme.class_id)
            .outerjoin(reviewer, reviewer.id == Scheme.reviewed_by_id)
            .where(where_clause)
            .order_by(desc(Scheme.updated_at))
            .offset(offset)
            .limit(size)
        )
        rows = [
            (sc, tch, sub, cls, rev)
            for sc, tch, sub, cls, rev in (await session.execute(rows_stmt)).all()
        ]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, scheme_id: UUID | str
    ) -> tuple[Scheme, Staff, Subject, Class, Staff | None] | None:
        reviewer = aliased(Staff, name="reviewer")
        teacher = aliased(Staff, name="teacher")
        stmt = (
            select(Scheme, teacher, Subject, Class, reviewer)
            .join(teacher, teacher.id == Scheme.teacher_id)
            .join(Subject, Subject.id == Scheme.subject_id)
            .join(Class, Class.id == Scheme.class_id)
            .outerjoin(reviewer, reviewer.id == Scheme.reviewed_by_id)
            .where(
                and_(
                    Scheme.id == scheme_id,
                    Scheme.school_id == school_id,
                    Scheme.deleted_at.is_(None),
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1], row[2], row[3], row[4]) if row else None

    @staticmethod
    async def insert_comment(
        session: AsyncSession,
        *,
        scheme_id: UUID | str,
        author_id: UUID | str,
        body: str,
    ) -> SchemeComment:
        """Append one comment to a scheme's thread. Never overwrites."""
        comment = SchemeComment(scheme_id=scheme_id, author_id=author_id, body=body)
        session.add(comment)
        await session.flush()
        return comment

    @staticmethod
    async def list_comments_for_scheme(
        session: AsyncSession, scheme_id: UUID | str
    ) -> list[tuple[SchemeComment, Staff]]:
        """The full thread for one scheme, oldest first, with author staff."""
        stmt = (
            select(SchemeComment, Staff)
            .join(Staff, Staff.id == SchemeComment.author_id)
            .where(SchemeComment.scheme_id == scheme_id)
            .order_by(SchemeComment.created_at.asc())
        )
        return [(c, s) for c, s in (await session.execute(stmt)).all()]
