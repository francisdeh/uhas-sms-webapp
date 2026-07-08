"""Report-card PDF rendering + content-hash cache.

Renders the same data `ReportCardService.get` assembles to a real PDF
(Jinja2 → WeasyPrint) and stores it in Supabase Storage. A published
exam's report-card data is *not* provably immutable — scores can still
be edited after publish (audit-logged, not blocked), and remarks/HOS
comments have no publish-state check at all — so caching can't key off
`is_published`. Instead `ReportCardPdfCache.content_hash` is a sha256 of
the assembled response; any real change busts it automatically on the
next request, with no mutation call site needing to remember to
invalidate anything.

Single-student only — batch/bulk generation is deferred (see
`app.features.reports.jobs.report_batch`, still a placeholder).
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from app.core.security import CurrentUser
from app.features.exams.constants import MID_TERM
from app.features.exams.model import Exam, ReportCardPdfCache
from app.features.exams.report_card_svc import ReportCardService
from app.features.exams.schema import ReportCardResponse
from app.integrations.storage import StorageClient

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),
)


def report_card_storage_path(*, school_id: str, exam_id: str, student_id: str) -> str:
    """Bucket-relative path in `documents` — deterministic so a re-render
    for the same (school, exam, student) overwrites rather than
    accumulating stale copies. Mirrors
    `app.features.reports.jobs.report_generate.report_card_storage_path`
    (kept separate: that module's version stays untouched, tied to the
    still-placeholder Inngest batch job)."""
    return f"report-cards/{school_id}/{exam_id}/{student_id}.pdf"


def _content_hash(data: ReportCardResponse, *, full: bool) -> str:
    payload = data.model_dump(mode="json")
    # `full` is a rendering choice over identical data, so it must enter
    # the hash — otherwise a summary render would be served for a full
    # request (and vice-versa) from the single cache row.
    payload["_full"] = full
    serialized = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(serialized.encode()).hexdigest()


def _report_title(exam_type: str, term: int) -> str:
    if exam_type == MID_TERM:
        return f"MID-TERM REPORT — TERM {term}"
    return f"END OF TERM REPORT — TERM {term}"


def _render_html(data: ReportCardResponse, exam_created_at: datetime, *, full: bool) -> str:
    template = _env.get_template("report_card.html")
    full_name = " ".join(
        part
        for part in (data.student.first_name, data.student.middle_name, data.student.last_name)
        if part
    ).upper()
    return template.render(
        data=data,
        full_name=full_name,
        full=full,
        title=_report_title(data.exam.type, data.exam.term),
        month_year=exam_created_at.strftime("%B %Y").upper(),
        generated_date=datetime.now(UTC).strftime("%d/%m/%Y"),
        is_mid_term=data.exam.type == MID_TERM,
        grade_bands=data.grading_bands,
        # Placeholders — the assembled ReportCardResponse doesn't carry
        # roll count or attendance yet. Matches the same gap already
        # shipped in the admin browser-print route.
        number_on_roll=0,
        attendance_attended=0,
        attendance_total=0,
    )


class ReportCardPdfService:
    @staticmethod
    async def get_or_render(
        session: AsyncSession,
        school_id: UUID | str,
        user: CurrentUser,
        *,
        student_id: UUID,
        exam_id: UUID,
        storage: StorageClient,
        full: bool = False,
    ) -> str:
        """Returns a signed URL for this student's report-card PDF.

        Renders + uploads a fresh copy only if the underlying data
        (or the `full` breakdown flag) changed since the last render
        (see module docstring) — auth and existence checks are inherited
        entirely from `ReportCardService.get`, called unconditionally on
        every request so a cache hit never skips authorization.
        """
        school_uuid = school_id if isinstance(school_id, UUID) else UUID(str(school_id))

        data = await ReportCardService.get(
            session, school_id, user, student_id=student_id, exam_id=exam_id
        )
        content_hash = _content_hash(data, full=full)

        cache_row = await session.get(ReportCardPdfCache, (school_uuid, exam_id, student_id))
        if cache_row is not None and cache_row.content_hash == content_hash:
            return await storage.get_signed_url("documents", cache_row.storage_path)

        exam_row = await session.get(Exam, exam_id)
        exam_created_at = (
            exam_row.created_at if exam_row and exam_row.created_at else datetime.now(UTC)
        )
        html = _render_html(data, exam_created_at, full=full)
        pdf_bytes = HTML(string=html).write_pdf()

        path = report_card_storage_path(
            school_id=str(school_uuid), exam_id=str(exam_id), student_id=str(student_id)
        )
        await storage.upload(
            "documents", path, pdf_bytes, content_type="application/pdf", upsert=True
        )

        if cache_row is None:
            cache_row = ReportCardPdfCache(
                school_id=school_uuid,
                exam_id=exam_id,
                student_id=student_id,
                content_hash=content_hash,
                storage_path=path,
            )
            session.add(cache_row)
        else:
            cache_row.content_hash = content_hash
            cache_row.storage_path = path
        await session.flush()

        return await storage.get_signed_url("documents", path)
