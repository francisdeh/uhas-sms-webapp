"""report card polish

Phase 6 item 5. A pre-design audit found the report-card path treats
every division identically (no KG variant), has free-text remarks but
no structured conduct/co-curricular fields, computes class-average
scores nowhere on the card itself, has no batch-print path (only a
dormant, placeholder-only Inngest job pair), and never emails/notifies
parents on publish (a dead RESULTS_PUBLISHED constant).

Revision ID: 9f2c7a41e8b3
Revises: 8de759ec94f2
Create Date: 2026-07-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "9f2c7a41e8b3"
down_revision: str | Sequence[str] | None = "8de759ec94f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "student_report_remarks", sa.Column("kg_observations", JSONB(), nullable=True)
    )
    op.add_column(
        "student_report_remarks", sa.Column("conduct_ratings", JSONB(), nullable=True)
    )
    op.add_column(
        "student_report_remarks",
        sa.Column("interests_co_curricular", sa.Text(), nullable=True),
    )

    op.add_column(
        "user_preferences",
        sa.Column(
            "email_on_results_published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    op.create_table(
        "report_card_batch_jobs",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("exam_id", sa.Uuid(), nullable=False),
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("requested_by_staff_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("storage_path", sa.String(500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"]),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"]),
        sa.ForeignKeyConstraint(["requested_by_staff_id"], ["staff.id"]),
    )
    op.create_index(
        "report_card_batch_jobs_lookup_idx",
        "report_card_batch_jobs",
        ["school_id", "exam_id", "class_id"],
    )


def downgrade() -> None:
    op.drop_index("report_card_batch_jobs_lookup_idx", table_name="report_card_batch_jobs")
    op.drop_table("report_card_batch_jobs")

    op.drop_column("user_preferences", "email_on_results_published")

    op.drop_column("student_report_remarks", "interests_co_curricular")
    op.drop_column("student_report_remarks", "conduct_ratings")
    op.drop_column("student_report_remarks", "kg_observations")
