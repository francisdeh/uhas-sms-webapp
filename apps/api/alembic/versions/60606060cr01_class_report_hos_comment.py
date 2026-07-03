"""Add `head_of_school_comment` to `class_report_submissions`.

The Drizzle baseline created `class_report_submissions` with only the
workflow scaffolding (status, submitted_by/submitted_at). Storing the
HOS comment on the same row keeps the class-report as one aggregate:
one PATCH updates one column, and `GET /exams/{id}/class-reports/{cls}`
returns the report + remarks without a second table.

Per-student remarks live in the separate `student_report_remarks` table
that ships with the baseline; that table already carries a per-student
`head_of_school_comment` column (legacy from the TS side) but the class
report workflow uses the report-level column added here.

Revision ID: 60606060cr01
Revises: 8f92d31ce4a7
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "60606060cr01"
down_revision: str | Sequence[str] | None = "8f92d31ce4a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "class_report_submissions",
        sa.Column("head_of_school_comment", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("class_report_submissions", "head_of_school_comment")
