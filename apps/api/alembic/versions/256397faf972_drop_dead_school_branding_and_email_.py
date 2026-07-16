"""drop dead school branding and email identity columns

Four columns saved to the DB but never read by anything: `default_color_scheme`/
`sidebar_accent_hex` (Branding tab — the app's actual theme toggle is a
per-user browser preference, not a per-school one) and `email_from_name`/
`email_reply_to` (Communication tab — Brevo's sender identity is a global
env-configured value, never per-school; `email_reply_to` was also stitched
into a few email bodies as a fallback contact address, now simplified to
just `schools.email`).

Revision ID: 256397faf972
Revises: 1b63efba0753
Create Date: 2026-07-16 10:08:36.729219

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "256397faf972"
down_revision: str | Sequence[str] | None = "1b63efba0753"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("schools", "default_color_scheme")
    op.drop_column("schools", "sidebar_accent_hex")
    op.drop_column("schools", "email_from_name")
    op.drop_column("schools", "email_reply_to")


def downgrade() -> None:
    op.add_column("schools", sa.Column("email_reply_to", sa.String(length=255), nullable=True))
    op.add_column("schools", sa.Column("email_from_name", sa.String(length=255), nullable=True))
    op.add_column("schools", sa.Column("sidebar_accent_hex", sa.String(length=7), nullable=True))
    op.add_column(
        "schools",
        sa.Column(
            "default_color_scheme", sa.String(length=20), nullable=True, server_default="uhas"
        ),
    )
