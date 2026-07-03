"""Tests for the report-card generation jobs (stubs — see module
docstrings in `report_generate.py`/`report_batch.py`).

Neither job touches the DB, so — like the lesson-plan-rejection email
job — they're safe to run end-to-end via `mocked.trigger`. Storage is
injected with a fake rather than relying on `get_storage_client()`'s
environment-dependent resolution (`SUPABASE_SERVICE_ROLE_KEY` may or
may not be set locally vs in CI — a real dependency would make these
tests non-deterministic across environments).
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.reports.jobs import REPORTS_JOBS
from app.features.reports.jobs.report_batch import report_batch_job
from app.features.reports.jobs.report_generate import (
    _generate_one,
    report_card_storage_path,
    report_generate_job,
)
from app.integrations.storage import Bucket

_client_mock = mocked.Inngest(app_id="test")


class _FakeStorageClient:
    def __init__(self) -> None:
        self.uploads: list[tuple[Bucket, str, bytes]] = []

    async def upload(
        self,
        bucket: Bucket,
        path: str,
        data: bytes,
        *,
        content_type: str | None = None,
        upsert: bool = False,
    ) -> None:
        self.uploads.append((bucket, path, data))

    async def get_public_url(self, bucket: Bucket, path: str) -> str:
        raise NotImplementedError

    async def get_signed_url(self, bucket: Bucket, path: str, *, ttl_seconds: int = 3600) -> str:
        raise NotImplementedError


def test_report_card_storage_path_is_deterministic() -> None:
    a = report_card_storage_path(school_id="s1", exam_id="e1", student_id="st1")
    b = report_card_storage_path(school_id="s1", exam_id="e1", student_id="st1")
    assert a == b == "report-cards/s1/e1/st1.pdf"


async def test_generate_one_uploads_a_placeholder_to_documents_bucket() -> None:
    fake = _FakeStorageClient()
    path = await _generate_one(school_id="s1", exam_id="e1", student_id="st1", storage=fake)
    assert path == "report-cards/s1/e1/st1.pdf"
    assert len(fake.uploads) == 1
    bucket, uploaded_path, data = fake.uploads[0]
    assert bucket == "documents"
    assert uploaded_path == path
    assert b"placeholder" in data


def test_jobs_are_registered() -> None:
    assert report_generate_job in REPORTS_JOBS
    assert report_batch_job in REPORTS_JOBS
    assert report_generate_job.id == "uhas-sms-api-report-card-generate"
    assert report_batch_job.id == "uhas-sms-api-report-card-batch"


def test_generate_job_runs_end_to_end(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeStorageClient()
    monkeypatch.setattr(
        "app.features.reports.jobs.report_generate.get_storage_client", lambda: fake
    )
    event = inngest.Event(
        name="reports/report-card.generate.requested",
        data={"school_id": "s1", "exam_id": "e1", "student_id": "st1"},
    )
    res = mocked.trigger(report_generate_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert res.output == {"storage_path": "report-cards/s1/e1/st1.pdf"}
    assert len(fake.uploads) == 1


def test_batch_job_generates_one_per_student(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeStorageClient()
    monkeypatch.setattr(
        "app.features.reports.jobs.report_generate.get_storage_client", lambda: fake
    )
    event = inngest.Event(
        name="reports/report-card.batch.requested",
        data={"school_id": "s1", "exam_id": "e1", "student_ids": ["st1", "st2", "st3"]},
    )
    res = mocked.trigger(report_batch_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert res.output == {
        "generated_count": 3,
        "storage_paths": [
            "report-cards/s1/e1/st1.pdf",
            "report-cards/s1/e1/st2.pdf",
            "report-cards/s1/e1/st3.pdf",
        ],
    }
    assert len(fake.uploads) == 3


def test_batch_job_handles_empty_roster(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeStorageClient()
    monkeypatch.setattr(
        "app.features.reports.jobs.report_generate.get_storage_client", lambda: fake
    )
    event = inngest.Event(
        name="reports/report-card.batch.requested",
        data={"school_id": "s1", "exam_id": "e1", "student_ids": []},
    )
    res = mocked.trigger(report_batch_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert res.output == {"generated_count": 0, "storage_paths": []}
