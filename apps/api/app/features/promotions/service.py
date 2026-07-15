"""Business logic for the Promotions domain.

The service holds the three state machines and the transactional
`approve` step. Ownership + role checks are shallow here — the router
gates who calls what; the service enforces invariants once inside
(e.g. can't submit while season is closed, can't approve a `draft`).

Cross-domain writes happen inside `approve`:

  1. Close current-year `Active` enrolments for every affected student.
  2. Insert next-year enrolments for `promote` (Active) and `repeat`
     (Repeating).
  3. Flip `students.is_active=False` for `withdraw`.
  4. Update the submission to `approved` + stamp reviewer identity.

All four happen inside the same `session` (the router hands us a
request-scoped `AsyncSession`); the outer FastAPI dependency commits on
success and rolls back on exception, so the whole `approve` is atomic
by default without an explicit `begin_nested()`. If the request handler
ever changes to auto-commit-per-statement we'd need a savepoint here.

An audit-log row is written on `approve` — same shape as the TS side,
so historic queries still work.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.features.audit.actions import PROMOTION_APPROVED as AUDIT_PROMOTION_APPROVED
from app.features.audit.service import write_audit_log
from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.exams.constants import DEFAULT_PASS_MARK
from app.features.notifications.audience import (
    AllAdminsAudience,
    AllTeachersAudience,
    StaffByDivisionAudience,
    resolve_audience,
)
from app.features.notifications.constants import (
    PROMOTION_APPROVED as NOTIF_PROMOTION_APPROVED,
)
from app.features.notifications.constants import (
    PROMOTION_REMINDER,
    PROMOTION_SEASON_OPENED,
    PROMOTION_SENT_BACK,
    PROMOTION_SUBMITTED,
)
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.promotions.academic_year import next_academic_year
from app.features.promotions.constants import (
    DEC_GRADUATE,
    DEC_PROMOTE,
    DEC_REPEAT,
    DEC_WITHDRAW,
    ENROLLMENT_ACTIVE,
    ENROLLMENT_COMPLETED,
    ENROLLMENT_REPEATING,
    SEASON_CLOSED,
    SEASON_OPEN,
    SUB_APPROVED,
    SUB_DRAFT,
    SUB_SENT_BACK,
    SUB_SUBMITTED,
    DecisionKind,
)
from app.features.promotions.model import (
    PromotionDecision,
    PromotionSeason,
    PromotionSubmission,
)
from app.features.promotions.next_class import (
    JHS_3,
    ClassLike,
    auto_pick_target_class,
    division_has_next_year_classes,
)
from app.features.promotions.repository import PromotionsRepository
from app.features.promotions.schema import DecisionUpdate
from app.features.promotions.suggestion import (
    CoreSubject,
    ScoreForSuggestion,
    compute_suggestion,
)
from app.features.schools.service import SchoolsService
from app.features.staff.repository import StaffRepository
from app.features.students.model import Student
from app.features.users.model import User


def _now() -> datetime:
    """DB DateTime columns are TIMESTAMP WITHOUT TIME ZONE — mirror the
    convention used by the other domains (see lesson_plans.service).
    Aware datetimes crash asyncpg on those columns."""
    return datetime.now(UTC).replace(tzinfo=None)


class PromotionsService:
    # ─── Season ─────────────────────────────────────────────────────────

    @staticmethod
    async def get_current_season(
        session: AsyncSession, school_id: UUID | str
    ) -> PromotionSeason | None:
        school = await SchoolsService.get(session, school_id)
        return await PromotionsRepository.find_season(session, school_id, school.academic_year)

    @staticmethod
    async def open_season(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        opened_by_id: UUID | str,
        override: bool,
    ) -> tuple[PromotionSeason, bool]:
        """Open (or re-open) the season for the school's current academic
        year. Returns (season, opened_with_override).

        Pre-flight rule: without a published Term-3 EndOfTerm exam the
        caller must pass `override=True`, otherwise 400. `override=True`
        with an already-published exam is allowed (`opened_with_override`
        will just be `False` since the fallback isn't needed).
        """
        school = await SchoolsService.get(session, school_id)
        year = school.academic_year

        existing = await PromotionsRepository.find_season(session, school_id, year)
        if existing and existing.status == SEASON_OPEN:
            raise ConflictError("Promotion season is already open.")

        exam_published = await PromotionsRepository.has_published_term3_end_of_term(
            session, school_id, year
        )
        if not exam_published and not override:
            raise ValidationError(
                "Term 3 End-of-Term exam is not published yet. Open with override "
                "to proceed without algorithmic suggestions."
            )

        opened_with_override = not exam_published
        now = _now()
        if existing:
            existing.status = SEASON_OPEN
            existing.opened_with_override = opened_with_override
            existing.opened_by_id = _to_uuid(opened_by_id)
            existing.opened_at = now
            existing.closed_by_id = None
            existing.closed_at = None
            existing.updated_at = now
            await session.flush()
            season_row: PromotionSeason = existing
        else:
            season_row = PromotionSeason(
                school_id=school_id,
                academic_year=year,
                status=SEASON_OPEN,
                opened_with_override=opened_with_override,
                opened_by_id=_to_uuid(opened_by_id),
                opened_at=now,
            )
            session.add(season_row)
            await session.flush()

        # Notify every Teacher in the school. Empty audience → no-op.
        await NotificationsService.notify_audience(
            session,
            school_id,
            AllTeachersAudience(),
            NotifyPayload(
                kind=PROMOTION_SEASON_OPENED,
                title="Promotion season opened",
                body=f"Submit promotion decisions for your students in {year}.",
                link="/teacher/promotions",
            ),
        )
        return season_row, opened_with_override

    @staticmethod
    async def close_season(
        session: AsyncSession, school_id: UUID | str, *, closed_by_id: UUID | str
    ) -> PromotionSeason:
        school = await SchoolsService.get(session, school_id)
        row = await PromotionsRepository.find_open_season(session, school_id, school.academic_year)
        if not row:
            raise NotFoundError("No open promotion season.")
        now = _now()
        row.status = SEASON_CLOSED
        row.closed_by_id = _to_uuid(closed_by_id)
        row.closed_at = now
        row.updated_at = now
        await session.flush()
        return row

    # ─── Submission lifecycle ──────────────────────────────────────────

    @staticmethod
    async def ensure_submission(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        class_id: UUID | str,
    ) -> PromotionSubmission:
        """Idempotent: on first call for a class this year, creates the
        submission row + one decision per active student with the
        algorithmic suggestion pre-filled. On subsequent calls it just
        top-ups any newly-enrolled students.

        Season must be open.
        """
        school = await SchoolsService.get(session, school_id)
        year = school.academic_year

        open_season = await PromotionsRepository.find_open_season(session, school_id, year)
        if not open_season:
            raise ConflictError("Promotion season is closed.")

        cls = await session.get(Class, class_id)
        if not cls:
            raise NotFoundError(f"Class {class_id!r} not found.")

        submission = await PromotionsRepository.find_submission_by_class(
            session, school_id, class_id, year
        )
        if not submission:
            submission = PromotionSubmission(
                school_id=school_id,
                class_id=class_id,
                academic_year=year,
                status=SUB_DRAFT,
            )
            session.add(submission)
            await session.flush()

        await _ensure_decisions_for_roster(
            session,
            school_id,
            submission,
            cls,
            year,
            pass_mark=school.pass_mark or DEFAULT_PASS_MARK,
        )
        return submission

    @staticmethod
    async def save_draft(
        session: AsyncSession,
        school_id: UUID | str,
        submission_id: UUID | str,
        *,
        updates: list[DecisionUpdate],
        actor_staff_id: UUID | str | None,
        actor_role: str,
    ) -> PromotionSubmission:
        """Persist decision edits. If the submission is `sent_back` any
        edit implicitly returns it to `draft` — mirrors the TS
        behaviour."""
        school = await SchoolsService.get(session, school_id)
        await _assert_season_open(session, school_id, school.academic_year)

        submission = await _load_submission(session, school_id, submission_id)
        await _assert_teacher_can_edit(session, school_id, submission, actor_staff_id, actor_role)
        if submission.status == SUB_APPROVED:
            raise ConflictError("Already approved; cannot edit.")

        await _apply_decision_updates(session, school_id, submission, updates)

        if submission.status == SUB_SENT_BACK:
            submission.status = SUB_DRAFT
            submission.updated_at = _now()
        await session.flush()
        return submission

    @staticmethod
    async def submit_list(
        session: AsyncSession,
        school_id: UUID | str,
        submission_id: UUID | str,
        *,
        updates: list[DecisionUpdate],
        actor_staff_id: UUID | str,
        actor_role: str,
    ) -> PromotionSubmission:
        """Apply any last edits, run the pre-flight (next-year classes
        exist + every decision complete), then flip to `submitted`."""
        school = await SchoolsService.get(session, school_id)
        year = school.academic_year
        await _assert_season_open(session, school_id, year)

        submission = await _load_submission(session, school_id, submission_id)
        await _assert_teacher_can_edit(session, school_id, submission, actor_staff_id, actor_role)
        if submission.status == SUB_APPROVED:
            raise ConflictError("Already approved.")
        if submission.status == SUB_SUBMITTED:
            raise ConflictError("Already submitted.")

        cls = await session.get(Class, submission.class_id)
        if not cls:
            raise NotFoundError("Class not found.")

        next_year = next_academic_year(cls.academic_year)
        next_year_classes = await PromotionsRepository.next_year_classes_for_division(
            session, school_id, next_year, cls.division
        )
        if not division_has_next_year_classes(
            cls.division,
            [ClassLike(id=c.id, name=c.name, division=c.division) for c in next_year_classes],
        ):
            raise ValidationError(
                f"No {next_year} classes exist for {cls.division}. Ask Admin to set them up first."
            )

        await _apply_decision_updates(session, school_id, submission, updates)

        # Roster-completeness pre-flight: every decision must be
        # actionable. Promote needs a target class; repeat also needs
        # one (auto-derived above, but a division with no matching
        # next-year class leaves it unset — catch that here rather
        # than at approve time); repeat/withdraw need a reason
        # (graduate is terminal and doesn't need either).
        decisions = await PromotionsRepository.list_decisions_for_submission(session, submission.id)
        for d in decisions:
            if d.decision == DEC_PROMOTE and d.target_class_id is None:
                raise ValidationError("Every promoted student needs a target class.")
            if d.decision == DEC_REPEAT and d.target_class_id is None:
                raise ValidationError(
                    f"No {next_year} class exists for repeating this student's class. "
                    "Ask Admin to set it up first."
                )
            if d.decision in {DEC_REPEAT, DEC_WITHDRAW} and not (d.reason or "").strip():
                raise ValidationError(f"Every {d.decision} decision needs a reason.")

        now = _now()
        submission.status = SUB_SUBMITTED
        submission.submitted_by_id = _to_uuid(actor_staff_id)
        submission.submitted_at = now
        submission.updated_at = now
        await session.flush()

        await _notify_promotion_reviewers(
            session,
            school_id,
            submission_id=submission.id,
            division=cls.division,
            class_name=cls.name,
            academic_year=year,
        )
        return submission

    @staticmethod
    async def send_back(
        session: AsyncSession,
        school_id: UUID | str,
        submission_id: UUID | str,
        *,
        comment: str,
        reviewer_staff_id: UUID | str,
        actor_role: str,
    ) -> PromotionSubmission:
        school = await SchoolsService.get(session, school_id)
        await _assert_season_open(session, school_id, school.academic_year)

        submission = await _load_submission(session, school_id, submission_id)
        cls = await session.get(Class, submission.class_id)
        if not cls:
            raise NotFoundError("Class not found.")
        await _assert_reviewer_can_review(session, school_id, actor_role, reviewer_staff_id, cls)
        if submission.status != SUB_SUBMITTED:
            raise ConflictError("Only submitted lists can be sent back.")
        if not comment.strip():
            raise ValidationError("Please add a comment explaining what to revise.")

        now = _now()
        submission.status = SUB_SENT_BACK
        submission.reviewed_by_id = _to_uuid(reviewer_staff_id)
        submission.reviewed_at = now
        submission.updated_at = now
        await session.flush()

        await PromotionsRepository.insert_comment(
            session,
            submission_id=submission.id,
            author_id=reviewer_staff_id,
            body=comment.strip(),
        )

        # Notify the teacher who submitted the list. Skip if there's no
        # `submitted_by_id` — shouldn't happen in practice (submit sets
        # it) but be defensive: `send_back` can run on rows written by
        # tests or migrations that skip the submit step.
        if submission.submitted_by_id is not None:
            teacher_user = await NotificationsService.find_user_for_linked(
                session, school_id, submission.submitted_by_id
            )
            if teacher_user is not None:
                await NotificationsService.notify_user(
                    session,
                    school_id,
                    user_id=teacher_user.id,
                    payload=NotifyPayload(
                        kind=PROMOTION_SENT_BACK,
                        title="Promotion list sent back",
                        body=f"{cls.name}: {comment.strip()}",
                        link=f"/teacher/promotions/{submission.class_id}",
                    ),
                )
        return submission

    @staticmethod
    async def approve(
        session: AsyncSession,
        school_id: UUID | str,
        submission_id: UUID | str,
        *,
        reviewer_staff_id: UUID | str,
        actor_user_id: UUID | str,
        actor_role: str,
    ) -> PromotionSubmission:
        """Transactional approve — materialises next-year enrolments.

        Steps (all inside one FastAPI request → one DB session → one
        commit at handler return):

          1. Close current-year Active enrolments for the affected
             students.
          2. Insert next-year enrolments for promote (Active) and
             repeat (Repeating).
          3. Flip students.is_active=False for withdraw.
          4. Update the submission to approved + reviewer stamp.
          5. Write an audit row.

        If any step raises, the outer session rolls back everything —
        so a bad target_class_id on one row cancels the whole class.
        """
        school = await SchoolsService.get(session, school_id)
        await _assert_season_open(session, school_id, school.academic_year)

        submission = await _load_submission(session, school_id, submission_id)
        if submission.status != SUB_SUBMITTED:
            raise ConflictError("Only submitted lists can be approved.")

        cls = await session.get(Class, submission.class_id)
        if not cls:
            raise NotFoundError("Class not found.")
        await _assert_reviewer_can_review(session, school_id, actor_role, reviewer_staff_id, cls)

        decisions = await PromotionsRepository.list_decisions_for_submission(session, submission.id)
        student_ids = [d.student_id for d in decisions]

        # 1. Close current-year Active enrolments.
        if student_ids:
            await session.execute(
                update(Enrollment)
                .where(
                    and_(
                        Enrollment.student_id.in_(student_ids),
                        Enrollment.academic_year == submission.academic_year,
                        Enrollment.status == ENROLLMENT_ACTIVE,
                    )
                )
                .values(status=ENROLLMENT_COMPLETED)
            )

        # 2. New enrolments for Promote (Active) + Repeat (Repeating).
        target_year = next_academic_year(submission.academic_year)
        new_enrollments: list[Enrollment] = []
        for d in decisions:
            if d.decision not in {DEC_PROMOTE, DEC_REPEAT}:
                continue
            if d.target_class_id is None:
                # Should already be blocked by submit-time pre-flight,
                # but guard here too so a manual DB tweak doesn't sneak
                # a broken row through.
                raise ValidationError("A promoted/repeating student has no target class.")
            new_enrollments.append(
                Enrollment(
                    student_id=d.student_id,
                    class_id=d.target_class_id,
                    academic_year=target_year,
                    status=ENROLLMENT_REPEATING if d.decision == DEC_REPEAT else ENROLLMENT_ACTIVE,
                    enrollment_date=_now().date(),
                )
            )
        if new_enrollments:
            session.add_all(new_enrollments)

        # 3. Withdraw → flip students.is_active=False.
        withdraw_ids = [d.student_id for d in decisions if d.decision == DEC_WITHDRAW]
        if withdraw_ids:
            await session.execute(
                update(Student).where(Student.id.in_(withdraw_ids)).values(is_active=False)
            )

        # 4. Submission status + stamp.
        now = _now()
        submission.status = SUB_APPROVED
        submission.reviewed_by_id = _to_uuid(reviewer_staff_id)
        submission.reviewed_at = now
        submission.updated_at = now

        # 5. Audit log — kind of hot-path but writes are cheap and this
        # is exactly the kind of event we want a record of.
        counts = {
            "decisionCount": len(decisions),
            "promoted": sum(1 for d in decisions if d.decision == DEC_PROMOTE),
            "repeating": sum(1 for d in decisions if d.decision == DEC_REPEAT),
            "withdrawn": sum(1 for d in decisions if d.decision == DEC_WITHDRAW),
            "graduated": sum(1 for d in decisions if d.decision == DEC_GRADUATE),
        }
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=AUDIT_PROMOTION_APPROVED,
            target_table="promotion_submissions",
            target_id=submission.id,
            after=counts,
        )

        await session.flush()

        # Notify the teacher who submitted the list. Skip if there's no
        # `submitted_by_id` — same defensive check as `send_back`.
        if submission.submitted_by_id is not None:
            teacher_user = await NotificationsService.find_user_for_linked(
                session, school_id, submission.submitted_by_id
            )
            if teacher_user is not None:
                await NotificationsService.notify_user(
                    session,
                    school_id,
                    user_id=teacher_user.id,
                    payload=NotifyPayload(
                        kind=NOTIF_PROMOTION_APPROVED,
                        title="Promotion list approved",
                        body=f"{cls.name}'s promotion list was approved.",
                        link=f"/teacher/promotions/{submission.class_id}",
                    ),
                )
        return submission

    @staticmethod
    async def bulk_approve(
        session: AsyncSession,
        school_id: UUID | str,
        submission_ids: Sequence[UUID | str],
        *,
        reviewer_staff_id: UUID | str,
        actor_user_id: UUID | str,
        actor_role: str,
    ) -> list[tuple[UUID, str, bool, str | None]]:
        """Best-effort — each submission is attempted independently via a
        SAVEPOINT, so one bad row (e.g. missing target class, wrong
        division for this reviewer) rolls back only that submission's
        changes, not the whole batch. Returns one
        (submission_id, class_name, success, error) tuple per input id,
        same order as given."""
        results: list[tuple[UUID, str, bool, str | None]] = []
        for submission_id in submission_ids:
            sid = _to_uuid(submission_id)
            cls_name = "Unknown class"
            try:
                async with session.begin_nested():
                    submission = await _load_submission(session, school_id, sid)
                    cls = await session.get(Class, submission.class_id)
                    if cls:
                        cls_name = cls.name
                    await PromotionsService.approve(
                        session,
                        school_id,
                        sid,
                        reviewer_staff_id=reviewer_staff_id,
                        actor_user_id=actor_user_id,
                        actor_role=actor_role,
                    )
                results.append((sid, cls_name, True, None))
            except (ConflictError, ValidationError, NotFoundError, ForbiddenError) as exc:
                results.append((sid, cls_name, False, str(exc)))
        return results

    @staticmethod
    async def send_unsubmitted_reminders(session: AsyncSession, school_id: UUID | str) -> int:
        """Weekly job entry point. Reminds each class teacher whose
        promotion list isn't yet submitted/approved while the season is
        open — mirrors `FeesService.send_overdue_reminders`'s shape.
        Returns the number of classes just reminded.

        Classes with no submission row yet (the teacher never opened
        the page) are created via `ensure_submission` first, so there's
        always a row to stamp the cooldown on."""
        school = await SchoolsService.get(session, school_id)
        year = school.academic_year
        open_season = await PromotionsRepository.find_open_season(session, school_id, year)
        if not open_season:
            return 0

        now = _now()
        candidates = await PromotionsRepository.classes_needing_reminder(
            session, school_id, year, remind_again_after=now - _REMINDER_COOLDOWN
        )
        if not candidates:
            return 0

        reminded = 0
        for cls, submission in candidates:
            if submission is None:
                submission = await PromotionsService.ensure_submission(
                    session, school_id, class_id=cls.id
                )

            class_teachers = await PromotionsRepository.class_teachers_by_class(session, [cls.id])
            for staff, _is_primary in class_teachers.get(str(cls.id), []):
                teacher_user = await NotificationsService.find_user_for_linked(
                    session, school_id, staff.id
                )
                if teacher_user is None:
                    continue
                await NotificationsService.notify_user(
                    session,
                    school_id,
                    user_id=teacher_user.id,
                    payload=NotifyPayload(
                        kind=PROMOTION_REMINDER,
                        title="Promotion list still pending",
                        body=f"{cls.name}'s promotion list hasn't been submitted yet.",
                        link=f"/teacher/promotions/{cls.id}",
                    ),
                )

            submission.last_reminder_sent_at = now
            reminded += 1

        await session.flush()
        return reminded


# ─── Internal helpers ───────────────────────────────────────────────────────


_REMINDER_COOLDOWN = timedelta(days=6)

_PROMOTION_REVIEW_PATH: dict[str, str] = {
    ADMIN: "/admin/promotions/{id}",
    DEPUTY_HEAD: "/deputy-head/promotions/{id}",
}


async def _notify_promotion_reviewers(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    submission_id: UUID | str,
    division: str,
    class_name: str,
    academic_year: str,
) -> None:
    """Fans out `PROMOTION_SUBMITTED` to every eligible reviewer — every
    Deputy Head of the class's division plus every Admin, both
    simultaneously eligible to approve/send-back (mirrors
    `LeaveRequestsService`'s dual-eligibility approver audience). In-app
    only — promotions predates the email/SMS notification initiative,
    so this matches the existing `PROMOTION_SEASON_OPENED`/
    `PROMOTION_SENT_BACK` calls rather than introducing a new channel."""
    approver_ids: set[UUID] = set(
        await resolve_audience(
            session,
            school_id,
            StaffByDivisionAudience(division=division, roles=[DEPUTY_HEAD]),
            academic_year=academic_year,
        )
    )
    approver_ids.update(
        await resolve_audience(session, school_id, AllAdminsAudience(), academic_year=academic_year)
    )
    if not approver_ids:
        return

    approvers = (
        (await session.execute(select(User).where(User.id.in_(approver_ids)))).scalars().all()
    )
    body = f"{class_name} submitted their promotion list for review."
    for approver in approvers:
        path_template = _PROMOTION_REVIEW_PATH.get(approver.role)
        if not path_template:
            continue
        await NotificationsService.notify_user(
            session,
            school_id,
            user_id=approver.id,
            payload=NotifyPayload(
                kind=PROMOTION_SUBMITTED,
                title="Promotion list submitted",
                body=body,
                link=path_template.format(id=submission_id),
            ),
        )


def _to_uuid(value: UUID | str) -> UUID:
    """Router hands us `linked_id` as `str`; models want `UUID`. One
    coercion here beats sprinkling it everywhere."""
    return value if isinstance(value, UUID) else UUID(str(value))


async def _load_submission(
    session: AsyncSession,
    school_id: UUID | str,
    submission_id: UUID | str,
) -> PromotionSubmission:
    """Tenant-scoped load. Any request for a submission owned by another
    school returns the same NotFoundError we'd raise for a bogus id, so
    a cross-tenant caller can't enumerate valid ids."""
    row = await PromotionsRepository.find_submission_by_id(session, school_id, submission_id)
    if not row:
        raise NotFoundError(f"Submission {submission_id!r} not found.")
    return row


async def _assert_season_open(
    session: AsyncSession, school_id: UUID | str, academic_year: str
) -> None:
    row = await PromotionsRepository.find_open_season(session, school_id, academic_year)
    if not row:
        raise ConflictError("Promotion season is closed.")


async def _assert_teacher_can_edit(
    session: AsyncSession,
    school_id: UUID | str,
    submission: PromotionSubmission,
    actor_staff_id: UUID | str | None,
    actor_role: str,
) -> None:
    """Only Admin or a `class_teachers` row for that class can edit."""
    if actor_role == ADMIN:
        return
    if actor_role != TEACHER or not actor_staff_id:
        raise ForbiddenError("Only the class teacher or Admin can edit this list.")
    stmt = (
        select(literal(1))
        .select_from(ClassTeacher)
        .where(
            and_(
                ClassTeacher.class_id == submission.class_id,
                ClassTeacher.staff_id == actor_staff_id,
            )
        )
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        raise ForbiddenError("Only the class teacher or Admin can edit this list.")


async def _assert_reviewer_can_review(
    session: AsyncSession,
    school_id: UUID | str,
    actor_role: str,
    reviewer_staff_id: UUID | str,
    cls: Class,
) -> None:
    """Admin can review any submission; DeputyHead only in their division."""
    if actor_role == ADMIN:
        return
    if actor_role != DEPUTY_HEAD:
        raise ForbiddenError("Only Deputy Head or Admin can review promotions.")
    # Compare the DH's division to the submission class's division.
    staff = await StaffRepository.get_by_id(session, school_id, reviewer_staff_id)
    if staff and staff.division == cls.division:
        return
    raise ForbiddenError("Deputy Head can only review promotions in their own division.")


async def _apply_decision_updates(
    session: AsyncSession,
    school_id: UUID | str,
    submission: PromotionSubmission,
    updates: list[DecisionUpdate],
) -> None:
    """Per-row UPDATEs. One roundtrip per row is fine at class-size
    volumes (~30-50). Larger batches could switch to an INSERT ...
    ON CONFLICT UPDATE, but that's over-engineering for now.

    A repeat decision's target class isn't a real choice — it's always
    "the same class name, next year" — so unlike promote (which the UI
    lets the teacher pick from a dropdown), the frontend never collects
    one for repeat. Auto-derive it here the same way
    `_ensure_decisions_for_roster` already does for the initial
    algorithmic suggestion, so a teacher manually switching a decision
    to Repeat doesn't submit successfully only to blow up at approve
    time with "no target class"."""
    cls = await session.get(Class, submission.class_id)
    class_likes: list[ClassLike] = []
    if cls is not None:
        next_year_classes = await PromotionsRepository.next_year_classes_for_division(
            session, school_id, next_academic_year(submission.academic_year), cls.division
        )
        class_likes = [
            ClassLike(id=c.id, name=c.name, division=c.division) for c in next_year_classes
        ]

    for u in updates:
        reason = (u.reason or "").strip() or None
        target_class_id = u.target_class_id
        if u.decision == DEC_REPEAT and target_class_id is None and cls is not None:
            auto_id = auto_pick_target_class(cls.name, class_likes, DEC_REPEAT)
            target_class_id = _to_uuid(auto_id) if auto_id else None

        await session.execute(
            update(PromotionDecision)
            .where(
                and_(
                    PromotionDecision.submission_id == submission.id,
                    PromotionDecision.student_id == u.student_id,
                )
            )
            .values(
                decision=u.decision,
                target_class_id=target_class_id,
                reason=reason,
                updated_at=_now(),
            )
        )


async def _ensure_decisions_for_roster(
    session: AsyncSession,
    school_id: UUID | str,
    submission: PromotionSubmission,
    cls: Class,
    academic_year: str,
    *,
    pass_mark: int,
) -> None:
    """Insert one PromotionDecision per active student who doesn't
    already have one, prefilling the algorithmic suggestion."""
    term3_exam = await PromotionsRepository.get_term3_exam(session, school_id, academic_year)
    exam_published = term3_exam is not None

    core_subjects = await PromotionsRepository.core_subjects_for_division(
        session, school_id, cls.division
    )
    next_year_classes = await PromotionsRepository.next_year_classes_for_division(
        session, school_id, next_academic_year(cls.academic_year), cls.division
    )
    class_likes = [ClassLike(id=c.id, name=c.name, division=c.division) for c in next_year_classes]

    roster = await PromotionsRepository.active_students_in_class(session, cls.id, academic_year)
    existing = await PromotionsRepository.existing_student_ids_for_submission(
        session, submission.id
    )

    new_rows: list[PromotionDecision] = []
    for student in roster:
        if str(student.id) in existing:
            continue

        scores = (
            await PromotionsRepository.scores_for_student_in_exam(
                session, term3_exam.id, student.id
            )
            if term3_exam
            else []
        )

        suggestion = compute_suggestion(
            class_name=cls.name,
            division_core_subjects=[CoreSubject(id=s.id, name=s.name) for s in core_subjects],
            scores_for_student=[
                ScoreForSuggestion(subject_id=s.subject_id, total_score=s.total_score)
                for s in scores
            ],
            exam_published=exam_published,
            fail_threshold=pass_mark,
        )
        initial_decision: DecisionKind = (
            suggestion.suggested_decision  # type: ignore[assignment]
            if suggestion
            else (DEC_GRADUATE if cls.name == JHS_3 else DEC_PROMOTE)
        )
        target_class_id = (
            auto_pick_target_class(cls.name, class_likes, DEC_PROMOTE)
            if initial_decision == DEC_PROMOTE
            else auto_pick_target_class(cls.name, class_likes, DEC_REPEAT)
            if initial_decision == DEC_REPEAT
            else None
        )

        new_rows.append(
            PromotionDecision(
                submission_id=submission.id,
                student_id=student.id,
                decision=initial_decision,
                target_class_id=(_to_uuid(target_class_id) if target_class_id else None),
                reason=None,
                suggested_decision=(suggestion.suggested_decision if suggestion else None),
                suggested_reason=(suggestion.suggested_reason if suggestion else None),
                failed_core_subjects=(suggestion.failed_core_subjects if suggestion else None),
            )
        )
    if new_rows:
        session.add_all(new_rows)
        await session.flush()
