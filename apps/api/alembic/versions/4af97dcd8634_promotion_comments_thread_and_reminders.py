"""Introduce `promotion_comments` thread table, drop single `reviewer_comment`.

Promotion submissions carried a single `reviewer_comment` column that was
overwritten on every send-back — losing history if a class got sent back
more than once. This migration:

  1. Creates `promotion_comments`, one row per comment (author = the
     reviewer who sent the list back — mirrors `scheme_comments`).
  2. Backfills any existing single comment as one historical entry,
     authored by whoever last reviewed (`reviewed_by_id`) at `reviewed_at`.
  3. Drops `promotion_submissions.reviewer_comment`. `reviewed_by_id` /
     `reviewed_at` stay — they record the latest review action, distinct
     from the thread.
  4. Adds `promotion_submissions.last_reminder_sent_at`, the cooldown
     stamp for the new weekly unsubmitted-class reminder job (mirrors
     `learner_fees.last_reminder_sent_at`).

Revision ID: 4af97dcd8634
Revises: a1b2c3d4e5f6
Create Date: 2026-07-15 00:29:45.418350

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4af97dcd8634"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "promotion_comments",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("submission_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        # clock_timestamp() advances within a transaction, so comments
        # appended together still sort deterministically by created_at.
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("clock_timestamp()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["submission_id"], ["promotion_submissions.id"]),
        sa.ForeignKeyConstraint(["author_id"], ["staff.id"]),
    )
    op.create_index(
        "promotion_comments_submission_idx",
        "promotion_comments",
        ["submission_id", sa.text("created_at DESC")],
    )

    # Backfill the single latest comment as one thread entry.
    op.execute(
        """
        INSERT INTO promotion_comments (submission_id, author_id, body, created_at)
        SELECT id, reviewed_by_id, reviewer_comment, reviewed_at
        FROM promotion_submissions
        WHERE reviewer_comment IS NOT NULL AND reviewed_by_id IS NOT NULL
        """
    )

    op.drop_column("promotion_submissions", "reviewer_comment")

    op.add_column(
        "promotion_submissions",
        sa.Column("last_reminder_sent_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Re-add `reviewer_comment`; copy each submission's LATEST comment
    back. Full thread history in `promotion_comments` is dropped."""
    op.drop_column("promotion_submissions", "last_reminder_sent_at")

    op.add_column(
        "promotion_submissions", sa.Column("reviewer_comment", sa.Text(), nullable=True)
    )

    op.execute(
        """
        UPDATE promotion_submissions p
        SET reviewer_comment = c.body
        FROM (
          SELECT DISTINCT ON (submission_id) submission_id, body
          FROM promotion_comments
          ORDER BY submission_id, created_at DESC
        ) c
        WHERE c.submission_id = p.id
        """
    )

    op.drop_index("promotion_comments_submission_idx", table_name="promotion_comments")
    op.drop_table("promotion_comments")
