"""staff profile depth

Phase 6 item 4 — hire date, subject expertise, qualifications,
documents. Unlike the student-profile-depth audit, this backlog item
was genuinely ~0% built: no existing partial implementation to build
on for any of the four pieces.

Revision ID: 2741307b0d04
Revises: 0f113e0b8e45
Create Date: 2026-07-10 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2741307b0d04"
down_revision: str | Sequence[str] | None = "0f113e0b8e45"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("staff", sa.Column("hire_date", sa.Date(), nullable=True))

    op.create_table(
        "staff_subject_expertise",
        sa.Column("staff_id", sa.Uuid(), nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["staff_id"], ["staff.id"]),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.PrimaryKeyConstraint("staff_id", "subject_id"),
    )

    op.create_table(
        "staff_qualifications",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("staff_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("institution", sa.String(255), nullable=True),
        sa.Column("year_obtained", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.ForeignKeyConstraint(["staff_id"], ["staff.id"]),
    )
    op.create_index(
        "staff_qualifications_staff_id_idx", "staff_qualifications", ["staff_id"]
    )

    op.create_table(
        "staff_documents",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("staff_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("other_label", sa.String(255), nullable=True),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.ForeignKeyConstraint(["staff_id"], ["staff.id"]),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["staff.id"]),
    )
    op.create_index("staff_documents_staff_id_idx", "staff_documents", ["staff_id"])
    op.create_index("staff_documents_school_id_idx", "staff_documents", ["school_id"])


def downgrade() -> None:
    op.drop_index("staff_documents_school_id_idx", table_name="staff_documents")
    op.drop_index("staff_documents_staff_id_idx", table_name="staff_documents")
    op.drop_table("staff_documents")

    op.drop_index("staff_qualifications_staff_id_idx", table_name="staff_qualifications")
    op.drop_table("staff_qualifications")

    op.drop_table("staff_subject_expertise")

    op.drop_column("staff", "hire_date")
