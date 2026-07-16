"""announcement_notification_prefs

Adds the per-user email/SMS preference columns for announcement
notifications. One shared pair regardless of the recipient's role —
an announcement can reach staff or parents depending on scope, unlike
every prior domain's directional (activity/decided) pairs. School-level
toggle already exists at schools.notification_defaults.on_announcement_posted
(added before the notification-preferences initiative began, no
migration needed for it).

Revision ID: 1b63efba0753
Revises: 7f1e7b783be2
Create Date: 2026-07-16 08:42:00.235384

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1b63efba0753"
down_revision: Union[str, Sequence[str], None] = "7f1e7b783be2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_announcement_posted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_announcement_posted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "sms_on_announcement_posted")
    op.drop_column("user_preferences", "email_on_announcement_posted")
