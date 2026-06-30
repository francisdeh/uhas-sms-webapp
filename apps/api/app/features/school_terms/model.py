"""SQLAlchemy model for the `school_terms` table.

Sub-resource of `schools`. One row per (school_id, academic_year, term)
— the unique constraint enforces "at most three terms per year per
school". Drives report-card term headers and the "current term"
auto-pick on dashboards.

Per the convention in
[docs/ENGINEERING-CONVENTIONS.md §3a](../../../../../docs/ENGINEERING-CONVENTIONS.md):
PK is `uuid`. No slug column — the natural key
(school_id, academic_year, term) is what humans + queries reference.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SchoolTerm(Base):
    __tablename__ = "school_terms"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "school_id",
            "academic_year",
            "term",
            name="school_terms_school_id_academic_year_term_unique",
        ),
    )
