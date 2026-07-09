"""Integration tests for the Fees router — fee items, roster assignment,
learner fees, payments, and the dashboard summary."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from app.features.fees.tests.conftest import (
    ACADEMIC_YEAR,
    CLASS_JHS1_UUID,
    STUDENT1_UUID,
    STUDENT_JHS2_UUID,
    auth_header,
)

pytestmark = pytest.mark.usefixtures("seed_school", "seed_classes", "seed_staff", "seed_students")


def _school_fee_item(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "PTA Dues",
        "scope": "school",
        "academicYear": ACADEMIC_YEAR,
        "amountMinor": 5000,
    }
    payload.update(overrides)
    return payload


async def test_create_fee_item_school_scope(client: AsyncClient) -> None:
    resp = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["scope"] == "school"
    assert body["scopeDisplay"] == "Whole school"
    assert body["isActive"] is True


async def test_create_fee_item_class_scope(client: AsyncClient) -> None:
    resp = await client.post(
        "/fees/items",
        json=_school_fee_item(name="JHS 1 Excursion", scope="class", scopeRef=str(CLASS_JHS1_UUID)),
        headers=auth_header(),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["scopeDisplay"] == "JHS 1"


async def test_create_fee_item_division_scope(client: AsyncClient) -> None:
    resp = await client.post(
        "/fees/items",
        json=_school_fee_item(name="JHS Textbooks", scope="division", scopeRef="JHS"),
        headers=auth_header(),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["scopeDisplay"] == "JHS"


async def test_create_fee_item_school_scope_rejects_scope_ref(client: AsyncClient) -> None:
    resp = await client.post(
        "/fees/items",
        json=_school_fee_item(scopeRef="JHS"),
        headers=auth_header(),
    )
    assert resp.status_code == 400, resp.text


async def test_create_fee_item_division_scope_requires_valid_division(client: AsyncClient) -> None:
    resp = await client.post(
        "/fees/items",
        json=_school_fee_item(scope="division", scopeRef="Nope"),
        headers=auth_header(),
    )
    assert resp.status_code == 400, resp.text


async def test_create_fee_item_class_scope_requires_real_class(client: AsyncClient) -> None:
    resp = await client.post(
        "/fees/items",
        json=_school_fee_item(scope="class", scopeRef="00000000-0000-4000-8000-000000000000"),
        headers=auth_header(),
    )
    assert resp.status_code == 400, resp.text


async def test_non_accountant_cannot_create_fee_item(client: AsyncClient) -> None:
    resp = await client.post(
        "/fees/items", json=_school_fee_item(), headers=auth_header(role="Teacher")
    )
    assert resp.status_code == 403


async def test_admin_can_create_fee_item(client: AsyncClient) -> None:
    resp = await client.post(
        "/fees/items", json=_school_fee_item(), headers=auth_header(role="Admin", linked_id=None)
    )
    assert resp.status_code == 201, resp.text


async def test_get_list_and_update_fee_item(client: AsyncClient) -> None:
    create = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    item_id = create.json()["id"]

    fetched = await client.get(f"/fees/items/{item_id}", headers=auth_header())
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["id"] == item_id

    listed = await client.get("/fees/items", headers=auth_header())
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    updated = await client.patch(
        f"/fees/items/{item_id}", json={"amountMinor": 7500}, headers=auth_header()
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["amountMinor"] == 7500


async def test_get_fee_item_not_found(client: AsyncClient) -> None:
    resp = await client.get(
        "/fees/items/00000000-0000-4000-8000-000000000000", headers=auth_header()
    )
    assert resp.status_code == 404


async def test_assign_school_scope_covers_every_active_student(client: AsyncClient) -> None:
    create = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    item_id = create.json()["id"]

    resp = await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["createdCount"] == 3
    assert body["alreadyAssignedCount"] == 0
    assert len(body["learnerFees"]) == 3
    assert all(lf["status"] == "outstanding" for lf in body["learnerFees"])
    assert all(lf["balanceMinor"] == 5000 for lf in body["learnerFees"])


async def test_assign_class_scope_only_covers_that_class(client: AsyncClient) -> None:
    create = await client.post(
        "/fees/items",
        json=_school_fee_item(scope="class", scopeRef=str(CLASS_JHS1_UUID)),
        headers=auth_header(),
    )
    item_id = create.json()["id"]

    resp = await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["createdCount"] == 2  # student1 + student2, not student_jhs2
    student_ids = {lf["studentId"] for lf in body["learnerFees"]}
    assert str(STUDENT_JHS2_UUID) not in student_ids


async def test_assign_is_idempotent(client: AsyncClient) -> None:
    create = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    item_id = create.json()["id"]

    first = await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())
    assert first.json()["createdCount"] == 3

    second = await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())
    assert second.json()["createdCount"] == 0
    assert second.json()["alreadyAssignedCount"] == 3


async def test_list_learner_fees_for_fee_item(client: AsyncClient) -> None:
    create = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    item_id = create.json()["id"]
    await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())

    resp = await client.get(f"/fees/items/{item_id}/learner-fees", headers=auth_header())
    assert resp.status_code == 200
    assert len(resp.json()) == 3


async def test_update_learner_fee_amount_recomputes_balance(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)

    resp = await client.patch(
        f"/fees/learner-fees/{learner_fee_id}", json={"amountMinor": 3000}, headers=auth_header()
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["amountMinor"] == 3000
    assert resp.json()["balanceMinor"] == 3000


async def test_waive_learner_fee(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)

    resp = await client.post(f"/fees/learner-fees/{learner_fee_id}/waive", headers=auth_header())
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "waived"
    assert resp.json()["balanceMinor"] == 0


async def test_cannot_edit_a_waived_fee(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)
    await client.post(f"/fees/learner-fees/{learner_fee_id}/waive", headers=auth_header())

    resp = await client.patch(
        f"/fees/learner-fees/{learner_fee_id}", json={"amountMinor": 1000}, headers=auth_header()
    )
    assert resp.status_code == 409


async def test_exclude_learner_fee_without_payments(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)

    resp = await client.delete(f"/fees/learner-fees/{learner_fee_id}", headers=auth_header())
    assert resp.status_code == 204

    get_resp = await client.get(f"/fees/learner-fees/{learner_fee_id}", headers=auth_header())
    assert get_resp.status_code == 404


async def test_exclude_learner_fee_with_payments_conflicts(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)
    await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={"amountMinor": 1000, "method": "cash"},
        headers=auth_header(),
    )

    resp = await client.delete(f"/fees/learner-fees/{learner_fee_id}", headers=auth_header())
    assert resp.status_code == 409


async def test_record_partial_then_full_payment(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)  # amount = 5000

    partial = await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={"amountMinor": 2000, "method": "momo", "reference": "MOMO123"},
        headers=auth_header(),
    )
    assert partial.status_code == 201, partial.text
    assert partial.json()["status"] == "partial"
    assert partial.json()["balanceMinor"] == 3000
    assert len(partial.json()["payments"]) == 1

    full = await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={
            "amountMinor": 3000,
            "method": "cash",
            "receiptFileUrls": ["fees/receipts/a.jpg", "fees/receipts/b.jpg"],
        },
        headers=auth_header(),
    )
    assert full.status_code == 201, full.text
    assert full.json()["status"] == "paid"
    assert full.json()["balanceMinor"] == 0
    assert len(full.json()["payments"]) == 2
    assert full.json()["payments"][1]["receiptFileUrls"] == [
        "fees/receipts/a.jpg",
        "fees/receipts/b.jpg",
    ]
    assert full.json()["payments"][1]["recordedByName"]


async def test_payment_exceeding_balance_rejected(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)  # amount = 5000

    resp = await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={"amountMinor": 6000, "method": "cash"},
        headers=auth_header(),
    )
    assert resp.status_code == 400


async def test_payment_against_waived_fee_conflicts(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)
    await client.post(f"/fees/learner-fees/{learner_fee_id}/waive", headers=auth_header())

    resp = await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={"amountMinor": 1000, "method": "cash"},
        headers=auth_header(),
    )
    assert resp.status_code == 409


async def test_payment_requires_staff_identity(client: AsyncClient) -> None:
    learner_fee_id = await _assign_one(client, student_id=STUDENT1_UUID)

    resp = await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={"amountMinor": 1000, "method": "cash"},
        headers=auth_header(role="Admin", linked_id=None),
    )
    assert resp.status_code == 403


async def test_list_learner_fees_for_school_filters_by_status(client: AsyncClient) -> None:
    create = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    item_id = create.json()["id"]
    assign = await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())
    learner_fee_id = assign.json()["learnerFees"][0]["id"]
    await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={"amountMinor": 5000, "method": "cash"},
        headers=auth_header(),
    )

    paid = await client.get("/fees/learner-fees", params={"status": "paid"}, headers=auth_header())
    assert paid.status_code == 200
    assert paid.json()["total"] == 1

    outstanding = await client.get(
        "/fees/learner-fees", params={"status": "outstanding"}, headers=auth_header()
    )
    assert outstanding.json()["total"] == 2


async def test_summary_reflects_outstanding_and_collected(client: AsyncClient) -> None:
    create = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    item_id = create.json()["id"]
    assign = await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())
    learner_fee_id = assign.json()["learnerFees"][0]["id"]
    await client.post(
        f"/fees/learner-fees/{learner_fee_id}/payments",
        json={"amountMinor": 2000, "method": "cash"},
        headers=auth_header(),
    )

    resp = await client.get("/fees/summary", headers=auth_header())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["totalCollectedMinor"] == 2000
    # 3 students * 5000 = 15000 total; 2000 paid → 13000 outstanding.
    assert body["totalOutstandingMinor"] == 13000
    assert body["activeFeeItemsCount"] == 1


async def _assign_one(client: AsyncClient, *, student_id: object) -> str:
    """Create a school-scope fee item, assign it, and return the
    `learner_fees.id` for the given student."""
    create = await client.post("/fees/items", json=_school_fee_item(), headers=auth_header())
    item_id = create.json()["id"]
    assign = await client.post(f"/fees/items/{item_id}/assign", headers=auth_header())
    match = next(lf for lf in assign.json()["learnerFees"] if lf["studentId"] == str(student_id))
    return str(match["id"])
