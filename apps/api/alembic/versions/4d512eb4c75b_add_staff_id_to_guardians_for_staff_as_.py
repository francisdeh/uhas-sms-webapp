"""add staff_id to guardians for staff-as-guardian

A staff member can also be a student's guardian (their own child at the
school). `staff_id` marks a guardian row as staff-backed — nullable,
since most guardians aren't staff. One guardian identity per staff
member is enforced app-layer (find-or-create by staff_id), not by a DB
constraint, matching the max-two-guardians / one-login-per-guardian
pattern from earlier slices.

Revision ID: 4d512eb4c75b
Revises: 32cd865749cc
Create Date: 2026-07-09 08:54:04.891385

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4d512eb4c75b"
down_revision: str | Sequence[str] | None = "32cd865749cc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("guardians", sa.Column("staff_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "guardians_staff_id_staff_id_fk",
        "guardians",
        "staff",
        ["staff_id"],
        ["id"],
    )
    op.create_index("guardians_staff_id_idx", "guardians", ["staff_id"])


def downgrade() -> None:
    op.drop_index("guardians_staff_id_idx", table_name="guardians")
    op.drop_constraint("guardians_staff_id_staff_id_fk", "guardians", type_="foreignkey")
    op.drop_column("guardians", "staff_id")
