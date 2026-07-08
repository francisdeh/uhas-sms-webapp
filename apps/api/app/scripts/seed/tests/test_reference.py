"""Tests for the idempotent reference seed (`seed/reference.py`).

The prod bootstrap runs this against a live DB and may re-run it, so the
contract is: create what's missing, never duplicate, never modify an
existing row. `ensure_subjects` is parameterised by `school_id`, so a
throwaway test school keeps these isolated from any seeded/committed data
on the shared dev DB.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.schools.model import School
from app.features.subjects.model import Subject
from app.scripts.seed.reference import (
    SUBJECTS_BY_DIVISION,
    ensure_school,
    ensure_subjects,
)

TEST_SCHOOL_ID = UUID("33333333-3333-4333-8333-333333333301")
EXPECTED_SUBJECT_COUNT = sum(len(names) for names in SUBJECTS_BY_DIVISION.values())


async def _make_school(session: AsyncSession) -> UUID:
    session.add(
        School(
            id=TEST_SCHOOL_ID,
            slug="seed-ref-test-school",
            name="Seed Ref Test School",
            academic_year="2025/2026",
            current_term=1,
            grading_scale="GES_STANDARD",
            is_active=True,
        )
    )
    await session.flush()
    return TEST_SCHOOL_ID


async def _subject_count(session: AsyncSession, school_id: UUID) -> int:
    return (
        await session.scalar(
            select(func.count()).select_from(Subject).where(Subject.school_id == school_id)
        )
        or 0
    )


async def test_ensure_subjects_creates_full_curriculum(db_session: AsyncSession) -> None:
    school_id = await _make_school(db_session)
    ids = await ensure_subjects(db_session, school_id)

    assert len(ids) == EXPECTED_SUBJECT_COUNT
    assert await _subject_count(db_session, school_id) == EXPECTED_SUBJECT_COUNT
    # Division-scoped: same-named subject in two divisions is two rows.
    assert ids["JHS:English Language"] != ids["Lower Primary:English Language"]


async def test_ensure_subjects_is_idempotent(db_session: AsyncSession) -> None:
    school_id = await _make_school(db_session)
    first = await ensure_subjects(db_session, school_id)
    second = await ensure_subjects(db_session, school_id)

    # No new rows, and the same ids come back the second time.
    assert await _subject_count(db_session, school_id) == EXPECTED_SUBJECT_COUNT
    assert first == second


async def test_ensure_subjects_never_overwrites_existing(db_session: AsyncSession) -> None:
    school_id = await _make_school(db_session)
    # Pre-insert one subject on the JHS "English Language" slug with a
    # sentinel name; ensure_subjects must reuse it, not overwrite it.
    db_session.add(
        Subject(
            id=UUID("33333333-3333-4333-8333-3333333333aa"),
            slug="ENGLISH-LANGUAGE-JHS",
            school_id=school_id,
            name="SENTINEL",
            division="JHS",
            category="Elective",
        )
    )
    await db_session.flush()

    await ensure_subjects(db_session, school_id)

    row = await db_session.scalar(
        select(Subject).where(
            Subject.school_id == school_id, Subject.slug == "ENGLISH-LANGUAGE-JHS"
        )
    )
    assert row is not None
    assert row.name == "SENTINEL"  # untouched
    assert row.category == "Elective"  # untouched
    # Still exactly the full set (the sentinel filled the JHS-English slot).
    assert await _subject_count(db_session, school_id) == EXPECTED_SUBJECT_COUNT


async def test_ensure_school_is_idempotent(db_session: AsyncSession) -> None:
    # slug is globally unique, so the reference school row is 0-or-1 no
    # matter what else is committed. Two calls must return the same id and
    # never create a second row.
    first = await ensure_school(db_session)
    second = await ensure_school(db_session)
    assert first == second

    count = await db_session.scalar(
        select(func.count()).select_from(School).where(School.slug == "school-uhas-001")
    )
    assert count == 1
