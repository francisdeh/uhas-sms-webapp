"""Batch report-card generation — stub, same caveat as
`report_generate.py`: proves the fan-out trigger works, doesn't render
real PDFs yet. One step per student so a single failure doesn't lose
the rest of the batch (Inngest retries only the failed step).

Triggered by `reports/report-card.batch.requested`.

Event payload shape:
    {
      "school_id": "<uuid>",
      "exam_id": "<uuid>",
      "student_ids": ["<uuid>", ...]
    }
"""

from __future__ import annotations

from typing import Any, cast

import inngest

from app.core.inngest import inngest_client, with_sentry
from app.features.reports.jobs.report_generate import _generate_one


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    school_id = str(data["school_id"])
    exam_id = str(data["exam_id"])
    student_ids = [str(s) for s in cast("list[Any]", data["student_ids"])]

    paths: list[str] = []
    for i, student_id in enumerate(student_ids):

        async def _step(sid: str = student_id) -> str:
            return await _generate_one(school_id=school_id, exam_id=exam_id, student_id=sid)

        paths.append(await ctx.step.run(f"generate-{i}", _step))

    return {"generated_count": len(paths), "storage_paths": paths}


report_batch_job = inngest_client.create_function(
    fn_id="report-card-batch",
    trigger=inngest.TriggerEvent(event="reports/report-card.batch.requested"),
)(_run)
