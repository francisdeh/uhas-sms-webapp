"""staff.rank — null out legacy non-enum values.

The `exams` and `scores` tables already ship with the Drizzle baseline
(fb2f367656c5); nothing schema-shaped changes in this migration.

`staff.rank` was a free-text column that accumulated a mix of GES
teacher-track ranks (`Teacher`, `Senior Teacher`, `Principal Teacher`)
and unrelated position titles (`Head of School`, `Deputy Head`, `Class
Teacher`, `Accountant`). The Pydantic schema now enforces the closed
`TeacherRank` set; this migration NULLs out every existing value that
doesn't fit — the position titles are already captured elsewhere
(system_role, class_teachers junction) so there's no data loss.

Revision ID: c3f4adcea23b
Revises: 63bbd48d03f4
Create Date: 2026-07-01
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c3f4adcea23b"
down_revision: str | Sequence[str] | None = "63bbd48d03f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE staff
        SET rank = NULL
        WHERE rank IS NOT NULL
          AND rank NOT IN ('Teacher', 'Senior Teacher', 'Principal Teacher')
        """
    )


def downgrade() -> None:
    """No-op — we don't retain the old free-text values, and reversing
    "null out" is only possible for the caller who knew what they were."""
    pass
