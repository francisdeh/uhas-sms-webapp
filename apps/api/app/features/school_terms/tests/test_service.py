"""Unit tests for SchoolTermsService — exercises the upsert + audit logic
against a real Postgres via the transactional `db_session` fixture."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.school_terms.schema import TermInput, TermsUpsertRequest
from app.features.school_terms.service import SchoolTermsService
from app.features.school_terms.tests.conftest import SCHOOL_UUID, USER_UUID
from app.features.schools.model import School

ACTOR = USER_UUID


def _payload(
    year: str = "2025/2026",
    *,
    term1: tuple[str, str] = ("2025-09-08", "2025-12-19"),
    term2: tuple[str, str] = ("2026-01-12", "2026-04-03"),
    term3: tuple[str, str] = ("2026-04-27", "2026-07-31"),
) -> TermsUpsertRequest:
    """Helper — build a well-formed payload with overridable dates."""
    return TermsUpsertRequest(
        academic_year=year,
        terms=[
            TermInput(
                term=1,
                start_date=date.fromisoformat(term1[0]),
                end_date=date.fromisoformat(term1[1]),
            ),
            TermInput(
                term=2,
                start_date=date.fromisoformat(term2[0]),
                end_date=date.fromisoformat(term2[1]),
            ),
            TermInput(
                term=3,
                start_date=date.fromisoformat(term3[0]),
                end_date=date.fromisoformat(term3[1]),
            ),
        ],
    )


async def test_list_for_school_returns_empty_when_no_terms(
    db_session: AsyncSession, seed_school: School
) -> None:
    rows = await SchoolTermsService.list_for_school(db_session, SCHOOL_UUID)
    assert rows == []


async def test_upsert_year_inserts_three_terms_first_time(
    db_session: AsyncSession, seed_school: School
) -> None:
    rows = await SchoolTermsService.upsert_year(
        db_session, SCHOOL_UUID, _payload(), actor_user_id=ACTOR
    )
    assert len(rows) == 3
    assert [r.term for r in rows] == [1, 2, 3]
    assert rows[0].start_date == date(2025, 9, 8)
    assert rows[2].end_date == date(2026, 7, 31)

    # One audit row covering the whole batch.
    audit_rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "SCHOOL_TERMS_UPSERT")))
        .scalars()
        .all()
    )
    assert len(audit_rows) == 1
    assert audit_rows[0].user_id == ACTOR
    assert audit_rows[0].before is None  # nothing existed before


async def test_upsert_year_updates_existing_rows_in_place(
    db_session: AsyncSession, seed_school: School
) -> None:
    # Seed three rows first.
    await SchoolTermsService.upsert_year(db_session, SCHOOL_UUID, _payload(), actor_user_id=ACTOR)
    first_round_ids = {
        r.term: r.id for r in await SchoolTermsService.list_for_school(db_session, SCHOOL_UUID)
    }

    # Now change term 2's end date — same year, same term number → update.
    changed = _payload(term2=("2026-01-12", "2026-04-30"))
    rows = await SchoolTermsService.upsert_year(
        db_session, SCHOOL_UUID, changed, actor_user_id=ACTOR
    )

    # IDs preserved (updated in place, not deleted + reinserted).
    second_round_ids = {r.term: r.id for r in rows}
    assert first_round_ids == second_round_ids
    term2_row = next(r for r in rows if r.term == 2)
    assert term2_row.end_date == date(2026, 4, 30)


async def test_upsert_year_is_noop_when_all_unchanged(
    db_session: AsyncSession, seed_school: School
) -> None:
    """Re-submitting identical dates produces no audit row."""
    await SchoolTermsService.upsert_year(db_session, SCHOOL_UUID, _payload(), actor_user_id=ACTOR)
    audit_before = len(
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "SCHOOL_TERMS_UPSERT")))
        .scalars()
        .all()
    )

    # Identical payload again.
    await SchoolTermsService.upsert_year(db_session, SCHOOL_UUID, _payload(), actor_user_id=ACTOR)
    audit_after = len(
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "SCHOOL_TERMS_UPSERT")))
        .scalars()
        .all()
    )
    assert audit_after == audit_before, "no-op upsert should not write an audit row"


async def test_upsert_year_isolates_distinct_years(
    db_session: AsyncSession, seed_school: School
) -> None:
    """Upserting 2026/2027 doesn't disturb 2025/2026's rows."""
    await SchoolTermsService.upsert_year(
        db_session, SCHOOL_UUID, _payload("2025/2026"), actor_user_id=ACTOR
    )
    await SchoolTermsService.upsert_year(
        db_session,
        SCHOOL_UUID,
        _payload(
            "2026/2027",
            term1=("2026-09-07", "2026-12-18"),
            term2=("2027-01-11", "2027-04-02"),
            term3=("2027-04-26", "2027-07-30"),
        ),
        actor_user_id=ACTOR,
    )

    all_rows = await SchoolTermsService.list_for_school(db_session, SCHOOL_UUID)
    assert len(all_rows) == 6
    years = sorted({r.academic_year for r in all_rows})
    assert years == ["2025/2026", "2026/2027"]
