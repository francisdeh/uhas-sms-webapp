"""Tests for Phase 6 item 5 — report card polish.

Covers all five sub-features: KG observational variant, conduct/co-
curricular fields, class-average comparison, batch print (service-level
— the Inngest job itself opens its own `SessionLocal`, so per the
`fees/tests/test_jobs.py` precedent only registration/trigger-shape is
tested here, not an end-to-end run), and the results-published email +
in-app notification (mirrors `lesson_plans/tests/test_rejection_email.py`
exactly — monkeypatch `inngest_client.send`, assert gating + payload).

Reuses `test_report_card.py`'s `seed_actors` fixture graph: `CLASS_UUID`
(JHS) with `STUDENT_A_UUID`/`STUDENT_B_UUID`/`STUDENT_C_UUID`,
`OTHER_CLASS_UUID` (KG) with `OTHER_STUDENT_UUID`, `GUARDIAN_UUID`
(primary guardian of `STUDENT_A_UUID`).
"""

from __future__ import annotations

from uuid import UUID

import inngest
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.exams.jobs.report_card_batch import report_card_batch_job
from app.features.exams.jobs.results_published_email import results_published_email_job
from app.features.exams.model import ReportCardBatchJob, StudentReportRemark
from app.features.exams.tests.conftest import (
    CLASS_TEACHER_A_UUID,
    CLASS_UUID,
    GUARDIAN_UUID,
    OTHER_STUDENT_UUID,
    SCHOOL_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    SUBJECT_UUID,
    FakeStorageClient,
    _seed_exam,
    _seed_score,
    auth_header,
)
from app.features.notifications.model import Notification
from app.features.schools.model import School
from app.features.students.model import StudentGuardian
from app.features.users.model import User, UserPreferences
from app.main import app  # noqa: F401 — force router registration

GUARDIAN_USER_UUID = UUID("80808080-8080-4808-8808-080808080901")


def _url(student_id: UUID, exam_id: UUID) -> str:
    return f"/students/{student_id}/report-card?examId={exam_id}"


@pytest_asyncio.fixture
async def seed_guardian_user(db_session: AsyncSession, seed_actors: None) -> User:
    _ = seed_actors
    user = User(
        id=GUARDIAN_USER_UUID,
        school_id=SCHOOL_UUID,
        email="efua.rc@example.com",
        role="Parent",
        linked_id=GUARDIAN_UUID,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


class _FakeSend:
    def __init__(self, *, raises: bool = False) -> None:
        self.raises = raises
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        if self.raises:
            raise ConnectionError("simulated: no dev server reachable")
        return ["evt_fake"]


# ─── KG observational variant ────────────────────────────────────────────────


async def test_kg_student_gets_observations_not_scores(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=OTHER_STUDENT_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    db_session.add(
        StudentReportRemark(
            exam_id=exam.id,
            student_id=OTHER_STUDENT_UUID,
            kg_observations={"language": "Excellent", "numeracy": "Good"},
        )
    )
    await db_session.flush()

    res = await client.get(_url(OTHER_STUDENT_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["scores"] == []
    assert body["kgObservations"] == {"language": "Excellent", "numeracy": "Good"}


async def test_kg_student_pdf_renders_without_error(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    """The KG-branch template path (kg_observations table, no scores
    grid) is real Jinja/WeasyPrint rendering, not just JSON — smoke-test
    it actually produces PDF bytes."""
    exam = await _seed_exam(db_session)
    db_session.add(
        StudentReportRemark(
            exam_id=exam.id,
            student_id=OTHER_STUDENT_UUID,
            kg_observations={"language": "Excellent"},
            conduct_ratings={"punctuality": "Good"},
            interests_co_curricular="Storytelling.",
        )
    )
    await db_session.flush()

    res = await client.get(
        f"/students/{OTHER_STUDENT_UUID}/report-card/pdf?examId={exam.id}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code in (302, 307), res.text
    assert len(fake_storage.uploads) == 1
    assert fake_storage.uploads[0][2][:4] == b"%PDF"


async def test_non_kg_student_kg_observations_always_null(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session)
    db_session.add(
        StudentReportRemark(
            exam_id=exam.id,
            student_id=STUDENT_A_UUID,
            kg_observations={"language": "Excellent"},
        )
    )
    await db_session.flush()

    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    assert res.json()["kgObservations"] is None


# ─── Conduct / co-curricular ─────────────────────────────────────────────────


async def test_conduct_and_interests_included_for_any_division(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session)
    db_session.add(
        StudentReportRemark(
            exam_id=exam.id,
            student_id=STUDENT_A_UUID,
            conduct_ratings={"punctuality": "Excellent", "neatness": "Good"},
            interests_co_curricular="Debate club, football.",
        )
    )
    await db_session.flush()

    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["conductRatings"] == {"punctuality": "Excellent", "neatness": "Good"}
    assert body["interestsCoCurricular"] == "Debate club, football."


async def test_draft_save_round_trips_kg_and_conduct_fields(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session, is_published=False)
    payload = {
        "hosComment": None,
        "remarks": [
            {
                "studentId": str(STUDENT_A_UUID),
                "text": "Good term.",
                "conductRatings": {"punctuality": "Excellent"},
                "kgObservations": {"language": "Good"},
                "interestsCoCurricular": "Chess club.",
            },
        ],
    }
    res = await client.put(
        f"/exams/{exam.id}/class-reports/{CLASS_UUID}/draft",
        json=payload,
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_A_UUID),
    )
    assert res.status_code == 200, res.text

    remark = (
        await db_session.execute(
            select(StudentReportRemark).where(
                StudentReportRemark.exam_id == exam.id,
                StudentReportRemark.student_id == STUDENT_A_UUID,
            )
        )
    ).scalar_one()
    assert remark.conduct_ratings == {"punctuality": "Excellent"}
    assert remark.kg_observations == {"language": "Good"}
    assert remark.interests_co_curricular == "Chess club."


# ─── Class-average comparison ────────────────────────────────────────────────


async def test_class_average_computed_across_class(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_B_UUID,
        subject_id=SUBJECT_UUID,
        total=60,
        grade="4",
        interpretation="High Average",
    )

    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    row = res.json()["scores"][0]
    assert row["totalScore"] == 80
    assert row["classAverage"] == pytest.approx(70.0)


async def test_class_average_equals_own_score_when_alone(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )

    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    row = res.json()["scores"][0]
    assert row["classAverage"] == pytest.approx(80.0)


# ─── Batch print ──────────────────────────────────────────────────────────────


def test_batch_job_is_registered() -> None:
    assert results_published_email_job.id == "uhas-sms-api-results-published-email"
    assert report_card_batch_job.id == "uhas-sms-api-report-card-batch"
    email_triggers = results_published_email_job.get_config("http://localhost:8000").main.triggers
    assert isinstance(email_triggers[0], inngest.TriggerEvent)
    assert email_triggers[0].event == "email/results-published.requested"
    batch_triggers = report_card_batch_job.get_config("http://localhost:8000").main.triggers
    assert isinstance(batch_triggers[0], inngest.TriggerEvent)
    assert batch_triggers[0].event == "reports/report-card.batch.requested"


async def test_request_batch_creates_pending_job_and_emits_event(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
) -> None:
    _ = db_session
    exam = await _seed_exam(db_session)
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/exams/{exam.id}/classes/{CLASS_UUID}/report-cards/batch",
        headers=auth_header(role="Admin", linked_id=CLASS_TEACHER_A_UUID),
    )
    assert res.status_code == 202, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["downloadUrl"] is None

    assert len(fake_send.events) == 1
    event = fake_send.events[0]
    assert event.name == "reports/report-card.batch.requested"
    assert event.data["exam_id"] == str(exam.id)
    assert event.data["class_id"] == str(CLASS_UUID)


async def test_get_batch_status_returns_download_url_once_complete(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session)
    job = ReportCardBatchJob(
        school_id=SCHOOL_UUID,
        exam_id=exam.id,
        class_id=CLASS_UUID,
        requested_by_staff_id=CLASS_TEACHER_A_UUID,
        status="complete",
        storage_path="report-card-batches/x/y/z.zip",
    )
    db_session.add(job)
    await db_session.flush()

    res = await client.get(
        f"/exams/{exam.id}/classes/{CLASS_UUID}/report-cards/batch",
        headers=auth_header(role="Admin", linked_id=CLASS_TEACHER_A_UUID),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "complete"
    assert body["downloadUrl"] is not None


async def test_get_batch_status_404_when_never_requested(
    client: AsyncClient, db_session: AsyncSession, seed_actors: None
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        f"/exams/{exam.id}/classes/{CLASS_UUID}/report-cards/batch",
        headers=auth_header(role="Admin", linked_id=CLASS_TEACHER_A_UUID),
    )
    assert res.status_code == 404


# ─── Results-published email + in-app notification ──────────────────────────


async def test_publish_notifies_and_emails_primary_guardian(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
    seed_guardian_user: User,
) -> None:
    exam = await _seed_exam(db_session, is_published=False)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(f"/exams/{exam.id}/publish", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text

    notifs = (
        (
            await db_session.execute(
                select(Notification).where(Notification.user_id == seed_guardian_user.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(notifs) == 1
    assert notifs[0].kind == "results_published"

    assert len(fake_send.events) == 1
    event = fake_send.events[0]
    assert event.name == "email/results-published.requested"
    assert event.data["guardian_email"] == "efua.rc@example.com"
    assert event.data["child_names"] == ["Ama Adjei"]


async def test_publish_batches_multiple_children_into_one_email(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
    seed_guardian_user: User,
) -> None:
    """Same guardian is also primary for STUDENT_B — one email, two names."""
    db_session.add(
        StudentGuardian(
            student_id=STUDENT_B_UUID,
            guardian_id=GUARDIAN_UUID,
            relation="mother",
            is_primary=True,
        )
    )
    exam = await _seed_exam(db_session, is_published=False)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_B_UUID,
        subject_id=SUBJECT_UUID,
        total=60,
        grade="4",
        interpretation="High Average",
    )
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(f"/exams/{exam.id}/publish", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text

    assert len(fake_send.events) == 1
    child_names = fake_send.events[0].data["child_names"]
    assert isinstance(child_names, list)
    assert set(child_names) == {"Ama Adjei", "Kojo Boateng"}


async def test_publish_skips_students_with_no_scores_or_observations(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
    seed_guardian_user: User,
) -> None:
    exam = await _seed_exam(db_session, is_published=False)
    # No score / kg_observations rows for anyone.
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(f"/exams/{exam.id}/publish", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    assert fake_send.events == []


async def test_publish_skips_email_when_school_default_is_off_but_still_notifies_in_app(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
    seed_guardian_user: User,
) -> None:
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_results_published": False}
    await db_session.flush()

    exam = await _seed_exam(db_session, is_published=False)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(f"/exams/{exam.id}/publish", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    assert fake_send.events == []

    notifs = (
        (
            await db_session.execute(
                select(Notification).where(Notification.user_id == seed_guardian_user.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(notifs) == 1


async def test_publish_skips_email_when_guardian_opted_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
    seed_guardian_user: User,
) -> None:
    db_session.add(UserPreferences(user_id=GUARDIAN_USER_UUID, email_on_results_published=False))
    exam = await _seed_exam(db_session, is_published=False)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(f"/exams/{exam.id}/publish", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    assert fake_send.events == []


async def test_publish_succeeds_even_if_event_emission_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
    seed_guardian_user: User,
) -> None:
    exam = await _seed_exam(db_session, is_published=False)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    fake_send = _FakeSend(raises=True)
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(f"/exams/{exam.id}/publish", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    assert res.json()["isPublished"] is True
    assert len(fake_send.events) == 1  # it did try


async def test_publish_skips_guardian_with_no_app_user(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_actors: None,
) -> None:
    """No `seed_guardian_user` fixture here — the guardian has no linked
    `users` row, so there's nobody to notify at all (not even in-app)."""
    exam = await _seed_exam(db_session, is_published=False)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=80,
        grade="2",
        interpretation="Higher",
    )
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(f"/exams/{exam.id}/publish", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    assert fake_send.events == []

    remaining = (await db_session.execute(select(Notification))).scalars().all()
    assert remaining == []


def test_results_published_email_job_sends_via_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pure "send what I'm told" handler — no DB access, same coverage
    shape as `lesson_plans/jobs/rejection_email.py`'s own tests."""
    from inngest.experimental import mocked

    from app.integrations.email.provider import EmailMessage, EmailResult

    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.exams.jobs.results_published_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/results-published.requested",
        data={
            "guardian_email": "efua.rc@example.com",
            "exam_name": "Term 2 End of Term",
            "child_names": ["Ama Adjei", "Kojo Boateng"],
            "link": "/parent/results",
        },
    )
    client_mock = mocked.Inngest(app_id="test")
    res = mocked.trigger(results_published_email_job, event, client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "efua.rc@example.com"
    assert "Ama Adjei and Kojo Boateng" in sent[0].text
