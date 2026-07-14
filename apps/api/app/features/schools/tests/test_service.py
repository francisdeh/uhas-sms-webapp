"""Unit tests for SchoolsService.

Hits a real Postgres (via the transactional `db_session` fixture) so the
JSONB columns + audit log writes go through the same code path that
production does. Tests roll back their transaction at teardown — no
cross-test pollution.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.features.audit.model import AuditLog
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.promotions.model import PromotionSeason
from app.features.school_terms.model import SchoolTerm
from app.features.school_terms.repository import SchoolTermsRepository
from app.features.schools.model import School
from app.features.schools.schema import SchoolUpdate
from app.features.schools.service import SchoolsService
from app.features.schools.tests.conftest import SCHOOL_UUID, USER_UUID

ACTOR = USER_UUID


async def test_get_returns_seeded_school(db_session: AsyncSession, seed_school: School) -> None:
    row = await SchoolsService.get(db_session, SCHOOL_UUID)
    assert row.id == SCHOOL_UUID
    assert row.name == "Test School"


async def test_get_raises_not_found_for_missing_school(db_session: AsyncSession) -> None:
    """A valid-shape uuid that doesn't exist in the DB → NotFoundError."""
    ghost = UUID("99999999-9999-4999-8999-999999999999")
    try:
        await SchoolsService.get(db_session, ghost)
    except NotFoundError as exc:
        assert str(ghost) in exc.message
    else:
        raise AssertionError("expected NotFoundError")


async def test_patch_applies_changes_and_writes_audit(
    db_session: AsyncSession, seed_school: School
) -> None:
    patch = SchoolUpdate(name="UHAS Basic School (Renamed)", motto="To learn is to live")
    updated = await SchoolsService.patch(db_session, SCHOOL_UUID, patch, actor_user_id=ACTOR)
    assert updated.name == "UHAS Basic School (Renamed)"
    assert updated.motto == "To learn is to live"

    audit_rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.target_id == SCHOOL_UUID)))
        .scalars()
        .all()
    )
    assert len(audit_rows) == 1
    audit = audit_rows[0]
    assert audit.user_id == ACTOR
    assert audit.action == "SCHOOL_SETTINGS_UPDATE"
    assert audit.target_table == "schools"
    # Diff carries only the changed fields. JSONB column → plain dict.
    assert audit.after is not None
    assert audit.after.get("name") == "UHAS Basic School (Renamed)"


async def test_patch_with_unchanged_fields_skips_audit_row(
    db_session: AsyncSession, seed_school: School
) -> None:
    """A patch where every field equals current state is a no-op.

    Settings page often submits unchanged forms; we shouldn't pollute
    audit_log with empty diffs.
    """
    patch = SchoolUpdate(
        name=seed_school.name,
        academic_year=seed_school.academic_year,
    )
    await SchoolsService.patch(db_session, SCHOOL_UUID, patch, actor_user_id=ACTOR)

    audit_count = len(
        (await db_session.execute(select(AuditLog).where(AuditLog.target_id == SCHOOL_UUID)))
        .scalars()
        .all()
    )
    assert audit_count == 0


async def test_patch_diff_records_only_changed_fields(
    db_session: AsyncSession, seed_school: School
) -> None:
    """When 1 of 3 fields changes, audit row carries only that one."""
    patch = SchoolUpdate(
        name=seed_school.name,  # unchanged
        academic_year=seed_school.academic_year,  # unchanged
        motto="A brand new motto",  # changed
    )
    await SchoolsService.patch(db_session, SCHOOL_UUID, patch, actor_user_id=ACTOR)

    audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.target_id == SCHOOL_UUID))
    ).scalar_one()
    # Only `motto` appears in the diff — the other unchanged fields are skipped.
    assert audit.after is not None
    assert audit.after.get("motto") == "A brand new motto"
    assert "academic_year" not in audit.after
    assert "name" not in audit.after


async def test_patch_empty_payload_is_noop(db_session: AsyncSession, seed_school: School) -> None:
    """`SchoolUpdate()` with no fields set produces no audit row, no UPDATE."""
    await SchoolsService.patch(db_session, SCHOOL_UUID, SchoolUpdate(), actor_user_id=ACTOR)
    audit_count = len(
        (await db_session.execute(select(AuditLog).where(AuditLog.target_id == SCHOOL_UUID)))
        .scalars()
        .all()
    )
    assert audit_count == 0


async def test_get_resolved_uses_term_resolver(
    db_session: AsyncSession, seed_school: School
) -> None:
    """`current_term` in the response is resolved from school_terms dates,
    not the raw (fallback-only) stored column."""
    db_session.add(
        SchoolTerm(
            school_id=SCHOOL_UUID,
            academic_year="2025/2026",
            term=2,
            start_date=date(2020, 1, 1),
            end_date=date(2099, 1, 1),  # spans "today" regardless of test run date
        )
    )
    await db_session.flush()
    read = await SchoolsService.get_resolved(db_session, SCHOOL_UUID)
    assert read.current_term == 2  # seed_school.current_term is 1 — resolver wins


async def test_prepare_next_year_copies_classes_and_shifts_terms(
    db_session: AsyncSession, seed_school: School
) -> None:
    db_session.add_all(
        [
            Class(
                slug="class-jhs1",
                school_id=SCHOOL_UUID,
                name="JHS 1",
                division="JHS",
                academic_year="2025/2026",
            ),
            SchoolTerm(
                school_id=SCHOOL_UUID,
                academic_year="2025/2026",
                term=1,
                start_date=date(2025, 9, 8),
                end_date=date(2025, 12, 12),
            ),
        ]
    )
    await db_session.flush()

    result = await SchoolsService.prepare_next_year(db_session, SCHOOL_UUID)

    assert result.next_academic_year == "2026/2027"
    assert result.classes_created == 1
    assert result.terms_created == 1

    next_class = await ClassesRepository.find_by_slug(db_session, SCHOOL_UUID, "class-jhs1-2027")
    assert next_class is not None
    assert next_class.name == "JHS 1"
    assert next_class.academic_year == "2026/2027"

    next_term = await SchoolTermsRepository.find_one(db_session, SCHOOL_UUID, "2026/2027", 1)
    assert next_term is not None
    assert next_term.start_date == date(2026, 9, 8)
    assert next_term.end_date == date(2026, 12, 12)


async def test_prepare_next_year_is_idempotent(
    db_session: AsyncSession, seed_school: School
) -> None:
    """Running it twice doesn't duplicate classes/terms."""
    db_session.add(
        Class(
            slug="class-jhs1",
            school_id=SCHOOL_UUID,
            name="JHS 1",
            division="JHS",
            academic_year="2025/2026",
        )
    )
    await db_session.flush()

    first = await SchoolsService.prepare_next_year(db_session, SCHOOL_UUID)
    second = await SchoolsService.prepare_next_year(db_session, SCHOOL_UUID)

    assert first.classes_created == 1
    assert second.classes_created == 0  # already exists — skipped, not duplicated


async def test_activate_next_year_blocked_while_season_open(
    db_session: AsyncSession, seed_school: School
) -> None:
    db_session.add(PromotionSeason(school_id=SCHOOL_UUID, academic_year="2025/2026", status="open"))
    await db_session.flush()

    try:
        await SchoolsService.activate_next_year(db_session, SCHOOL_UUID, actor_user_id=ACTOR)
    except ValidationError as exc:
        assert "still open" in exc.message
    else:
        raise AssertionError("expected ValidationError")

    # School untouched.
    refreshed = await SchoolsService.get(db_session, SCHOOL_UUID)
    assert refreshed.academic_year == "2025/2026"


async def test_activate_next_year_succeeds_when_season_closed(
    db_session: AsyncSession, seed_school: School
) -> None:
    db_session.add(
        PromotionSeason(school_id=SCHOOL_UUID, academic_year="2025/2026", status="closed")
    )
    seed_school.current_term_override = 3
    await db_session.flush()

    updated = await SchoolsService.activate_next_year(db_session, SCHOOL_UUID, actor_user_id=ACTOR)

    assert updated.academic_year == "2026/2027"
    assert updated.current_term == 1
    assert updated.current_term_override is None

    audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.target_id == SCHOOL_UUID))
    ).scalar_one()
    assert audit.action == "SCHOOL_YEAR_ACTIVATED"
    assert audit.after is not None
    assert audit.after.get("academic_year") == "2026/2027"


async def test_activate_next_year_succeeds_when_no_season_ever_opened(
    db_session: AsyncSession, seed_school: School
) -> None:
    """A school that never opened Promotions at all (no PromotionSeason
    row exists) is just as valid to activate as an explicitly closed one."""
    updated = await SchoolsService.activate_next_year(db_session, SCHOOL_UUID, actor_user_id=ACTOR)
    assert updated.academic_year == "2026/2027"
