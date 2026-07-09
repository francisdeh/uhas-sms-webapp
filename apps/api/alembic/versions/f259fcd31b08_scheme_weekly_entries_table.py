"""scheme weekly entries table

Scheme of Learning's structured weekly template — confirmed with the
product owner + a real sample document to be a termly table with one
row per week: Week, Strand, Sub-strand, Content Standard, Indicators,
Resources (plus optional resource file attachments). Only `week` is
required, so a teacher can save a partially-filled week. Mirrors the
`scheme_comments` child-table shape (see `0be2e817bc16`).

Revision ID: f259fcd31b08
Revises: 4d512eb4c75b
Create Date: 2026-07-09 12:08:25.649082

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "f259fcd31b08"
down_revision: str | Sequence[str] | None = "4d512eb4c75b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scheme_weekly_entries",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("strand", sa.Text(), nullable=True),
        sa.Column("sub_strand", sa.Text(), nullable=True),
        sa.Column("content_standard", sa.Text(), nullable=True),
        sa.Column("indicators", sa.Text(), nullable=True),
        sa.Column("resources", sa.Text(), nullable=True),
        sa.Column("resource_file_urls", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
    )
    op.create_index(
        "scheme_weekly_entries_scheme_week_idx",
        "scheme_weekly_entries",
        ["scheme_id", "week"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("scheme_weekly_entries_scheme_week_idx", table_name="scheme_weekly_entries")
    op.drop_table("scheme_weekly_entries")
