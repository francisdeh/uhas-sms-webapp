"""make users.email nullable for phone-only logins

A guardian login can now be provisioned from a phone number alone
(SMS-OTP), with no email — so the `users` bridge row must tolerate a
NULL email. The `users_email_unique` constraint stays; Postgres allows
multiple NULLs under a UNIQUE index, so phone-only rows don't collide.

Revision ID: 32cd865749cc
Revises: 0be2e817bc16
Create Date: 2026-07-08 16:17:39.024510

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "32cd865749cc"
down_revision: str | Sequence[str] | None = "0be2e817bc16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=True)


def downgrade() -> None:
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=False)
