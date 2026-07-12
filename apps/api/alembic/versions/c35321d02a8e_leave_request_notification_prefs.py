"""leave request notification prefs

Phase 6 item 8 slice 3. Adds the per-user email/SMS preference columns
for leave-request notifications (submit -> approvers, decide ->
requester). School-level toggles live in schools.notification_defaults
(JSONB, no migration needed — new keys resolve via Pydantic defaults
for existing rows).

Revision ID: c35321d02a8e
Revises: c3a7f9e2b1d4
Create Date: 2026-07-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c35321d02a8e"
down_revision: str | Sequence[str] | None = "c3a7f9e2b1d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_leave_activity",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_leave_activity",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_leave_decided",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_leave_decided",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "sms_on_leave_decided")
    op.drop_column("user_preferences", "email_on_leave_decided")
    op.drop_column("user_preferences", "sms_on_leave_activity")
    op.drop_column("user_preferences", "email_on_leave_activity")
