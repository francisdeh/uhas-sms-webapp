"""learner_fees last_reminder_sent_at

Phase 5 slice 3 — fee reminder SMS. One nullable timestamp, stamped by
the weekly reminder job whenever it texts a fee's primary guardian.
Answers "when did we last remind about this specific balance" for the
Accountant's balance view and the dashboard summary, without a full
per-attempt audit log (that already exists in `sms_log` if ever
needed).

Revision ID: d5e1b42497cf
Revises: 7c8672899665
Create Date: 2026-07-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e1b42497cf"
down_revision: str | Sequence[str] | None = "7c8672899665"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "learner_fees",
        sa.Column("last_reminder_sent_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("learner_fees", "last_reminder_sent_at")
