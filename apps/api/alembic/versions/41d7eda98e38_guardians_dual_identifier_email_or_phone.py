"""Guardians dual identifier: email OR phone (Phase 1, FRD §3.1 revised).

Parents may sign in by email + password OR by phone OTP. The schema
constraint mirrors the auth surface: at least one identifier must be
present on the row, both are allowed, both are unique where present.

Changes:
  - guardians.email becomes nullable (was NOT NULL)
  - guardians.phone gains a unique constraint (nullable still — Postgres
    UNIQUE allows multiple NULLs by default, which is what we want)
  - guardians.phone gains an E.164 format CHECK (only when not null)
  - guardians gains a CHECK requiring email IS NOT NULL OR phone IS NOT NULL

Revision ID: 41d7eda98e38
Revises: fb2f367656c5
Create Date: 2026-06-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "41d7eda98e38"
down_revision: str | Sequence[str] | None = "fb2f367656c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# E.164 format: leading `+`, 1-9 country code start, total digits 7-15.
# We require the leading `+` so the app layer never deals with ambiguous
# 0-prefixed local numbers — normalisation happens at the boundary.
_E164_REGEX = r"^\+[1-9]\d{6,14}$"


def upgrade() -> None:
    """Loosen + tighten guardians constraints per the dual-identifier model."""
    # 1. Email becomes optional. The unique constraint stays in place.
    op.alter_column(
        "guardians",
        "email",
        existing_type=sa.String(length=255),
        nullable=True,
    )

    # 2. Phone gets a unique constraint. Postgres allows multiple NULLs
    #    under UNIQUE, so existing rows with phone IS NULL don't conflict.
    op.create_unique_constraint("guardians_phone_unique", "guardians", ["phone"])

    # 3. Phone must be E.164 when present. NULL bypasses the regex.
    op.create_check_constraint(
        "guardians_phone_e164",
        "guardians",
        f"phone IS NULL OR phone ~ '{_E164_REGEX}'",
    )

    # 4. At least one identifier required. This is the load-bearing
    #    invariant — without it, a guardian row could exist with no
    #    way to log in.
    op.create_check_constraint(
        "guardians_email_or_phone_required",
        "guardians",
        "email IS NOT NULL OR phone IS NOT NULL",
    )


def downgrade() -> None:
    """Reverse to the single-identifier (email-only) shape."""
    op.drop_constraint("guardians_email_or_phone_required", "guardians", type_="check")
    op.drop_constraint("guardians_phone_e164", "guardians", type_="check")
    op.drop_constraint("guardians_phone_unique", "guardians", type_="unique")
    op.alter_column(
        "guardians",
        "email",
        existing_type=sa.String(length=255),
        nullable=False,
    )
