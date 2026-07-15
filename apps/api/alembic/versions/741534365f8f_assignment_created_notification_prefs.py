"""assignment_created_notification_prefs

Adds the per-user email/SMS preference columns for assignment-created
notifications (a teacher publishes an assignment -> parents of the
class). Mirrors 212387c856ab_attendance_absent_notification_prefs.py's
shape exactly. School-level toggle lives in
schools.notification_defaults (JSONB, no migration needed — new keys
resolve via Pydantic defaults for existing rows), defaulting to True
unlike attendance's deliberate opt-out.

Revision ID: 741534365f8f
Revises: 4af97dcd8634
Create Date: 2026-07-15 19:52:20.093072

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "741534365f8f"
down_revision: Union[str, Sequence[str], None] = "4af97dcd8634"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_assignment_created",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_assignment_created",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "sms_on_assignment_created")
    op.drop_column("user_preferences", "email_on_assignment_created")
