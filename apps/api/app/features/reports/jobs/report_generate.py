"""Report-card PDF generation — stub.

Per the Phase 3 plan, this job exists to prove the trigger (Inngest)
and the destination (Supabase Storage) are wired end-to-end; it does
NOT render a real PDF yet. Report cards today are React-rendered and
browser-printed (`features/exams/components/ReportCard.tsx` on the
Next side) — nothing in this repo turns exam data into PDF bytes.
Swapping the placeholder body for a real renderer (e.g. WeasyPrint) is
future work; every other piece (trigger, storage path, signed-URL
handoff) is already correct and won't change.

Triggered by `reports/report-card.generate.requested`.

Event payload shape:
    {
      "school_id": "<uuid>",
      "student_id": "<uuid>",
      "exam_id": "<uuid>"
    }
"""

from __future__ import annotations

from typing import Any

import inngest

from app.core.inngest import inngest_client, with_sentry
from app.integrations.storage import StorageClient, get_storage_client


def report_card_storage_path(*, school_id: str, exam_id: str, student_id: str) -> str:
    """Bucket-relative path in `documents` — deterministic so a second
    generate request for the same (school, exam, student) overwrites
    rather than accumulating stale copies."""
    return f"report-cards/{school_id}/{exam_id}/{student_id}.pdf"


async def _generate_one(
    *,
    school_id: str,
    exam_id: str,
    student_id: str,
    storage: StorageClient | None = None,
) -> str:
    """Writes a placeholder object and returns its storage path — not a
    real PDF. See module docstring.

    `storage` is injectable so tests don't depend on
    `SUPABASE_SERVICE_ROLE_KEY` being set (or not) in whatever
    environment runs them — same DI pattern as `SmsService.send`'s
    `provider` param."""
    path = report_card_storage_path(school_id=school_id, exam_id=exam_id, student_id=student_id)
    placeholder = (
        f"UHAS SMS — report card placeholder\n"
        f"school_id={school_id} exam_id={exam_id} student_id={student_id}\n"
        f"Real PDF rendering is not wired yet.\n"
    ).encode()
    storage = storage or get_storage_client()
    await storage.upload("documents", path, placeholder, content_type="text/plain", upsert=True)
    return path


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    school_id = str(data["school_id"])
    exam_id = str(data["exam_id"])
    student_id = str(data["student_id"])

    async def _step() -> str:
        return await _generate_one(school_id=school_id, exam_id=exam_id, student_id=student_id)

    path = await ctx.step.run("generate", _step)
    return {"storage_path": path}


report_generate_job = inngest_client.create_function(
    fn_id="report-card-generate",
    trigger=inngest.TriggerEvent(event="reports/report-card.generate.requested"),
)(_run)
