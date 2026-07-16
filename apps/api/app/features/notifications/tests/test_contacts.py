"""Tests for `resolve_user_contacts` — the mixed staff/guardian contact
resolver built for Announcements' `division:X` scope (the first case
needing both sides at once). Runs against the real DB, reusing the
shared `seed_full` graph from `notifications/tests/conftest.py`.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.notifications.contacts import resolve_user_contacts
from app.features.notifications.tests.conftest import (
    ADMIN_USER,
    GUARDIAN_UUID,
    PARENT_USER,
    TEACHER_STAFF,
    TEACHER_USER,
)
from app.features.staff.model import Staff

pytestmark = pytest.mark.asyncio


async def test_resolves_staff_and_guardian_contacts_in_one_call(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    teacher_staff = await db_session.get(Staff, TEACHER_STAFF)
    assert teacher_staff is not None
    teacher_staff.phone = "+233200000701"
    guardian = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian is not None
    guardian.phone = "+233200000702"
    await db_session.flush()

    contacts = await resolve_user_contacts(db_session, [TEACHER_USER, PARENT_USER])

    by_user_id = {c.user.id: c for c in contacts}
    assert by_user_id[TEACHER_USER].phone == "+233200000701"
    assert by_user_id[TEACHER_USER].guardian_id is None
    assert by_user_id[PARENT_USER].phone == "+233200000702"
    assert by_user_id[PARENT_USER].guardian_id == GUARDIAN_UUID


async def test_user_with_no_phone_on_file_gets_none(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    contacts = await resolve_user_contacts(db_session, [ADMIN_USER])
    assert len(contacts) == 1
    assert contacts[0].phone is None
    assert contacts[0].guardian_id is None


async def test_empty_input_returns_empty_list(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    assert await resolve_user_contacts(db_session, []) == []
