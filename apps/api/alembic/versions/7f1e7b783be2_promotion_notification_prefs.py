"""promotion_notification_prefs

Adds the per-user email/SMS preference columns for promotion
notifications across all 3 directions: season (all-teachers broadcast
on season open), activity (reviewer-facing on submit), decided
(teacher-facing on sent-back/approved/reminder). School-level toggles
live in schools.notification_defaults (JSONB, no migration needed —
new keys resolve via Pydantic defaults for existing rows).

Revision ID: 7f1e7b783be2
Revises: f320969e6074
Create Date: 2026-07-15 22:19:24.029101

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7f1e7b783be2"
down_revision: Union[str, Sequence[str], None] = "f320969e6074"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_promotion_season",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_promotion_season",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_promotion_activity",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_promotion_activity",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_promotion_decided",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "sms_on_promotion_decided",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "sms_on_promotion_decided")
    op.drop_column("user_preferences", "email_on_promotion_decided")
    op.drop_column("user_preferences", "sms_on_promotion_activity")
    op.drop_column("user_preferences", "email_on_promotion_activity")
    op.drop_column("user_preferences", "sms_on_promotion_season")
    op.drop_column("user_preferences", "email_on_promotion_season")
