"""Hot-path indexes for calendar_events + appointments.

Both tables are in the Drizzle baseline with no non-PK indexes. Adding
the composites the read paths actually use:

  * `calendar_events_school_start_idx` on (school_id, start_date)
      → the timeline read filters by school + orders by start_date;
        the composite makes this one seek.

  * `appointments_guardian_created_idx` on (guardian_id, created_at)
      → parent inbox — newest-first per guardian.

  * `appointments_teacher_status_created_idx` on
    (teacher_id, status, created_at)
      → teacher inbox — pending first, then newest. Adding `status`
        into the composite lets the planner satisfy the "pending
        first" order without a sort step.

Revision ID: a4c19e7b5e88
Revises: 91af2c7d2a55
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a4c19e7b5e88"
down_revision: str | Sequence[str] | None = "91af2c7d2a55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "calendar_events_school_start_idx",
        "calendar_events",
        ["school_id", "start_date"],
    )
    op.create_index(
        "appointments_guardian_created_idx",
        "appointments",
        ["guardian_id", "created_at"],
    )
    op.create_index(
        "appointments_teacher_status_created_idx",
        "appointments",
        ["teacher_id", "status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "appointments_teacher_status_created_idx", table_name="appointments"
    )
    op.drop_index("appointments_guardian_created_idx", table_name="appointments")
    op.drop_index("calendar_events_school_start_idx", table_name="calendar_events")
