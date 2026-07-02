"""Add hot-path indexes to the pre-existing promotion_* tables.

All three tables (`promotion_seasons`, `promotion_submissions`,
`promotion_decisions`) were created in the Drizzle baseline
(`fb2f367656c5_drizzle_baseline_port`). This migration adds the
composite + FK indexes the service needs:

  * `promotion_seasons_school_year_idx`
      → the season lookup runs on every write path
      (`WHERE school_id = ? AND academic_year = ?`).

  * `promotion_submissions_school_year_status_idx`
      → Overview endpoint filters submissions by (school_id, year) and
        the DH queue sorts by status → wants both columns available.

  * `promotion_submissions_class_year_idx`
      → Teacher list + `ensure_submission` look up by
        `(class_id, academic_year)`.

  * `promotion_decisions_submission_idx`
      → Every decision-list read joins by `submission_id`; Postgres
        doesn't auto-index FK columns.

Revision ID: 72f4a80e3c11
Revises: 414847df8128
"""

from collections.abc import Sequence

from alembic import op

revision: str = "72f4a80e3c11"
down_revision: str | Sequence[str] | None = "414847df8128"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "promotion_seasons_school_year_idx",
        "promotion_seasons",
        ["school_id", "academic_year"],
    )
    op.create_index(
        "promotion_submissions_school_year_status_idx",
        "promotion_submissions",
        ["school_id", "academic_year", "status"],
    )
    op.create_index(
        "promotion_submissions_class_year_idx",
        "promotion_submissions",
        ["class_id", "academic_year"],
    )
    op.create_index(
        "promotion_decisions_submission_idx",
        "promotion_decisions",
        ["submission_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "promotion_decisions_submission_idx", table_name="promotion_decisions"
    )
    op.drop_index(
        "promotion_submissions_class_year_idx", table_name="promotion_submissions"
    )
    op.drop_index(
        "promotion_submissions_school_year_status_idx",
        table_name="promotion_submissions",
    )
    op.drop_index(
        "promotion_seasons_school_year_idx", table_name="promotion_seasons"
    )
