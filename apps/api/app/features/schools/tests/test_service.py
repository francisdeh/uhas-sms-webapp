"""Unit tests for SchoolsService.

Hits a real Postgres (via the transactional `db_session` fixture) so the
JSONB columns + audit log writes go through the same code path that
production does. Tests roll back their transaction at teardown — no
cross-test pollution.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.features.audit.model import AuditLog
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
    # Diff carries only the changed fields.
    assert audit.after is not None and "UHAS Basic School (Renamed)" in audit.after


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
        current_term=seed_school.current_term,
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
    assert "A brand new motto" in audit.after
    assert "academic_year" not in (audit.after or "")
    assert "name" not in (audit.after or "")


async def test_patch_empty_payload_is_noop(db_session: AsyncSession, seed_school: School) -> None:
    """`SchoolUpdate()` with no fields set produces no audit row, no UPDATE."""
    await SchoolsService.patch(db_session, SCHOOL_UUID, SchoolUpdate(), actor_user_id=ACTOR)
    audit_count = len(
        (await db_session.execute(select(AuditLog).where(AuditLog.target_id == SCHOOL_UUID)))
        .scalars()
        .all()
    )
    assert audit_count == 0
