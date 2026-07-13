"""password reset cooldown

Adds `users.last_password_reset_sent_at` — an abuse guard on the new
public `POST /auth/reset-password` endpoint. A reset requested within
the last 5 minutes for the same account is silently skipped (same
generic response either way, to stay enumeration-safe).

Revision ID: 67ac59c31f61
Revises: 212387c856ab
Create Date: 2026-07-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "67ac59c31f61"
down_revision: str | Sequence[str] | None = "212387c856ab"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("last_password_reset_sent_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "last_password_reset_sent_at")
