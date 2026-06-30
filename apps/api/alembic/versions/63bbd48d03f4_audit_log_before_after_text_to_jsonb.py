"""audit_log.before / after — Text → JSONB.

The columns historically held JSON-encoded text (`json.dumps(...)`). That
made introspection awkward (`WHERE before::jsonb->>'systemRole' = 'Teacher'`
needs the cast) and gave us no schema enforcement on the stored shape.

This migration:
  1. Casts the existing string values to jsonb via `USING <col>::jsonb`.
  2. Drops `NULL`-able marker (already nullable, no change there).

Postgres requires every existing row to be JSON-parseable for the cast.
The audit writer always produced `json.dumps`-shaped output, so every
existing row is safe to cast. New rows go straight into JSONB without
the json.dumps step.

Revision ID: 63bbd48d03f4
Revises: fb2f367656c5
Create Date: 2026-06-30 22:13:32.902908
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "63bbd48d03f4"
down_revision: str | Sequence[str] | None = "fb2f367656c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Cast Text → JSONB in place."""
    op.alter_column(
        "audit_log",
        "before",
        existing_type=sa.Text(),
        type_=JSONB(),
        postgresql_using="before::jsonb",
        existing_nullable=True,
    )
    op.alter_column(
        "audit_log",
        "after",
        existing_type=sa.Text(),
        type_=JSONB(),
        postgresql_using="after::jsonb",
        existing_nullable=True,
    )


def downgrade() -> None:
    """JSONB → Text. The cast back is unambiguous (just renders the JSON)."""
    op.alter_column(
        "audit_log",
        "before",
        existing_type=JSONB(),
        type_=sa.Text(),
        postgresql_using="before::text",
        existing_nullable=True,
    )
    op.alter_column(
        "audit_log",
        "after",
        existing_type=JSONB(),
        type_=sa.Text(),
        postgresql_using="after::text",
        existing_nullable=True,
    )
