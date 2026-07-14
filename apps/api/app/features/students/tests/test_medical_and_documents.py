"""HTTP tests for student medical info and documents (Phase 6 item 1).

Covers the access gates that are the whole point of splitting these
off from the ungated `GET /students/{id}`: medical is viewable by
Admin/Deputy(own division)/Teacher(teaches the class)/own-parent, and
editable by Admin/own-parent only; documents are viewable by
Admin/Deputy(own division)/own-parent and uploaded/deleted by Admin
only.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.students.tests.conftest import CLASS_UUID, SCHOOL_UUID, auth_header

STUDENT_UUID = UUID("55555555-5555-4555-8555-555555555d01")

ADMIN_STAFF_UUID = UUID("55555555-5555-4555-8555-555555555d10")
DEPUTY_JHS_UUID = UUID("55555555-5555-4555-8555-555555555d11")
DEPUTY_KG_UUID = UUID("55555555-5555-4555-8555-555555555d12")
TEACHER_ASSIGNED_UUID = UUID("55555555-5555-4555-8555-555555555d13")
TEACHER_UNASSIGNED_UUID = UUID("55555555-5555-4555-8555-555555555d14")

GUARDIAN_UUID = UUID("55555555-5555-4555-8555-555555555d20")
OTHER_GUARDIAN_UUID = UUID("55555555-5555-4555-8555-555555555d21")


@pytest_asyncio.fixture
async def seed_profile_depth(
    db_session: AsyncSession, seed_school: School, seed_class: Class
) -> None:
    _ = (seed_school, seed_class)
    db_session.add_all(
        [
            Student(
                id=STUDENT_UUID,
                slug="STU-MED-001",
                school_id=SCHOOL_UUID,
                first_name="Abena",
                last_name="Owusu",
                is_active=True,
            ),
            Staff(
                id=ADMIN_STAFF_UUID,
                slug="STAFF-MED-ADMIN",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Admin",
                system_role="Admin",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_JHS_UUID,
                slug="STAFF-MED-DHJ",
                school_id=SCHOOL_UUID,
                first_name="Yaa",
                last_name="DeputyJhs",
                system_role="DeputyHead",
                division="JHS",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_KG_UUID,
                slug="STAFF-MED-DHK",
                school_id=SCHOOL_UUID,
                first_name="Kwesi",
                last_name="DeputyKg",
                system_role="DeputyHead",
                division="KG",
                is_active=True,
            ),
            Staff(
                id=TEACHER_ASSIGNED_UUID,
                slug="STAFF-MED-TCH-A",
                school_id=SCHOOL_UUID,
                first_name="Adjoa",
                last_name="Teaches",
                system_role="Teacher",
                division="JHS",
                is_active=True,
            ),
            Staff(
                id=TEACHER_UNASSIGNED_UUID,
                slug="STAFF-MED-TCH-B",
                school_id=SCHOOL_UUID,
                first_name="Kofi",
                last_name="Elsewhere",
                system_role="Teacher",
                division="JHS",
                is_active=True,
            ),
            Guardian(
                id=GUARDIAN_UUID,
                slug="GRD-MED-1",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Owusu",
                email="ama.owusu.med@example.com",
            ),
            Guardian(
                id=OTHER_GUARDIAN_UUID,
                slug="GRD-MED-2",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Other",
                email="kojo.other.med@example.com",
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Enrollment(
                student_id=STUDENT_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            ClassTeacher(class_id=CLASS_UUID, staff_id=TEACHER_ASSIGNED_UUID, is_primary=True),
            StudentGuardian(student_id=STUDENT_UUID, guardian_id=GUARDIAN_UUID, is_primary=True),
        ]
    )
    await db_session.flush()


# ── medical ──────────────────────────────────────────────────────────────


async def test_admin_can_view_and_edit_medical(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    patch = await client.patch(
        f"/students/{STUDENT_UUID}/medical",
        json={"bloodType": "O+", "medicalNotes": "Peanut allergy"},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_STAFF_UUID)),
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["bloodType"] == "O+"
    assert patch.json()["medicalNotes"] == "Peanut allergy"

    get = await client.get(
        f"/students/{STUDENT_UUID}/medical",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_STAFF_UUID)),
    )
    assert get.status_code == 200
    assert get.json()["bloodType"] == "O+"


async def test_deputy_own_division_can_view_but_not_edit_medical(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    get = await client.get(
        f"/students/{STUDENT_UUID}/medical",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert get.status_code == 200

    patch = await client.patch(
        f"/students/{STUDENT_UUID}/medical",
        json={"bloodType": "A+"},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert patch.status_code == 403


async def test_deputy_other_division_forbidden_medical(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/medical",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_KG_UUID)),
    )
    assert res.status_code == 403


async def test_teacher_assigned_to_class_can_view_medical(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/medical",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_ASSIGNED_UUID)),
    )
    assert res.status_code == 200


async def test_teacher_not_assigned_forbidden_medical(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/medical",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UNASSIGNED_UUID)),
    )
    assert res.status_code == 403


async def test_parent_can_view_and_edit_own_childs_medical(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    patch = await client.patch(
        f"/students/{STUDENT_UUID}/medical",
        json={"emergencyContactName": "Auntie Efua", "emergencyContactPhone": "+233241110001"},
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_UUID)),
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["emergencyContactName"] == "Auntie Efua"

    get = await client.get(
        f"/students/{STUDENT_UUID}/medical",
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_UUID)),
    )
    assert get.status_code == 200


async def test_parent_forbidden_for_unrelated_childs_medical(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/medical",
        headers=auth_header(role="Parent", linked_id=str(OTHER_GUARDIAN_UUID)),
    )
    assert res.status_code == 403

    patch = await client.patch(
        f"/students/{STUDENT_UUID}/medical",
        json={"bloodType": "A+"},
        headers=auth_header(role="Parent", linked_id=str(OTHER_GUARDIAN_UUID)),
    )
    assert patch.status_code == 403


# ── documents ────────────────────────────────────────────────────────────


async def test_admin_can_upload_list_and_delete_document(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    upload = await client.post(
        f"/students/{STUDENT_UUID}/documents",
        json={"label": "Birth Certificate", "storagePath": "students/documents/x/y.pdf"},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_STAFF_UUID)),
    )
    assert upload.status_code == 201, upload.text
    docs = upload.json()
    assert len(docs) == 1
    assert docs[0]["label"] == "Birth Certificate"
    assert docs[0]["uploadedByName"] == "Kojo Admin"
    document_id = docs[0]["id"]

    listed = await client.get(
        f"/students/{STUDENT_UUID}/documents",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_STAFF_UUID)),
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    deleted = await client.delete(
        f"/students/{STUDENT_UUID}/documents/{document_id}",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_STAFF_UUID)),
    )
    assert deleted.status_code == 200
    assert deleted.json() == []


async def test_other_label_required_when_label_is_other(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.post(
        f"/students/{STUDENT_UUID}/documents",
        json={"label": "Other", "storagePath": "students/documents/x/y.pdf"},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_STAFF_UUID)),
    )
    assert res.status_code == 422


async def test_other_label_forbidden_unless_label_is_other(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.post(
        f"/students/{STUDENT_UUID}/documents",
        json={
            "label": "Birth Certificate",
            "otherLabel": "Not allowed here",
            "storagePath": "students/documents/x/y.pdf",
        },
        headers=auth_header(role="Admin", linked_id=str(ADMIN_STAFF_UUID)),
    )
    assert res.status_code == 422


async def test_deputy_can_view_documents_but_not_upload(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    listed = await client.get(
        f"/students/{STUDENT_UUID}/documents",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert listed.status_code == 200

    upload = await client.post(
        f"/students/{STUDENT_UUID}/documents",
        json={"label": "Ghana Card", "storagePath": "students/documents/x/y.pdf"},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert upload.status_code == 403


async def test_teacher_assigned_to_class_can_view_documents(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    """A Teacher who class-teaches or subject-teaches the student's
    current class can view documents — same gate `_assert_can_view_medical`
    already used, extended to `_assert_can_view_student`."""
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/documents",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_ASSIGNED_UUID)),
    )
    assert res.status_code == 200


async def test_teacher_not_assigned_forbidden_documents(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/documents",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UNASSIGNED_UUID)),
    )
    assert res.status_code == 403


async def test_teacher_assigned_to_class_can_view_guardians(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/guardians",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_ASSIGNED_UUID)),
    )
    assert res.status_code == 200


async def test_teacher_not_assigned_forbidden_guardians(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/guardians",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UNASSIGNED_UUID)),
    )
    assert res.status_code == 403


async def test_teacher_assigned_to_class_can_view_siblings(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/siblings",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_ASSIGNED_UUID)),
    )
    assert res.status_code == 200


async def test_teacher_not_assigned_forbidden_siblings(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/siblings",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UNASSIGNED_UUID)),
    )
    assert res.status_code == 403


async def test_parent_can_view_own_childs_documents(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/documents",
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_UUID)),
    )
    assert res.status_code == 200


async def test_parent_forbidden_for_unrelated_childs_documents(
    client: AsyncClient, seed_profile_depth: None
) -> None:
    _ = seed_profile_depth
    res = await client.get(
        f"/students/{STUDENT_UUID}/documents",
        headers=auth_header(role="Parent", linked_id=str(OTHER_GUARDIAN_UUID)),
    )
    assert res.status_code == 403
