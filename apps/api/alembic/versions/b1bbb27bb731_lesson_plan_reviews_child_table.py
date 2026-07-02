"""Introduce `lesson_plan_reviews` child table, drop single-review columns.

The `lesson_plans` row used to carry `reviewed_by_id` / `reviewer_comment`
/ `reviewed_at` — a single-review snapshot that got overwritten on every
review event. A Deputy-Head approval wiped out the Unit-Head's approval
identity. This migration:

  1. Creates `lesson_plan_reviews`, one row per review event.
  2. Backfills any existing single-review rows (dev seed data) as one
     historical entry each — preserves what we have, even though the
     middle reviews (if any) are already lost.
  3. Drops the three stale columns from `lesson_plans`.

Read paths compute "latest reviewer" via a subquery on the new table;
the external LessonPlanRead shape is unchanged.

Revision ID: b1bbb27bb731
Revises: c3f4adcea23b
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b1bbb27bb731"
down_revision: str | Sequence[str] | None = "c3f4adcea23b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create the new table.
    op.create_table(
        "lesson_plan_reviews",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("lesson_plan_id", sa.Uuid(), nullable=False),
        sa.Column("reviewer_id", sa.Uuid(), nullable=False),
        sa.Column("decision", sa.String(length=50), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["lesson_plan_id"], ["lesson_plans.id"]),
        sa.ForeignKeyConstraint(["reviewer_id"], ["staff.id"]),
    )
    op.create_index(
        "lesson_plan_reviews_plan_idx",
        "lesson_plan_reviews",
        ["lesson_plan_id", sa.text("created_at DESC")],
    )

    # 2. Backfill from the single-review snapshot. Any lesson plan whose
    #    `reviewed_by_id` is set gets one review row copied over — the
    #    `decision` column takes the plan's current `status`, which is
    #    the most defensible mapping given we've already lost the true
    #    per-review decisions.
    op.execute(
        """
        INSERT INTO lesson_plan_reviews (lesson_plan_id, reviewer_id, decision, comment, created_at)
        SELECT id, reviewed_by_id, status, reviewer_comment, reviewed_at
        FROM lesson_plans
        WHERE reviewed_by_id IS NOT NULL
        """
    )

    # 3. Drop the stale columns from `lesson_plans`.
    with op.batch_alter_table("lesson_plans") as batch:
        batch.drop_column("reviewer_comment")
        batch.drop_column("reviewed_by_id")
        batch.drop_column("reviewed_at")


def downgrade() -> None:
    """Re-add the single-review columns; copy each plan's LATEST review
    back in. Full history in `lesson_plan_reviews` is dropped."""
    with op.batch_alter_table("lesson_plans") as batch:
        batch.add_column(sa.Column("reviewer_comment", sa.Text(), nullable=True))
        batch.add_column(sa.Column("reviewed_by_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(), nullable=True))
        batch.create_foreign_key(
            "lesson_plans_reviewed_by_id_fkey",
            "staff",
            ["reviewed_by_id"],
            ["id"],
        )

    op.execute(
        """
        UPDATE lesson_plans lp
        SET
          reviewer_comment = r.comment,
          reviewed_by_id   = r.reviewer_id,
          reviewed_at      = r.created_at
        FROM (
          SELECT DISTINCT ON (lesson_plan_id)
            lesson_plan_id, reviewer_id, comment, created_at
          FROM lesson_plan_reviews
          ORDER BY lesson_plan_id, created_at DESC
        ) r
        WHERE r.lesson_plan_id = lp.id
        """
    )

    op.drop_index("lesson_plan_reviews_plan_idx", table_name="lesson_plan_reviews")
    op.drop_table("lesson_plan_reviews")
