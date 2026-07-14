"""current term override

Adds `schools.current_term_override` — an optional Admin-set pin that
wins over the date-based "current term" auto-pick (see
`app.features.schools.term_resolver`). NULL means "let the resolver
compute it from `school_terms` dates"; the existing `schools.current_term`
column becomes the resolver's last-resort fallback (used only when no
`school_terms` row exists yet for the active year) instead of the
previously-authoritative manually-set value.

Revision ID: a1b2c3d4e5f6
Revises: 67ac59c31f61
Create Date: 2026-07-14 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "67ac59c31f61"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "schools",
        sa.Column("current_term_override", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("schools", "current_term_override")
