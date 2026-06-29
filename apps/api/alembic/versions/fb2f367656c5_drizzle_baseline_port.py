"""Drizzle baseline port — recreates the 33-table schema from the Next.js demo.

This migration is the bridge between the Drizzle-managed schema that lives
today in `apps/web/drizzle/` and the future Alembic-managed schema. It
replays the concatenated Drizzle migrations (snapshotted at PR #3 time)
as one transaction, then Alembic owns the schema from here.

The source SQL lives at `apps/api/alembic/baseline/0001_drizzle_port.sql`
— a static snapshot, never modified after this PR lands. Future schema
changes go through `alembic revision --autogenerate` driven by the
SQLAlchemy models that come with each ported feature.

Revision ID: fb2f367656c5
Revises:
Create Date: 2026-06-29
"""

from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fb2f367656c5"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Drizzle separates statements with a magic comment. We split on that
# and execute each piece on its own — psycopg/asyncpg can't handle
# multi-statement strings with mixed DDL through `op.execute()`.
DRIZZLE_STATEMENT_BREAKPOINT = "--> statement-breakpoint"

BASELINE_SQL_PATH = Path(__file__).parent.parent / "baseline" / "0001_drizzle_port.sql"


def _statements_from_baseline() -> list[str]:
    """Read + split the baseline SQL, stripping blanks."""
    raw = BASELINE_SQL_PATH.read_text()
    return [s.strip() for s in raw.split(DRIZZLE_STATEMENT_BREAKPOINT) if s.strip()]


def upgrade() -> None:
    """Create every table, FK, and index from the Drizzle migrations."""
    for stmt in _statements_from_baseline():
        op.execute(sa.text(stmt))


def downgrade() -> None:
    """Drop the entire baseline.

    Not really reversible in practice — once seed data lands or feature
    migrations run on top, a downgrade through baseline destroys
    everything. Kept here for completeness; never use in prod.
    """
    raise NotImplementedError(
        "Baseline migration is forward-only. Drop the database manually if needed."
    )
