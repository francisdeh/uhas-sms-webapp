"""scheme_notification_prefs

Adds the per-user email/SMS preference columns for scheme
notifications (submit/comment -> Unit Head, acknowledge/comment ->
teacher). Mirrors c35321d02a8e_leave_request_notification_prefs.py's
shape exactly. School-level toggles live in schools.notification_defaults
(JSONB, no migration needed — new keys resolve via Pydantic defaults
for existing rows).

Revision ID: f320969e6074
Revises: 741534365f8f
Create Date: 2026-07-15 21:08:52.560384

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f320969e6074"
down_revision: Union[str, Sequence[str], None] = "741534365f8f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_scheme_activity",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_scheme_activity",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_scheme_decided",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_scheme_decided",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "sms_on_scheme_decided")
    op.drop_column("user_preferences", "email_on_scheme_decided")
    op.drop_column("user_preferences", "sms_on_scheme_activity")
    op.drop_column("user_preferences", "email_on_scheme_activity")
