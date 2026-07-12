"""attendance absent notification prefs

Phase 6 item 8 slice 4. Adds the per-user email/SMS preference columns
for attendance-absence notifications (a student marked absent ->
their primary guardian). School-level toggle lives in
schools.notification_defaults (JSONB, no migration needed — new keys
resolve via Pydantic defaults for existing rows).

Revision ID: 212387c856ab
Revises: c35321d02a8e
Create Date: 2026-07-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "212387c856ab"
down_revision: str | Sequence[str] | None = "c35321d02a8e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_attendance_absent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_attendance_absent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "sms_on_attendance_absent")
    op.drop_column("user_preferences", "email_on_attendance_absent")
