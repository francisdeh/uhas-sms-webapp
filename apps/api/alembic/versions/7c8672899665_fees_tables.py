"""fees tables

Phase 5 slice 1 — fee tracking core. Three tables: `fee_items` (the
catalog of chargeable fees, scoped to school/division/class),
`learner_fees` (one row per learner per fee item they're assigned,
soft-deletable so excluding a learner keeps history), and
`fee_payments` (Accountant-recorded payments, optionally with uploaded
receipt files — the system never generates a receipt, it stores
whatever the Accountant already issued/collected). No online-payment
tables (`payment_gateway_events` etc.) — parents do not pay online.

Revision ID: 7c8672899665
Revises: f259fcd31b08
Create Date: 2026-07-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "7c8672899665"
down_revision: str | Sequence[str] | None = "f259fcd31b08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "fee_items",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("scope_ref", sa.String(255), nullable=True),
        sa.Column("academic_year", sa.String(9), nullable=False),
        sa.Column("term", sa.Integer(), nullable=True),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
    )
    op.create_index("fee_items_school_id_idx", "fee_items", ["school_id"])

    op.create_table(
        "learner_fees",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("fee_item_id", sa.Uuid(), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'outstanding'")),
        sa.Column("balance_minor", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["fee_item_id"], ["fee_items.id"]),
    )
    op.create_index("learner_fees_school_id_idx", "learner_fees", ["school_id"])
    op.create_index("learner_fees_student_id_idx", "learner_fees", ["student_id"])
    # Partial (not plain) unique index: scoped to non-deleted rows, so
    # excluding a learner (soft-delete) and later re-assigning the same
    # fee item to them creates a fresh row instead of colliding with the
    # excluded one.
    op.create_index(
        "learner_fees_fee_item_student_idx",
        "learner_fees",
        ["fee_item_id", "student_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "fee_payments",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("learner_fee_id", sa.Uuid(), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("receipt_file_urls", JSONB(), nullable=True),
        sa.Column("recorded_by_id", sa.Uuid(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.ForeignKeyConstraint(["learner_fee_id"], ["learner_fees.id"]),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["staff.id"]),
    )
    op.create_index("fee_payments_school_id_idx", "fee_payments", ["school_id"])
    op.create_index("fee_payments_learner_fee_id_idx", "fee_payments", ["learner_fee_id"])


def downgrade() -> None:
    op.drop_index("fee_payments_learner_fee_id_idx", table_name="fee_payments")
    op.drop_index("fee_payments_school_id_idx", table_name="fee_payments")
    op.drop_table("fee_payments")

    op.drop_index("learner_fees_fee_item_student_idx", table_name="learner_fees")
    op.drop_index("learner_fees_student_id_idx", table_name="learner_fees")
    op.drop_index("learner_fees_school_id_idx", table_name="learner_fees")
    op.drop_table("learner_fees")

    op.drop_index("fee_items_school_id_idx", table_name="fee_items")
    op.drop_table("fee_items")
