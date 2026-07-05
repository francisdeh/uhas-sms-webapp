"""Add report_card_pdf_cache table.

One row per (school, exam, student) tracking the last-rendered
report-card PDF's content hash and Storage path — lets repeat
downloads of an unchanged report card skip re-rendering. See
`ReportCardService.get_pdf`. Pure cache: composite primary key on the
natural lookup key, no separate surrogate id, no soft-delete.

Revision ID: 18e0239d4c15
Revises: 1cb5816e6a2a
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "18e0239d4c15"
down_revision: str | Sequence[str] | None = "1cb5816e6a2a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_card_pdf_cache",
        sa.Column("school_id", sa.Uuid(), sa.ForeignKey("schools.id"), primary_key=True),
        sa.Column("exam_id", sa.Uuid(), sa.ForeignKey("exams.id"), primary_key=True),
        sa.Column("student_id", sa.Uuid(), sa.ForeignKey("students.id"), primary_key=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("report_card_pdf_cache")
