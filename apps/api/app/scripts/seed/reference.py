"""Reference/config data — the rows a *production* deploy needs, seeded
idempotently (insert-if-absent) so it's safe to run against a live DB
and safe to re-run.

Single source of truth for the reference data + logic: the demo seed
delegates here (`identity.py` calls `ensure_school`, `academic.py` calls
`ensure_subjects`) and the prod bootstrap (`app.scripts.seed_reference`)
calls `seed_reference` — so the school config and subject curriculum
can never drift between dev and prod.

Scope is deliberately just the **school row + config** (no create UI
exists for the single-tenant anchor) and the **subject curriculum** (36
rows, tedious to hand-enter). Classes + terms are year-scoped and are
created via the Admin UI, so they're not seeded here.

`ensure_*` never modifies an existing row — re-running never clobbers an
admin's Settings edits or added subjects.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_structure import Division
from app.features.exams.constants import DEFAULT_GRADE_BANDS, DEFAULT_SCORE_WEIGHTS
from app.features.schools.model import School
from app.features.subjects.model import Subject
from app.scripts.seed.det import det

ACADEMIC_YEAR = "2025/2026"
SCHOOL_ID = det("school-uhas-001")
SCHOOL_SLUG = "school-uhas-001"

# The school's confirmed curriculum (product owner, Phase 4). Subjects
# are division-scoped, so a same-named subject in two divisions is two
# rows. Lower + Upper Primary share one list ("Primary"). Names are
# verbatim — they print on report cards. All Core for now; no electives
# were distinguished.
_PRIMARY_SUBJECTS: tuple[str, ...] = (
    "English Language",
    "Mathematics",
    "Science",
    "Religious and Moral Education",
    "Computing",
    "Ewe",
    "French",
    "Creative Arts and Design",
    "History",
)

SUBJECTS_BY_DIVISION: dict[Division, tuple[str, ...]] = {
    "KG": (
        "Numeracy",
        "Literacy",
        "Creative Arts",
        "Our World and Our People",
        "French",
        "Ewe",
        "Computing",
    ),
    "Lower Primary": _PRIMARY_SUBJECTS,
    "Upper Primary": _PRIMARY_SUBJECTS,
    "JHS": (
        "English Language",
        "Mathematics",
        "Science",
        "Religious and Moral Education",
        "Computing",
        "Ewe",
        "French",
        "Career Technology",
        "Social Studies",
        "Creative Arts and Design",
        "Music",
    ),
}


@dataclass
class ReferenceResult:
    school_id: UUID
    subject_ids: dict[str, UUID] = field(default_factory=dict)  # "division:name" -> id


def _subject_slug(name: str, division: Division) -> str:
    base = name.upper().replace(" ", "-").replace(".", "").replace("&", "AND")
    return f"{base}-{division.upper().replace(' ', '')}"


async def ensure_school(session: AsyncSession) -> UUID:
    """Insert the single school row + config if absent; return its id.

    Keyed on the globally-unique `slug`. An existing school (id or config
    changed by an admin) is returned untouched.
    """
    existing = await session.scalar(select(School.id).where(School.slug == SCHOOL_SLUG))
    if existing is not None:
        return existing

    session.add(
        School(
            id=SCHOOL_ID,
            slug=SCHOOL_SLUG,
            name="UHAS Basic School",
            academic_year=ACADEMIC_YEAR,
            current_term=2,
            grading_scale="GES_STANDARD",
            is_active=True,
            motto="Knowledge, Character, Service",
            address="Ho, Volta Region, Ghana",
            phone="+233200000000",
            email="info@uhas.edu.gh",
            principal_name="Mawuli Agbenyega",
            grading_bands=DEFAULT_GRADE_BANDS,
            score_weights=DEFAULT_SCORE_WEIGHTS,
            pass_mark=40,
            notification_defaults={
                "onLessonPlanRejected": True,
                "onAnnouncementPosted": True,
                "onResultsPublished": True,
            },
        )
    )
    # No relationship() exists anywhere in this codebase (every FK is a
    # plain mapped_column), so the ORM can't infer cross-table insert
    # ordering — flush the school before anything that FKs to it.
    await session.flush()
    return SCHOOL_ID


async def ensure_subjects(session: AsyncSession, school_id: UUID) -> dict[str, UUID]:
    """Insert any missing subjects for the school; return every subject's
    id keyed by ``"division:name"`` (the shape the academic seed consumes).

    Keyed on the `(school_id, slug)` unique constraint — an existing
    subject is reused, never duplicated or modified.
    """
    subject_ids: dict[str, UUID] = {}
    for division, names in SUBJECTS_BY_DIVISION.items():
        for name in names:
            slug = _subject_slug(name, division)
            existing = await session.scalar(
                select(Subject.id).where(Subject.school_id == school_id, Subject.slug == slug)
            )
            if existing is None:
                existing = uuid4()
                session.add(
                    Subject(
                        id=existing,
                        slug=slug,
                        school_id=school_id,
                        name=name,
                        division=division,
                        category="Core",
                    )
                )
            subject_ids[f"{division}:{name}"] = existing
    await session.flush()
    return subject_ids


async def seed_reference(session: AsyncSession) -> ReferenceResult:
    """Ensure the school + subject curriculum exist. Idempotent — safe on
    prod and safe to re-run. Does NOT truncate or touch demo data."""
    school_id = await ensure_school(session)
    subject_ids = await ensure_subjects(session, school_id)
    return ReferenceResult(school_id=school_id, subject_ids=subject_ids)
