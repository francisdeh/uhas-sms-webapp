"""Add user_preferences table.

One row per user, created lazily (see `MeService.update` / `UserPreferences`
model docstring) — no row means every preference is at its code-level
default, not "opted out." Starts with a single flag
(`email_on_lesson_plan_rejected`); more are expected, hence a dedicated
table rather than columns on `users`.

Revision ID: 171bf85ec8f4
Revises: 18e0239d4c15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "171bf85ec8f4"
down_revision: str | Sequence[str] | None = "18e0239d4c15"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column(
            "email_on_lesson_plan_rejected",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
