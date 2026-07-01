"""HTTP-level tests for /leave-requests."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

from app.features.leave_requests.tests.conftest import (
    STAFF_APPROVER_UUID,
    STAFF_REQUESTER_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff


def _payload() -> dict[str, Any]:
    return {
        "type": "Casual",
        "startDate": "2026-02-10",
        "endDate": "2026-02-12",
        "reason": "Family event",
    }


async def test_create_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/leave-requests", json=_payload())
    assert res.status_code == 401


async def test_create_uses_linked_id_by_default(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    assert res.status_code == 201
    body = res.json()
    assert body["staffId"] == str(STAFF_REQUESTER_UUID)
    assert body["status"] == "pending"
    assert body["staffLastName"] == "Owusu"


async def test_create_rejects_end_before_start(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    bad = {**_payload(), "endDate": "2026-02-01"}
    res = await client.post("/leave-requests", json=bad, headers=auth_header(role="Teacher"))
    assert res.status_code == 422


async def test_teacher_lists_only_own_requests(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    # Requester files, then Admin files on behalf of the approver.
    await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    await client.post(
        "/leave-requests",
        json={**_payload(), "staffId": str(STAFF_APPROVER_UUID)},
        headers=auth_header(role="Admin", linked_id=None),
    )

    listed_teacher = await client.get("/leave-requests", headers=auth_header(role="Teacher"))
    assert listed_teacher.status_code == 200
    items = listed_teacher.json()["items"]
    assert len(items) == 1
    assert items[0]["staffId"] == str(STAFF_REQUESTER_UUID)

    listed_admin = await client.get(
        "/leave-requests", headers=auth_header(role="Admin", linked_id=None)
    )
    assert len(listed_admin.json()["items"]) == 2


async def test_approve_requires_admin_or_deputy(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    created = (
        await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    ).json()
    # Teacher can't approve their own
    res = await client.patch(
        f"/leave-requests/{created['id']}",
        json={"status": "approved"},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 403


async def test_deputy_can_approve(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    created = (
        await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    ).json()
    res = await client.patch(
        f"/leave-requests/{created['id']}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=str(STAFF_APPROVER_UUID)),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "approved"
    assert body["approvedById"] == str(STAFF_APPROVER_UUID)
    assert body["approvedByName"] == "Kwaku Deputy"


async def test_requester_can_cancel(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    created = (
        await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    ).json()
    res = await client.patch(
        f"/leave-requests/{created['id']}",
        json={"status": "cancelled"},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


async def test_others_cannot_cancel_your_request(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    created = (
        await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    ).json()
    # Admin tries to cancel on behalf of teacher → forbidden.
    res = await client.patch(
        f"/leave-requests/{created['id']}",
        json={"status": "cancelled"},
        headers=auth_header(role="Admin", linked_id=str(STAFF_APPROVER_UUID)),
    )
    assert res.status_code == 403


async def test_teacher_cannot_read_another_teachers_leave(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    """IDOR guard on `GET /leave-requests/{id}` — a teacher can't read
    someone else's request even if they know the UUID."""
    _ = (seed_school, seed_staff)
    # Admin files leave on behalf of the approver (a different staff row).
    created = (
        await client.post(
            "/leave-requests",
            json={**_payload(), "staffId": str(STAFF_APPROVER_UUID)},
            headers=auth_header(role="Admin", linked_id=None),
        )
    ).json()

    # Teacher (requester in the fixture) tries to read the approver's request.
    res = await client.get(
        f"/leave-requests/{created['id']}",
        headers=auth_header(role="Teacher", linked_id=str(STAFF_REQUESTER_UUID)),
    )
    assert res.status_code == 403


async def test_teacher_cannot_file_leave_on_behalf_of_another_staff(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    """Impersonation guard on `POST /leave-requests` — a teacher passing
    someone else's staffId gets 403."""
    _ = (seed_school, seed_staff)
    res = await client.post(
        "/leave-requests",
        json={**_payload(), "staffId": str(STAFF_APPROVER_UUID)},
        headers=auth_header(role="Teacher", linked_id=str(STAFF_REQUESTER_UUID)),
    )
    assert res.status_code == 403


async def test_teacher_can_file_leave_with_own_staff_id(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    """Sanity check: passing your own staffId explicitly is allowed."""
    _ = (seed_school, seed_staff)
    res = await client.post(
        "/leave-requests",
        json={**_payload(), "staffId": str(STAFF_REQUESTER_UUID)},
        headers=auth_header(role="Teacher", linked_id=str(STAFF_REQUESTER_UUID)),
    )
    assert res.status_code == 201


async def test_terminal_status_cannot_transition(
    client: AsyncClient, seed_school: School, seed_staff: tuple[Staff, Staff, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    created = (
        await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    ).json()
    await client.patch(
        f"/leave-requests/{created['id']}",
        json={"status": "rejected"},
        headers=auth_header(role="DeputyHead", linked_id=str(STAFF_APPROVER_UUID)),
    )
    # Rejected is terminal — a follow-up attempt to approve should 400.
    res = await client.patch(
        f"/leave-requests/{created['id']}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=str(STAFF_APPROVER_UUID)),
    )
    assert res.status_code == 400
