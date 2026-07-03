"""Add school-scoped composite index on the audit log.

The existing baseline indexes cover (action, created_at), (user_id),
and (target_table, target_id) — none of them help the audit-log HTTP
endpoint's primary query, which filters by (school_id, created_at)
with an optional action + date-range filter.

`audit_log_school_created_idx` on (school_id, created_at DESC) is the
right composite: every filtered read starts with the tenant clause,
and the ORDER BY is `created_at DESC`, so a descending index avoids
the sort step for the hottest path.

Revision ID: 8f92d31ce4a7
Revises: a4c19e7b5e88
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8f92d31ce4a7"
down_revision: str | Sequence[str] | None = "a4c19e7b5e88"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "audit_log_school_created_idx",
        "audit_log",
        ["school_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("audit_log_school_created_idx", table_name="audit_log")
