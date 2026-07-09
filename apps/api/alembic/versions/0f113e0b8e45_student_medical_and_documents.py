"""student medical fields and documents table

Phase 6 item 1 — student profile depth. Medical info is four nullable
columns directly on `students` (one-row-per-student data, no need for
history). Documents get their own child table (not a JSONB array, like
`scheme_weekly_entries.resource_file_urls`) because each document needs
its own label and an accountable uploader.

Revision ID: 0f113e0b8e45
Revises: d5e1b42497cf
Create Date: 2026-07-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0f113e0b8e45"
down_revision: str | Sequence[str] | None = "d5e1b42497cf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("students", sa.Column("blood_type", sa.String(10), nullable=True))
    op.add_column("students", sa.Column("medical_notes", sa.Text(), nullable=True))
    op.add_column("students", sa.Column("emergency_contact_name", sa.String(255), nullable=True))
    op.add_column("students", sa.Column("emergency_contact_phone", sa.String(50), nullable=True))

    op.create_table(
        "student_documents",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("school_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("other_label", sa.String(255), nullable=True),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["staff.id"]),
    )
    op.create_index("student_documents_student_id_idx", "student_documents", ["student_id"])
    op.create_index("student_documents_school_id_idx", "student_documents", ["school_id"])


def downgrade() -> None:
    op.drop_index("student_documents_school_id_idx", table_name="student_documents")
    op.drop_index("student_documents_student_id_idx", table_name="student_documents")
    op.drop_table("student_documents")

    op.drop_column("students", "emergency_contact_phone")
    op.drop_column("students", "emergency_contact_name")
    op.drop_column("students", "medical_notes")
    op.drop_column("students", "blood_type")
