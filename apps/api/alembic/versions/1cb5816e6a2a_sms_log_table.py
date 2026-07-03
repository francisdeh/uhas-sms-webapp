"""Add `sms_log` table — Phase 3 SMS domain.

One row per outbound SMS attempt, whichever provider sends it. Written
by `SmsService.send(...)` before the provider call so a crash mid-send
still leaves an audit trail (status stays `queued`). `provider_message_id`
+ `status` get updated on the provider's delivery callback once a real
provider (Hubtel) lands — the `stub` provider used today writes
`sent` immediately since there's no real delivery to track.

Revision ID: 1cb5816e6a2a
Revises: 60606060cr01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "1cb5816e6a2a"
down_revision: str | Sequence[str] | None = "60606060cr01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sms_log",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_phone", sa.String(length=20), nullable=False),
        sa.Column("recipient_guardian_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_message_id", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column("cost_minor", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.ForeignKeyConstraint(["recipient_guardian_id"], ["guardians.id"]),
    )
    op.create_index(
        "sms_log_school_created_idx",
        "sms_log",
        ["school_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "sms_log_guardian_idx",
        "sms_log",
        ["recipient_guardian_id"],
    )


def downgrade() -> None:
    op.drop_index("sms_log_guardian_idx", table_name="sms_log")
    op.drop_index("sms_log_school_created_idx", table_name="sms_log")
    op.drop_table("sms_log")
