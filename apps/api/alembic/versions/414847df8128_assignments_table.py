"""Add hot-path indexes to the pre-existing `assignments` table.

The table itself was created in the Drizzle baseline
(`fb2f367656c5_drizzle_baseline_port`) so this migration is
index-only. Two composite indexes for the hot list paths:

  - `assignments_teacher_status_idx`  → teacher dashboard list
  - `assignments_class_status_due_idx` → parent list (filtered by
    `class_id` + `status='published'` + ORDER BY `due_date`)

Postgres does not auto-index FK columns; without these two, both
list endpoints do full table scans once `assignments` grows past a
few thousand rows.

Revision ID: 414847df8128
Revises: b1bbb27bb731
"""

from collections.abc import Sequence

from alembic import op

revision: str = "414847df8128"
down_revision: str | Sequence[str] | None = "b1bbb27bb731"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "assignments_teacher_status_idx",
        "assignments",
        ["teacher_id", "status"],
    )
    op.create_index(
        "assignments_class_status_due_idx",
        "assignments",
        ["class_id", "status", "due_date"],
    )


def downgrade() -> None:
    op.drop_index("assignments_class_status_due_idx", table_name="assignments")
    op.drop_index("assignments_teacher_status_idx", table_name="assignments")
