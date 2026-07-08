"""Introduce `scheme_comments` thread table, drop single `reviewer_comment`.

Schemes carried a single `reviewer_comment` column that was overwritten
on every acknowledge — losing reviewer identity + history. This migration:

  1. Creates `scheme_comments`, one row per comment (author = teacher or
     reviewer; a two-way thread).
  2. Backfills any existing single comment as one historical entry,
     authored by whoever acknowledged (`reviewed_by_id`) at `reviewed_at`.
  3. Drops `schemes.reviewer_comment`. `reviewed_by_id` / `reviewed_at`
     stay — they record the acknowledgement, distinct from the thread.

Revision ID: 0be2e817bc16
Revises: 7da937dacb0e
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0be2e817bc16"
down_revision: str | Sequence[str] | None = "7da937dacb0e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scheme_comments",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.ForeignKeyConstraint(["author_id"], ["staff.id"]),
    )
    op.create_index(
        "scheme_comments_scheme_idx",
        "scheme_comments",
        ["scheme_id", sa.text("created_at DESC")],
    )

    # Backfill the single acknowledge comment as one thread entry.
    op.execute(
        """
        INSERT INTO scheme_comments (scheme_id, author_id, body, created_at)
        SELECT id, reviewed_by_id, reviewer_comment, reviewed_at
        FROM schemes
        WHERE reviewer_comment IS NOT NULL AND reviewed_by_id IS NOT NULL
        """
    )

    op.drop_column("schemes", "reviewer_comment")


def downgrade() -> None:
    """Re-add `reviewer_comment`; copy each scheme's LATEST comment back.
    Full thread history in `scheme_comments` is dropped."""
    op.add_column("schemes", sa.Column("reviewer_comment", sa.Text(), nullable=True))

    op.execute(
        """
        UPDATE schemes s
        SET reviewer_comment = c.body
        FROM (
          SELECT DISTINCT ON (scheme_id) scheme_id, body
          FROM scheme_comments
          ORDER BY scheme_id, created_at DESC
        ) c
        WHERE c.scheme_id = s.id
        """
    )

    op.drop_index("scheme_comments_scheme_idx", table_name="scheme_comments")
    op.drop_table("scheme_comments")
