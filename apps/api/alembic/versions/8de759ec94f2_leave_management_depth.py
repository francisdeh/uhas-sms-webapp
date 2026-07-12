"""leave management depth

Phase 6 item 3. A pre-design audit found leave types + the request/
approve workflow already existed; balances/documents/substitute were
genuinely new, and two real bugs (division-scope leak, discarded
rejection reason) got fixed alongside per the user's call.

Revision ID: 8de759ec94f2
Revises: 2741307b0d04
Create Date: 2026-07-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "8de759ec94f2"
down_revision: str | Sequence[str] | None = "2741307b0d04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("leave_requests", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column(
        "leave_requests", sa.Column("substitute_staff_id", sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        "leave_requests_substitute_staff_id_fkey",
        "leave_requests",
        "staff",
        ["substitute_staff_id"],
        ["id"],
    )
    op.add_column("leave_requests", sa.Column("document_urls", JSONB(), nullable=True))

    op.add_column(
        "schools",
        sa.Column(
            "casual_leave_annual_days",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("21"),
        ),
    )


def downgrade() -> None:
    op.drop_column("schools", "casual_leave_annual_days")

    op.drop_column("leave_requests", "document_urls")
    op.drop_constraint(
        "leave_requests_substitute_staff_id_fkey", "leave_requests", type_="foreignkey"
    )
    op.drop_column("leave_requests", "substitute_staff_id")
    op.drop_column("leave_requests", "rejection_reason")
