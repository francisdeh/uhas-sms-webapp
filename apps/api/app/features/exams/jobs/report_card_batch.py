"""Batch report-card PDF generation — rewired to render *real* PDFs.

Supersedes the old `reports/jobs/report_batch.py` + `report_generate.py`
pair, which only ever wrote placeholder text files and were triggered
by nothing but their own tests. This job reuses the real single-student
renderer (`ReportCardPdfService.get_or_render`, same content-hash cache
a single-student download hits), zips every student's PDF, and tracks
progress on a `report_card_batch_jobs` row so the requesting Admin can
poll `GET /exams/{id}/classes/{id}/report-cards/batch` for a fresh
signed URL once done.

Triggered by `reports/report-card.batch.requested`.

Event payload shape:
    {
      "school_id": "<uuid>",
      "exam_id": "<uuid>",
      "class_id": "<uuid>",
      "job_id": "<uuid>"
    }
"""

from __future__ import annotations

import io
import zipfile
from typing import Any
from uuid import UUID

import inngest

from app.core.db import SessionLocal
from app.core.inngest import inngest_client, with_sentry
from app.core.roles import ADMIN
from app.core.security import CurrentUser
from app.features.exams.constants import BATCH_JOB_COMPLETE, BATCH_JOB_FAILED
from app.features.exams.model import ReportCardBatchJob
from app.features.exams.report_card_pdf import ReportCardPdfService, report_card_storage_path
from app.features.exams.repository import ExamsRepository, ScoresRepository
from app.integrations.storage import get_storage_client


def batch_zip_storage_path(*, school_id: str, exam_id: str, class_id: str) -> str:
    """Deterministic — a re-run for the same (school, exam, class)
    overwrites rather than accumulating stale zips."""
    return f"report-card-batches/{school_id}/{exam_id}/{class_id}.zip"


async def _run_batch(*, school_id: str, exam_id: str, class_id: str, job_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        job = await session.get(ReportCardBatchJob, UUID(job_id))
        if job is None:
            return {"skipped": True}

        try:
            exam = await ExamsRepository.get_by_id(session, school_id, exam_id)
            if exam is None:
                raise ValueError(f"Exam {exam_id!r} not found.")
            students = await ScoresRepository.list_class_roster(
                session, class_id, exam.academic_year
            )

            storage = get_storage_client()
            admin_user = CurrentUser(
                user_id=str(job.requested_by_staff_id),
                email=None,
                phone=None,
                role=ADMIN,
                school_id=str(school_id),
                linked_id=None,
            )

            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                for student in students:
                    await ReportCardPdfService.get_or_render(
                        session,
                        school_id,
                        admin_user,
                        student_id=student.id,
                        exam_id=UUID(exam_id),
                        storage=storage,
                    )
                    path = report_card_storage_path(
                        school_id=school_id, exam_id=exam_id, student_id=str(student.id)
                    )
                    pdf_bytes = await storage.download("documents", path)
                    zf.writestr(f"{student.last_name}_{student.first_name}.pdf", pdf_bytes)

            zip_path = batch_zip_storage_path(
                school_id=school_id, exam_id=exam_id, class_id=class_id
            )
            await storage.upload(
                "documents",
                zip_path,
                buffer.getvalue(),
                content_type="application/zip",
                upsert=True,
            )

            job.status = BATCH_JOB_COMPLETE
            job.storage_path = zip_path
            job.error_message = None
            await session.commit()
            return {"status": BATCH_JOB_COMPLETE, "student_count": len(students)}
        except Exception as exc:
            job.status = BATCH_JOB_FAILED
            job.error_message = str(exc)[:2000]
            await session.commit()
            raise


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    school_id = str(data["school_id"])
    exam_id = str(data["exam_id"])
    class_id = str(data["class_id"])
    job_id = str(data["job_id"])

    async def _step() -> dict[str, Any]:
        return await _run_batch(
            school_id=school_id, exam_id=exam_id, class_id=class_id, job_id=job_id
        )

    return await ctx.step.run("generate-batch", _step)


report_card_batch_job = inngest_client.create_function(
    fn_id="report-card-batch",
    trigger=inngest.TriggerEvent(event="reports/report-card.batch.requested"),
)(_run)
