"""End-to-end tests for the Reports router.

Coverage groups:
  1. School stats — Admin gate, totals, gender, per-division, lesson
     plans by status, exams, today's attendance
  2. Division stats — role gate (Deputy of matching division), attendance
     last-7, lesson-plan collapse, top classes ordered by aggregate
  3. Class stats — role gate (Admin/DH/class teacher/subject teacher),
     subject averages, attendance last-7
  4. PSC report — Admin gate, class rows, staff by division + Cross
     sentinel
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.features.reports.tests.conftest import (
    ADMIN_STAFF,
    ADMIN_USER,
    CLASS_JHS1,
    CLASS_KG1,
    DEPUTY_JHS_STAFF,
    DEPUTY_JHS_USER,
    DEPUTY_KG_STAFF,
    DEPUTY_KG_USER,
    FOREIGN_TEACHER_STAFF,
    FOREIGN_TEACHER_USER,
    TEACHER_JHS_STAFF,
    TEACHER_JHS_USER,
    auth_header,
)

pytestmark = pytest.mark.asyncio


# ─── School stats ─────────────────────────────────────────────────────────


async def test_school_stats_admin(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/reports/school",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert res.status_code == 200, res.text
    body = res.json()

    # Totals: 4 active + 1 inactive = 5 students; 5 staff total (all
    # active); 3 classes; 2 subjects; 1 distinct guardian.
    assert body["totals"]["students"] == 5
    assert body["totals"]["activeStudents"] == 4
    assert body["totals"]["inactiveStudents"] == 1
    assert body["totals"]["staff"] == 5
    assert body["totals"]["activeStaff"] == 5
    assert body["totals"]["classes"] == 3
    assert body["totals"]["subjects"] == 2
    assert body["totals"]["parents"] == 1

    # Gender totals over ACTIVE students only.
    assert body["gender"]["male"] == 2
    assert body["gender"]["female"] == 2

    # Lesson plans: 1 draft, 1 submitted, 0 unit-head-approved,
    # 1 approved, 0 rejected.
    assert body["lessonPlans"]["draft"] == 1
    assert body["lessonPlans"]["submitted"] == 1
    assert body["lessonPlans"]["unitHeadApproved"] == 0
    assert body["lessonPlans"]["approved"] == 1
    assert body["lessonPlans"]["rejected"] == 0

    # Exams: 1 total, 1 published.
    assert body["exams"]["total"] == 1
    assert body["exams"]["published"] == 1

    # Today's attendance: 1 session recorded / 3 classes.
    assert body["todayAttendance"]["sessionsRecorded"] == 1
    assert body["todayAttendance"]["classes"] == 3


async def test_school_stats_teacher_403(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/reports/school",
        headers=auth_header(role="Teacher", user_id=TEACHER_JHS_USER, linked_id=TEACHER_JHS_STAFF),
    )
    assert res.status_code == 403


async def test_school_stats_division_totals_shape(client: AsyncClient, seed: None) -> None:
    """Divisions field should carry every canonical division (4 in the
    school-structure list) with a fully populated `DivisionTotals`
    shape."""
    _ = seed
    res = await client.get(
        "/reports/school",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    body = res.json()
    divisions = {d["division"]: d for d in body["divisions"]}
    assert set(divisions.keys()) == {
        "KG",
        "Lower Primary",
        "Upper Primary",
        "JHS",
    }
    # JHS has 4 students (2 boys / 2 girls) enrolled in JHS 1.
    assert divisions["JHS"]["students"] == 4
    assert divisions["JHS"]["male"] == 2
    assert divisions["JHS"]["female"] == 2
    # 2 JHS classes, 2 JHS deputy divisions -- wait, staff.division is
    # JHS for both the DH and the two teachers → 3 JHS staff.
    assert divisions["JHS"]["classes"] == 2
    assert divisions["JHS"]["staff"] == 3
    # KG has one class and its own DH.
    assert divisions["KG"]["classes"] == 1
    assert divisions["KG"]["staff"] == 1


# ─── Division stats ───────────────────────────────────────────────────────


async def test_division_stats_deputy_ok(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/reports/division/JHS",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["division"] == "JHS"
    assert body["students"] == 4
    assert len(body["attendanceLast7"]) == 7
    # Lesson plans on JHS classes: 1 draft, 1 submitted, 1 approved,
    # 0 rejected. `unit_head_approved` folds into `approved` — 1 here.
    assert body["lessonPlans"]["draft"] == 1
    assert body["lessonPlans"]["submitted"] == 1
    assert body["lessonPlans"]["approved"] == 1
    assert body["lessonPlans"]["rejected"] == 0
    # Top classes: JHS 1 has scores, JHS 2 doesn't → JHS 2 sorts last.
    assert [c["className"] for c in body["topClasses"]] == ["JHS 1", "JHS 2"]
    # JHS 2 has no scores → null aggregate.
    assert body["topClasses"][1]["aggregateAvg"] is None
    # JHS 1 aggregate: (1+2)=3 for M1, 4 for M2, 5 for F1 → avg 4.0
    assert body["topClasses"][0]["aggregateAvg"] == 4.0


async def test_division_stats_wrong_division_403(client: AsyncClient, seed: None) -> None:
    """KG Deputy tries to view JHS → 403."""
    _ = seed
    res = await client.get(
        "/reports/division/JHS",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_KG_USER,
            linked_id=DEPUTY_KG_STAFF,
        ),
    )
    assert res.status_code == 403


async def test_division_stats_admin_ok(client: AsyncClient, seed: None) -> None:
    """Admin sees any division — no division match check."""
    _ = seed
    res = await client.get(
        "/reports/division/KG",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert res.status_code == 200


# ─── Class stats ──────────────────────────────────────────────────────────


async def test_class_stats_teacher_ok(client: AsyncClient, seed: None) -> None:
    """The class teacher can view."""
    _ = seed
    res = await client.get(
        f"/reports/class/{CLASS_JHS1}",
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_JHS_USER,
            linked_id=TEACHER_JHS_STAFF,
        ),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["className"] == "JHS 1"
    assert body["students"] == 4
    assert len(body["attendanceLast7"]) == 7
    # Subject averages: Maths has 3 samples (90, 60, 55 → avg 68);
    # English has 1 sample (85 → avg 85).
    by_subject = {s["subjectName"]: s for s in body["subjectAverages"]}
    assert by_subject["Mathematics"]["avg"] == 68
    assert by_subject["Mathematics"]["samples"] == 3
    assert by_subject["English"]["avg"] == 85
    assert by_subject["English"]["samples"] == 1


async def test_class_stats_foreign_teacher_403(client: AsyncClient, seed: None) -> None:
    """A teacher not assigned to the class can't view."""
    _ = seed
    res = await client.get(
        f"/reports/class/{CLASS_JHS1}",
        headers=auth_header(
            role="Teacher",
            user_id=FOREIGN_TEACHER_USER,
            linked_id=FOREIGN_TEACHER_STAFF,
        ),
    )
    assert res.status_code == 403


async def test_class_stats_deputy_of_division_ok(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        f"/reports/class/{CLASS_JHS1}",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert res.status_code == 200


async def test_class_stats_wrong_deputy_403(client: AsyncClient, seed: None) -> None:
    """KG Deputy asking for a JHS class → 403."""
    _ = seed
    res = await client.get(
        f"/reports/class/{CLASS_JHS1}",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_KG_USER,
            linked_id=DEPUTY_KG_STAFF,
        ),
    )
    assert res.status_code == 403


async def test_class_stats_admin_ok(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        f"/reports/class/{CLASS_KG1}",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert res.status_code == 200
    assert res.json()["students"] == 0  # nobody enrolled in KG 1


# ─── PSC report ───────────────────────────────────────────────────────────


async def test_psc_admin_ok(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/reports/psc",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert res.status_code == 200, res.text
    body = res.json()

    # Totals: 4 active students (2 boys / 2 girls), 1 leaver, 2 teachers
    # (Ama + Kojo), 1 admin.
    assert body["totals"]["students"] == 4
    assert body["totals"]["boys"] == 2
    assert body["totals"]["girls"] == 2
    assert body["totals"]["leavers"] == 1
    assert body["totals"]["teachers"] == 2
    assert body["totals"]["admins"] == 1

    # class_rows: only JHS 1 has enrolments (2 boys + 2 girls). KG 1 +
    # JHS 2 are excluded by the join — the GROUP BY has nothing to
    # aggregate.
    class_rows = body["classRows"]
    assert len(class_rows) == 1
    assert class_rows[0]["className"] == "JHS 1"
    assert class_rows[0]["boys"] == 2
    assert class_rows[0]["girls"] == 2
    assert class_rows[0]["total"] == 4

    # staff_by_division: 4 canonical + Cross sentinel = 5 entries.
    divisions_present = {d["division"] for d in body["staffByDivision"]}
    assert divisions_present == {
        "KG",
        "Lower Primary",
        "Upper Primary",
        "JHS",
        "Cross",
    }
    # Cross bucket contains the Admin (no staff.division).
    cross = next(d for d in body["staffByDivision"] if d["division"] == "Cross")
    assert any(s["name"] == "Adae Admin" for s in cross["staff"])


async def test_psc_teacher_403(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/reports/psc",
        headers=auth_header(role="Teacher", user_id=TEACHER_JHS_USER, linked_id=TEACHER_JHS_STAFF),
    )
    assert res.status_code == 403
