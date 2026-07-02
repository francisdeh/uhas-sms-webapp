"""Hot-path indexes for the notifications audience resolver.

The Drizzle baseline already carries three of the four hot indexes we
need — `notifications_user_read_idx` powers the bell list + unread
count; `announcements_school_created_idx` powers the per-school newest-
first list; `users_linked_id_idx` powers the staff/guardian → user
lookup inside `_user_ids_for_linked`. This migration adds only what's
missing.

  * `users_school_role_idx` on (school_id, role)
      → `AllTeachers`, `AllAdmins`, `AllParents` all filter by
        (school_id, role) and today do a full scan of `users`.

  * `staff_school_division_idx` on (school_id, division)
      → `StaffByDivision` + `ParentsInDivision` both filter by
        (school_id, division). Also useful for the existing staff list
        endpoints — but if it were already added by that domain the
        `IF NOT EXISTS` guard would skip it.

  * `staff_school_unit_head_of_idx` on (school_id, unit_head_of)
      → `UnitHeadOfDivision` filters by unit_head_of. Small index (most
        staff rows have NULL) but the query runs on every lesson-plan
        submit + scheme submit.

Revision ID: 91af2c7d2a55
Revises: 72f4a80e3c11
"""

from collections.abc import Sequence

from alembic import op

revision: str = "91af2c7d2a55"
down_revision: str | Sequence[str] | None = "72f4a80e3c11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "users_school_role_idx",
        "users",
        ["school_id", "role"],
    )
    op.create_index(
        "staff_school_division_idx",
        "staff",
        ["school_id", "division"],
    )
    op.create_index(
        "staff_school_unit_head_of_idx",
        "staff",
        ["school_id", "unit_head_of"],
    )


def downgrade() -> None:
    op.drop_index("staff_school_unit_head_of_idx", table_name="staff")
    op.drop_index("staff_school_division_idx", table_name="staff")
    op.drop_index("users_school_role_idx", table_name="users")
