"""HTTP-level tests for `GET /students/{id}/report-card/pdf?examId=`.

Auth/publish-gate coverage is intentionally thin here — it's the exact
same `ReportCardService.get` call as the JSON endpoint, already
covered exhaustively in `test_report_card.py`. This file focuses on
what's new: the render/upload/cache-hit/cache-bust flow.

Reuses the shared `seed_actors`/`_seed_exam`/`_seed_score` fixtures
from `conftest.py` (also used by `test_report_card.py`) rather than
duplicating the seed graph. `seed_actors` needs no import — it's a
pytest fixture, auto-discovered from conftest by parameter name.
"""

from __future__ import annotations

from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import REPORT_CARD_PDF_LIMIT
from app.features.exams.model import ReportCardPdfCache
from app.features.exams.tests.conftest import (
    GUARDIAN_UUID,
    STUDENT_A_UUID,
    SUBJECT_UUID,
    FakeStorageClient,
    _seed_exam,
    _seed_score,
    auth_header,
)

# `seed_actors` is used as a fixture parameter below — it's a pytest
# fixture auto-discovered from conftest.py by name, no import needed.
from app.main import app  # noqa: F401 — kept to force router registration


def _url(student_id: UUID, exam_id: UUID) -> str:
    return f"/students/{student_id}/report-card/pdf?examId={exam_id}"


async def _cache_row(
    db_session: AsyncSession, exam_id: UUID, student_id: UUID
) -> ReportCardPdfCache | None:
    result = await db_session.execute(
        select(ReportCardPdfCache).where(
            ReportCardPdfCache.exam_id == exam_id,
            ReportCardPdfCache.student_id == student_id,
        )
    )
    return result.scalar_one_or_none()


async def test_missing_auth_returns_401(client: AsyncClient) -> None:
    res = await client.get(_url(STUDENT_A_UUID, UUID("00000000-0000-0000-0000-000000000000")))
    assert res.status_code == 401


async def test_admin_generates_pdf_redirects_and_uploads(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=88,
        grade="2",
        interpretation="Higher",
    )

    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))

    assert res.status_code in (302, 307), res.text
    assert res.headers["location"].endswith("?signed=1")
    assert len(fake_storage.uploads) == 1
    bucket, path, data, content_type = fake_storage.uploads[0]
    assert bucket == "documents"
    assert path == f"report-cards/{exam.school_id}/{exam.id}/{STUDENT_A_UUID}.pdf"
    assert content_type == "application/pdf"
    assert data[:4] == b"%PDF"

    row = await _cache_row(db_session, exam.id, STUDENT_A_UUID)
    assert row is not None
    assert row.storage_path == path


async def test_repeat_download_skips_render(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=88,
        grade="2",
        interpretation="Higher",
    )

    first = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert first.status_code in (302, 307)
    assert len(fake_storage.uploads) == 1

    second = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert second.status_code in (302, 307)
    # Nothing changed since the first request — no re-render, no re-upload.
    assert len(fake_storage.uploads) == 1


async def test_score_change_busts_the_cache(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=60,
        grade="4",
        interpretation="High Average",
    )

    first = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert first.status_code in (302, 307)
    assert len(fake_storage.uploads) == 1
    first_hash = (await _cache_row(db_session, exam.id, STUDENT_A_UUID)).content_hash  # type: ignore[union-attr]

    # A correction after the first download — same subject, new total/grade.
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=95,
        grade="1",
        interpretation="Highest",
    )

    second = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert second.status_code in (302, 307)
    assert len(fake_storage.uploads) == 2
    second_hash = (await _cache_row(db_session, exam.id, STUDENT_A_UUID)).content_hash  # type: ignore[union-attr]
    assert second_hash != first_hash


async def test_full_flag_renders_a_distinct_pdf(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    """`full=true` (component breakdown) is a different render of the same
    data — it must not serve the cached summary PDF, and switching back is
    a cache hit again."""
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=88,
        grade="2",
        interpretation="Higher",
    )

    summary = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert summary.status_code in (302, 307)
    assert len(fake_storage.uploads) == 1
    summary_hash = (await _cache_row(db_session, exam.id, STUDENT_A_UUID)).content_hash  # type: ignore[union-attr]

    full = await client.get(
        f"{_url(STUDENT_A_UUID, exam.id)}&full=true", headers=auth_header(role="Admin")
    )
    assert full.status_code in (302, 307)
    # Different variant → re-render, and a distinct content hash.
    assert len(fake_storage.uploads) == 2
    full_hash = (await _cache_row(db_session, exam.id, STUDENT_A_UUID)).content_hash  # type: ignore[union-attr]
    assert full_hash != summary_hash

    again = await client.get(
        f"{_url(STUDENT_A_UUID, exam.id)}&full=true", headers=auth_header(role="Admin")
    )
    assert again.status_code in (302, 307)
    # Same variant, unchanged data → cache hit, no new upload.
    assert len(fake_storage.uploads) == 2


async def test_parent_cannot_fetch_pdf_for_unpublished_exam(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    exam = await _seed_exam(db_session, is_published=False)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 403
    assert fake_storage.uploads == []


async def test_parent_can_fetch_pdf_for_published_exam(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code in (302, 307), res.text
    assert len(fake_storage.uploads) == 1


async def test_exceeding_the_pdf_rate_limit_returns_429(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    fake_storage: FakeStorageClient,
) -> None:
    """Stricter than the global default given WeasyPrint's cost — see
    app/core/rate_limit.py. Requests beyond the threshold hit the cache
    (see test_repeat_download_skips_render), so this is cheap to run."""
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=70,
        grade="3",
        interpretation="High",
    )
    limit = int(REPORT_CARD_PDF_LIMIT.split("/")[0])
    headers = auth_header(role="Admin")

    for _ in range(limit):
        res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=headers)
        assert res.status_code in (302, 307), res.text

    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=headers)
    assert res.status_code == 429
    body = res.json()
    assert body["error"]["code"] == "rate_limited"
