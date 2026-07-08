"""Identity & org group — schools, school_terms, staff, guardians, the
`users` bridge table.

Only the school and the 9 staff/guardian rows the Supabase Auth test
accounts link to need deterministic IDs (see `det.py`). Everything
else here uses a random `uuid4()`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import ACCOUNTANT, ADMIN, DEPUTY_HEAD, TEACHER
from app.core.school_structure import Division
from app.features.guardians.model import Guardian
from app.features.school_terms.model import SchoolTerm
from app.features.staff.model import Staff
from app.features.users.model import User
from app.scripts.seed.det import det
from app.scripts.seed.names import full_name
from app.scripts.seed.reference import ACADEMIC_YEAR, SCHOOL_ID, ensure_school

# ACADEMIC_YEAR / SCHOOL_ID are re-exported from reference.py so callers
# that import them from here (e.g. academic.py historically) keep working.
__all__ = ["ACADEMIC_YEAR", "SCHOOL_ID", "IdentityResult", "seed_identity"]

# One SeedUser per Supabase Auth test account (apps/web/scripts/_seed-data/users.ts).
# Keep the uid/email/role/linked_id values in sync with that file — the FastAPI
# `/me` endpoint hard-fails without a matching `users` row for each auth account.


@dataclass(frozen=True)
class SeedAccount:
    uid: UUID
    email: str
    role: str
    linked_slug: str  # "STAFF-001" or "guardian-001" — det()'d into linked_id


SEED_ACCOUNTS: tuple[SeedAccount, ...] = (
    SeedAccount(UUID(int=1), "admin@uhas.edu.gh", ADMIN, "STAFF-001"),
    SeedAccount(UUID(int=2), "dh.jhs@uhas.edu.gh", DEPUTY_HEAD, "STAFF-002"),
    SeedAccount(UUID(int=3), "dh.lower-primary@uhas.edu.gh", DEPUTY_HEAD, "STAFF-003"),
    SeedAccount(UUID(int=4), "dh.upper-primary@uhas.edu.gh", DEPUTY_HEAD, "STAFF-016"),
    SeedAccount(UUID(int=5), "dh.kg@uhas.edu.gh", DEPUTY_HEAD, "STAFF-007"),
    SeedAccount(UUID(int=6), "unit-head.jhs@uhas.edu.gh", TEACHER, "STAFF-004"),
    SeedAccount(UUID(int=7), "teacher@uhas.edu.gh", TEACHER, "STAFF-005"),
    SeedAccount(UUID(int=8), "parent@uhas.edu.gh", "Parent", "guardian-001"),
    SeedAccount(UUID(int=9), "accountant@uhas.edu.gh", ACCOUNTANT, "STAFF-017"),
)

# (slug, first, last, rank, system_role, division, is_unit_head, unit_head_of)
# The 8 auth-linked staff first, in slug order, then extra roster filling out
# every class + division with a class/subject teacher.
_ANCHORED_STAFF: tuple[
    tuple[str, str, str, str | None, str, Division | None, bool, Division | None], ...
] = (
    ("STAFF-001", "Mawuli", "Agbenyega", "Principal Teacher", ADMIN, None, False, None),
    ("STAFF-002", "Dzifa", "Adzogenu", "Senior Teacher", DEPUTY_HEAD, "JHS", False, None),
    ("STAFF-003", "Kodzo", "Mensah", "Senior Teacher", DEPUTY_HEAD, "Lower Primary", False, None),
    ("STAFF-016", "Edinam", "Asare", "Senior Teacher", DEPUTY_HEAD, "Upper Primary", False, None),
    ("STAFF-007", "Akorfa", "Doe", "Senior Teacher", DEPUTY_HEAD, "KG", False, None),
    ("STAFF-004", "Akpene", "Kpodo", "Senior Teacher", TEACHER, "JHS", True, "JHS"),
    ("STAFF-005", "Selorm", "Tornu", "Teacher", TEACHER, "JHS", False, None),
    ("STAFF-017", "Yayra", "Mensah", None, ACCOUNTANT, None, False, None),
)

# Extra class/subject teachers, one per remaining class (KG1, KG2, P1-3, P4-6, JHS3).
_EXTRA_STAFF_SLUGS = (
    "STAFF-006",
    "STAFF-008",
    "STAFF-009",
    "STAFF-010",
    "STAFF-011",
    "STAFF-012",
    "STAFF-013",
    "STAFF-014",
    "STAFF-015",
)
_EXTRA_STAFF_DIVISIONS: tuple[Division, ...] = (
    "KG",
    "KG",
    "Lower Primary",
    "Lower Primary",
    "Lower Primary",
    "Upper Primary",
    "Upper Primary",
    "Upper Primary",
    "JHS",
)


@dataclass
class IdentityResult:
    school_id: UUID
    staff_ids: dict[str, UUID] = field(default_factory=dict)  # slug -> id
    guardian_ids: dict[str, UUID] = field(default_factory=dict)  # slug -> id


async def seed_identity(session: AsyncSession) -> IdentityResult:
    # The school row + config is reference data — created via the shared
    # idempotent helper so dev and the prod bootstrap can't diverge. In
    # the demo seed the table was just truncated, so this always inserts.
    await ensure_school(session)

    session.add_all(
        [
            SchoolTerm(
                id=uuid4(),
                school_id=SCHOOL_ID,
                academic_year=ACADEMIC_YEAR,
                term=1,
                start_date=date(2025, 9, 8),
                end_date=date(2025, 12, 12),
            ),
            SchoolTerm(
                id=uuid4(),
                school_id=SCHOOL_ID,
                academic_year=ACADEMIC_YEAR,
                term=2,
                start_date=date(2026, 1, 12),
                end_date=date(2026, 4, 3),
            ),
            SchoolTerm(
                id=uuid4(),
                school_id=SCHOOL_ID,
                academic_year=ACADEMIC_YEAR,
                term=3,
                start_date=date(2026, 4, 27),
                end_date=date(2026, 7, 24),
            ),
        ]
    )
    # No relationship() exists anywhere in this codebase (every FK is a plain
    # mapped_column), so the ORM can't infer cross-table insert ordering —
    # flush explicitly before anything that FKs to schools.id.
    await session.flush()

    staff_ids: dict[str, UUID] = {}
    for i, (
        slug,
        first,
        last,
        rank,
        system_role,
        division,
        is_unit_head,
        unit_head_of,
    ) in enumerate(_ANCHORED_STAFF):
        staff_id = det(slug)
        staff_ids[slug] = staff_id
        session.add(
            Staff(
                id=staff_id,
                slug=slug,
                school_id=SCHOOL_ID,
                uhas_id=f"UHAS-STAFF-{i + 1:03d}",
                first_name=first,
                last_name=last,
                rank=rank,
                system_role=system_role,
                division=division,
                is_unit_head=is_unit_head,
                unit_head_of=unit_head_of,
                phone=f"+23320000{i:04d}",
                email=f"{first.lower()}.{last.lower()}@uhas.edu.gh",
                is_active=True,
            )
        )

    for i, slug in enumerate(_EXTRA_STAFF_SLUGS):
        female = i % 2 == 0
        first, last = full_name(i + 100, female=female)
        staff_id = uuid4()
        staff_ids[slug] = staff_id
        division = _EXTRA_STAFF_DIVISIONS[i]
        session.add(
            Staff(
                id=staff_id,
                slug=slug,
                school_id=SCHOOL_ID,
                uhas_id=f"UHAS-STAFF-{len(_ANCHORED_STAFF) + i + 1:03d}",
                first_name=first,
                last_name=last,
                rank="Teacher",
                system_role=TEACHER,
                division=division,
                is_unit_head=False,
                unit_head_of=None,
                phone=f"+23320001{i:04d}",
                email=f"{first.lower()}.{last.lower()}@uhas.edu.gh",
                is_active=True,
            )
        )

    guardian_ids: dict[str, UUID] = {}
    primary_guardian_id = det("guardian-001")
    guardian_ids["guardian-001"] = primary_guardian_id
    session.add(
        Guardian(
            id=primary_guardian_id,
            slug="guardian-001",
            school_id=SCHOOL_ID,
            first_name="Mawuli",
            last_name="Agbeko",
            email="parent@uhas.edu.gh",
            phone="+233200000001",
        )
    )
    # A handful of extra guardians for the rest of the student roster.
    for i in range(1, 41):
        slug = f"guardian-{i + 1:03d}"
        female = i % 2 == 0
        first, last = full_name(i + 200, female=female)
        guardian_id = uuid4()
        guardian_ids[slug] = guardian_id
        session.add(
            Guardian(
                id=guardian_id,
                slug=slug,
                school_id=SCHOOL_ID,
                first_name=first,
                last_name=last,
                email=f"{first.lower()}.{last.lower()}{i}@example.com",
                phone=f"+23320002{i:04d}",
            )
        )

    for account in SEED_ACCOUNTS:
        linked_id = guardian_ids.get(account.linked_slug) or staff_ids.get(account.linked_slug)
        session.add(
            User(
                id=account.uid,
                school_id=SCHOOL_ID,
                email=account.email,
                role=account.role,
                linked_id=linked_id,
                is_active=True,
                must_change_password=False,
            )
        )

    await session.flush()
    return IdentityResult(school_id=SCHOOL_ID, staff_ids=staff_ids, guardian_ids=guardian_ids)
