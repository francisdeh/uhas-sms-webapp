"""Production bootstrap — seeds only the reference/config data.

    uv run python -m app.scripts.seed_reference

Unlike the demo seed (`app.scripts.seed`), this:
  - does NOT truncate anything,
  - seeds only the school row + config and the subject curriculum
    (insert-if-absent — never modifies existing rows),
  - is SAFE to run against production, and safe to re-run.

Run it once after `alembic upgrade head` on a fresh deploy to create the
single-tenant school row (which has no create UI) and bulk-load the
subjects. Classes + term dates are then set via the Admin UI.
"""

from __future__ import annotations

import asyncio

from app.core.db import SessionLocal
from app.scripts.seed.reference import seed_reference


async def main() -> None:
    async with SessionLocal() as session:
        print("→ Ensuring reference data (school + config, subjects)…")
        result = await seed_reference(session)
        await session.commit()

    print(
        f"\nDone. School ensured ({result.school_id}); {len(result.subject_ids)} subjects ensured."
    )


if __name__ == "__main__":
    asyncio.run(main())
