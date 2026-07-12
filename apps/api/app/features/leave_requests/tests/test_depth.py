"""Tests for leave-management depth (Phase 6 item 3): the division-scope
fix, rejection-reason wiring, audit logging, Casual leave balance,
substitute assignment, and document URLs."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.leave_requests.tests.conftest import (
    STAFF_ADMIN_UUID,
    STAFF_APPROVER_UUID,
    STAFF_OTHER_DEPUTY_UUID,
    STAFF_OTHER_DIVISION_UUID,
    STAFF_REQUESTER_UUID,
    STAFF_SUBSTITUTE_UUID,
    auth_header,
)

pytestmark = pytest.mark.usefixtures("seed_school", "seed_staff")

_THIS_YEAR = datetime.now(UTC).year


def _casual_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "type": "Casual",
        "startDate": f"{_THIS_YEAR}-02-01",
        "endDate": f"{_THIS_YEAR}-02-05",
    }
    body.update(overrides)
    return body


async def _create_and_approve(client: AsyncClient, **create_overrides: object) -> str:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(**create_overrides),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    assert create.status_code == 201, create.text
    request_id: str = create.json()["id"]
    approve = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert approve.status_code == 200, approve.text
    return request_id


# ── division-scope leak fix ─────────────────────────────────────────────


async def test_deputy_cannot_list_other_divisions_requests(client: AsyncClient) -> None:
    await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_OTHER_DIVISION_UUID),
    )
    resp = await client.get(
        "/leave-requests", headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID)
    )
    assert resp.status_code == 200
    staff_ids = {r["staffId"] for r in resp.json()["items"]}
    assert str(STAFF_OTHER_DIVISION_UUID) not in staff_ids


async def test_deputy_cannot_view_other_divisions_request(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_OTHER_DIVISION_UUID),
    )
    request_id = create.json()["id"]
    resp = await client.get(
        f"/leave-requests/{request_id}",
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert resp.status_code == 403


async def test_deputy_cannot_approve_other_divisions_request(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_OTHER_DIVISION_UUID),
    )
    request_id = create.json()["id"]
    resp = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert resp.status_code == 403


async def test_deputy_can_approve_own_divisions_request(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    request_id = create.json()["id"]
    resp = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert resp.status_code == 200


async def test_other_divisions_deputy_can_approve_their_own(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_OTHER_DIVISION_UUID),
    )
    request_id = create.json()["id"]
    resp = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_OTHER_DEPUTY_UUID),
    )
    assert resp.status_code == 200


async def test_admin_unrestricted_by_division(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_OTHER_DIVISION_UUID),
    )
    request_id = create.json()["id"]
    resp = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="Admin", linked_id=STAFF_ADMIN_UUID),
    )
    assert resp.status_code == 200


# ── rejection reason ─────────────────────────────────────────────────────


async def test_rejection_reason_round_trips(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    request_id = create.json()["id"]
    reject = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "rejected", "rejectionReason": "Insufficient cover available."},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert reject.status_code == 200, reject.text
    assert reject.json()["rejectionReason"] == "Insufficient cover available."

    get_resp = await client.get(
        f"/leave-requests/{request_id}",
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert get_resp.json()["rejectionReason"] == "Insufficient cover available."


# ── audit log ────────────────────────────────────────────────────────────


async def test_approve_writes_audit_log(client: AsyncClient, db_session: AsyncSession) -> None:
    request_id = await _create_and_approve(client)

    rows = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.action == "LEAVE_DECIDED",
                    AuditLog.target_id == request_id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    after = rows[0].after
    assert after is not None
    assert after["status"] == "approved"


async def test_cancel_does_not_write_audit_log(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    request_id = create.json()["id"]
    await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "cancelled"},
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.target_id == request_id)))
        .scalars()
        .all()
    )
    assert rows == []


# ── Casual leave balance ─────────────────────────────────────────────────


async def test_balance_reflects_approved_casual_days(client: AsyncClient) -> None:
    # 5-day inclusive Casual leave (Feb 1-5).
    await _create_and_approve(client)

    resp = await client.get(
        f"/leave-requests/balance/{STAFF_REQUESTER_UUID}",
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["entitlementDays"] == 21
    assert body["usedDays"] == 5
    assert body["remainingDays"] == 16


async def test_balance_ignores_non_casual_and_unapproved(client: AsyncClient) -> None:
    # Approved Sick leave — doesn't count toward the Casual balance.
    create_sick = await client.post(
        "/leave-requests",
        json=_casual_body(type="Sick"),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    await client.patch(
        f"/leave-requests/{create_sick.json()['id']}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    # Pending Casual leave — not yet approved, doesn't count.
    await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )

    resp = await client.get(
        f"/leave-requests/balance/{STAFF_REQUESTER_UUID}",
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    assert resp.json()["usedDays"] == 0


async def test_teacher_cannot_view_others_balance(client: AsyncClient) -> None:
    resp = await client.get(
        f"/leave-requests/balance/{STAFF_OTHER_DIVISION_UUID}",
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    assert resp.status_code == 403


async def test_deputy_cannot_view_other_divisions_balance(client: AsyncClient) -> None:
    resp = await client.get(
        f"/leave-requests/balance/{STAFF_OTHER_DIVISION_UUID}",
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert resp.status_code == 403


# ── substitute assignment ────────────────────────────────────────────────


async def test_assign_and_clear_substitute(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    request_id = create.json()["id"]

    assign = await client.patch(
        f"/leave-requests/{request_id}/substitute",
        json={"substituteStaffId": str(STAFF_SUBSTITUTE_UUID)},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert assign.status_code == 200, assign.text
    assert assign.json()["substituteStaffId"] == str(STAFF_SUBSTITUTE_UUID)
    assert assign.json()["substituteStaffName"] == "Yaa Substitute"

    clear = await client.patch(
        f"/leave-requests/{request_id}/substitute",
        json={"substituteStaffId": None},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert clear.status_code == 200
    assert clear.json()["substituteStaffId"] is None


async def test_teacher_cannot_assign_substitute(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    request_id = create.json()["id"]
    resp = await client.patch(
        f"/leave-requests/{request_id}/substitute",
        json={"substituteStaffId": str(STAFF_SUBSTITUTE_UUID)},
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    assert resp.status_code == 403


async def test_deputy_cannot_assign_substitute_other_division(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_OTHER_DIVISION_UUID),
    )
    request_id = create.json()["id"]
    resp = await client.patch(
        f"/leave-requests/{request_id}/substitute",
        json={"substituteStaffId": str(STAFF_SUBSTITUTE_UUID)},
        headers=auth_header(role="DeputyHead", linked_id=STAFF_APPROVER_UUID),
    )
    assert resp.status_code == 403


# ── document URLs ────────────────────────────────────────────────────────


async def test_document_urls_round_trip(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(documentUrls=["leave/documents/x/note.pdf"]),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    assert create.status_code == 201, create.text
    assert create.json()["documentUrls"] == ["leave/documents/x/note.pdf"]


async def test_document_urls_default_empty(client: AsyncClient) -> None:
    create = await client.post(
        "/leave-requests",
        json=_casual_body(),
        headers=auth_header(role="Teacher", linked_id=STAFF_REQUESTER_UUID),
    )
    assert create.json()["documentUrls"] == []
