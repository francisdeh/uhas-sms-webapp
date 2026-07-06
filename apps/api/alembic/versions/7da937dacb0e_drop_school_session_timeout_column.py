"""Drop schools.session_timeout_minutes.

Never enforced by anything — session/token expiry is controlled by
Supabase Auth, not this app. The Admin Settings > Security tab exposed
an editable field for it that had no real effect; removed rather than
left as a UI setting that lies about what it does.

Revision ID: 7da937dacb0e
Revises: 171bf85ec8f4
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7da937dacb0e"
down_revision: str | Sequence[str] | None = "171bf85ec8f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("schools", "session_timeout_minutes")


def downgrade() -> None:
    op.add_column(
        "schools",
        sa.Column("session_timeout_minutes", sa.Integer(), nullable=True, server_default="480"),
    )
