"""HTTP routes for Promotions.

  GET  /promotions/season                    → current season header (any role)
  GET  /promotions/term3-exam-status         → exam-published flag, available pre-season (any role)
  POST /promotions/season/open               → open (Admin)
  POST /promotions/season/close              → close (Admin)

  GET  /promotions/overview                  → Admin overview (Admin)
  GET  /promotions/dh-queue                  → Deputy queue (DeputyHead)
  GET  /promotions/teacher-classes           → Teacher's own classes (Teacher)

  POST /promotions/submissions/ensure        → idempotent create + prefill
  GET  /promotions/submissions/{id}          → detail
  GET  /promotions/submissions/by-class/{c}  → detail keyed by class_id
  PATCH /promotions/submissions/{id}/decisions → save draft
  POST /promotions/submissions/{id}/submit   → submit (teacher/admin)
  POST /promotions/submissions/{id}/approve  → transactional approve (DH/Admin)
  POST /promotions/submissions/{id}/send-back → send back (DH/Admin)
  POST /promotions/submissions/bulk-approve  → approve several at once, best-effort (DH/Admin)

Role gates:
  * Admin — everything
  * DeputyHead — read overview + DH queue for their division; approve + send-back
  * Teacher — read own class submissions; ensure/save/submit for own classes
  * Parent, Accountant — 403 across the board
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError, NotFoundError
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.features.classes.model import Class, ClassTeacher
from app.features.promotions.academic_year import next_academic_year
from app.features.promotions.model import (
    PromotionDecision,
    PromotionSeason,
    PromotionSubmission,
)
from app.features.promotions.repository import PromotionsRepository
from app.features.promotions.schema import (
    BulkApproveRequest,
    BulkApproveResponse,
    BulkApproveResult,
    ClassTeacherView,
    DecisionRead,
    DeputyHeadQueueResponse,
    DeputyHeadQueueRow,
    EnsureSubmissionRequest,
    EnsureSubmissionResponse,
    NextYearClassOption,
    OverviewResponse,
    OverviewRow,
    PromotionCommentRead,
    SaveDraftRequest,
    SeasonOpenRequest,
    SeasonOpenResponse,
    SeasonRead,
    SendBackRequest,
    SubmissionDetail,
    SubmissionRead,
    SubmitListRequest,
    TeacherClassesResponse,
    TeacherClassRow,
    Term3ExamStatus,
)
from app.features.promotions.service import PromotionsService
from app.features.schools.service import SchoolsService
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.students.model import Student

router = APIRouter(prefix="/promotions", tags=["promotions"])


# ─── Helpers ────────────────────────────────────────────────────────────────


def _to_season_read(
    row: PromotionSeason, staff_by_id: dict[str, Staff], *, has_published_term3_end_of_term: bool
) -> SeasonRead:
    opened_by = staff_by_id.get(str(row.opened_by_id)) if row.opened_by_id else None
    closed_by = staff_by_id.get(str(row.closed_by_id)) if row.closed_by_id else None
    return SeasonRead(
        id=row.id,
        school_id=row.school_id,
        academic_year=row.academic_year,
        status=row.status,
        opened_with_override=row.opened_with_override,
        opened_by_id=row.opened_by_id,
        opened_by_name=(f"{opened_by.first_name} {opened_by.last_name}" if opened_by else None),
        opened_at=row.opened_at,
        closed_by_id=row.closed_by_id,
        closed_by_name=(f"{closed_by.first_name} {closed_by.last_name}" if closed_by else None),
        closed_at=row.closed_at,
        has_published_term3_end_of_term=has_published_term3_end_of_term,
    )


def _to_submission_read(row: PromotionSubmission, staff_by_id: dict[str, Staff]) -> SubmissionRead:
    submitted_by = staff_by_id.get(str(row.submitted_by_id)) if row.submitted_by_id else None
    reviewed_by = staff_by_id.get(str(row.reviewed_by_id)) if row.reviewed_by_id else None
    return SubmissionRead(
        id=row.id,
        school_id=row.school_id,
        class_id=row.class_id,
        academic_year=row.academic_year,
        status=row.status,
        submitted_by_id=row.submitted_by_id,
        submitted_by_name=(
            f"{submitted_by.first_name} {submitted_by.last_name}" if submitted_by else None
        ),
        submitted_at=row.submitted_at,
        reviewed_by_id=row.reviewed_by_id,
        reviewed_by_name=(
            f"{reviewed_by.first_name} {reviewed_by.last_name}" if reviewed_by else None
        ),
        reviewed_at=row.reviewed_at,
    )


def _require_admin(user: CurrentUserDep) -> None:
    if user.role != ADMIN:
        raise ForbiddenError("Only Admin can perform this action.")


def _require_admin_or_deputy(user: CurrentUserDep) -> None:
    if user.role not in {ADMIN, DEPUTY_HEAD}:
        raise ForbiddenError("Only Admin or Deputy Head can perform this action.")


# ─── Season ─────────────────────────────────────────────────────────────────


@router.get("/season", response_model=SeasonRead | None, response_model_by_alias=True)
async def get_season(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SeasonRead | None:
    """Any authenticated role in the school can read the current season
    header. Returns `null` if no season exists yet for this year."""
    _ = user
    row = await PromotionsService.get_current_season(session, school_id)
    if row is None:
        return None
    staff_by_id = await PromotionsRepository.staff_by_ids(
        session, [row.opened_by_id, row.closed_by_id]
    )
    exam_published = await PromotionsRepository.has_published_term3_end_of_term(
        session, school_id, row.academic_year
    )
    return _to_season_read(row, staff_by_id, has_published_term3_end_of_term=exam_published)


@router.get(
    "/term3-exam-status",
    response_model=Term3ExamStatus,
    response_model_by_alias=True,
)
async def get_term3_exam_status(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> Term3ExamStatus:
    """Available even before a season row exists — the Admin page
    needs this to show the override warning before the first
    `season/open` call of the year, when `GET /season` still returns
    `null`."""
    _ = user
    school = await SchoolsService.get(session, school_id)
    exam_published = await PromotionsRepository.has_published_term3_end_of_term(
        session, school_id, school.academic_year
    )
    return Term3ExamStatus(has_published_term3_end_of_term=exam_published)


@router.post(
    "/season/open",
    response_model=SeasonOpenResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def open_season(
    payload: SeasonOpenRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SeasonOpenResponse:
    _require_admin(user)
    if not user.linked_id:
        raise ForbiddenError("Admin identity missing.")
    row, opened_with_override = await PromotionsService.open_season(
        session, school_id, opened_by_id=user.linked_id, override=payload.override
    )
    staff_by_id = await PromotionsRepository.staff_by_ids(
        session, [row.opened_by_id, row.closed_by_id]
    )
    exam_published = await PromotionsRepository.has_published_term3_end_of_term(
        session, school_id, row.academic_year
    )
    return SeasonOpenResponse(
        opened_with_override=opened_with_override,
        season=_to_season_read(row, staff_by_id, has_published_term3_end_of_term=exam_published),
    )


@router.post(
    "/season/close",
    response_model=SeasonRead,
    response_model_by_alias=True,
)
async def close_season(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SeasonRead:
    _require_admin(user)
    if not user.linked_id:
        raise ForbiddenError("Admin identity missing.")
    row = await PromotionsService.close_season(session, school_id, closed_by_id=user.linked_id)
    staff_by_id = await PromotionsRepository.staff_by_ids(
        session, [row.opened_by_id, row.closed_by_id]
    )
    exam_published = await PromotionsRepository.has_published_term3_end_of_term(
        session, school_id, row.academic_year
    )
    return _to_season_read(row, staff_by_id, has_published_term3_end_of_term=exam_published)


# ─── Overview / queues ──────────────────────────────────────────────────────


@router.get(
    "/overview",
    response_model=OverviewResponse,
    response_model_by_alias=True,
)
async def get_overview(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> OverviewResponse:
    """Admin overview across every class this academic year."""
    _require_admin(user)
    school = await SchoolsService.get(session, school_id)
    year = school.academic_year

    classes = await PromotionsRepository.classes_for_school_year(session, school_id, year)
    class_ids = [c.id for c in classes]
    teachers_by_class = await PromotionsRepository.class_teachers_by_class(session, class_ids)
    submissions = await PromotionsRepository.list_submissions_for_school(session, school_id, year)
    submission_by_class = {str(s.class_id): s for s in submissions}
    submission_staff = await PromotionsRepository.staff_by_ids(
        session,
        [s.submitted_by_id for s in submissions] + [s.reviewed_by_id for s in submissions],
    )
    decision_counts = await PromotionsRepository.decision_count_by_submission(
        session, [s.id for s in submissions]
    )
    enrolled_counts = await PromotionsRepository.active_enrollment_count_by_class(
        session, year, class_ids
    )

    items: list[OverviewRow] = []
    for c in classes:
        sub = submission_by_class.get(str(c.id))
        items.append(
            OverviewRow(
                class_id=c.id,
                class_name=c.name,
                division=c.division,
                class_teachers=[
                    ClassTeacherView(
                        staff_id=t.id,
                        staff_name=f"{t.first_name} {t.last_name}",
                        is_primary=is_primary,
                    )
                    for t, is_primary in teachers_by_class.get(str(c.id), [])
                ],
                total_students=enrolled_counts.get(str(c.id), 0),
                decided_count=(decision_counts.get(str(sub.id), 0) if sub else 0),
                submission=(_to_submission_read(sub, submission_staff) if sub else None),
            )
        )
    return OverviewResponse(items=items, total=len(items), page=1, size=len(items))


@router.get(
    "/dh-queue",
    response_model=DeputyHeadQueueResponse,
    response_model_by_alias=True,
)
async def get_dh_queue(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> DeputyHeadQueueResponse:
    """Deputy Head queue for the caller's own division. Admin is served
    by /overview instead — this endpoint is scoped strictly to a
    DeputyHead's division."""
    if user.role != DEPUTY_HEAD:
        raise ForbiddenError("Only a Deputy Head can view this queue.")
    if not user.linked_id:
        raise ForbiddenError("Deputy identity missing.")
    staff = await StaffRepository.get_by_id(session, school_id, user.linked_id)
    if not staff or not staff.division:
        raise ForbiddenError("Deputy Head has no assigned division.")

    school = await SchoolsService.get(session, school_id)
    year = school.academic_year

    classes = await PromotionsRepository.classes_for_school_year(session, school_id, year)
    division_classes = [c for c in classes if c.division == staff.division]
    class_ids = [c.id for c in division_classes]

    submissions = await PromotionsRepository.list_submissions_for_classes(session, class_ids, year)
    submission_staff = await PromotionsRepository.staff_by_ids(
        session,
        [s.submitted_by_id for s in submissions] + [s.reviewed_by_id for s in submissions],
    )
    teachers_by_class = await PromotionsRepository.class_teachers_by_class(session, class_ids)
    class_by_id: dict[str, Class] = {str(c.id): c for c in division_classes}

    rows: list[tuple[PromotionSubmission, Class, list[str]]] = []
    for s in submissions:
        cls = class_by_id.get(str(s.class_id))
        if not cls:
            continue
        teacher_names = [
            f"{t.first_name} {t.last_name}" for t, _ in teachers_by_class.get(str(cls.id), [])
        ]
        rows.append((s, cls, teacher_names))

    sorted_rows = PromotionsRepository.sort_submissions_for_dh_queue(rows)

    items = [
        DeputyHeadQueueRow(
            submission=_to_submission_read(s, submission_staff),
            class_id=cls.id,
            class_name=cls.name,
            division=cls.division,
            class_teacher_names=teacher_names,
        )
        for s, cls, teacher_names in sorted_rows
    ]
    return DeputyHeadQueueResponse(items=items, total=len(items), page=1, size=len(items))


@router.get(
    "/teacher-classes",
    response_model=TeacherClassesResponse,
    response_model_by_alias=True,
)
async def get_teacher_classes(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> TeacherClassesResponse:
    """Classes the caller is assigned to via `class_teachers` for the
    current academic year, with the current submission (if any)."""
    if user.role != TEACHER:
        raise ForbiddenError("Only a Teacher can view their assigned classes.")
    if not user.linked_id:
        raise ForbiddenError("Teacher identity missing.")

    school = await SchoolsService.get(session, school_id)
    year = school.academic_year

    my_classes = await PromotionsRepository.classes_for_teacher(
        session, school_id, user.linked_id, year
    )
    class_ids = [cls.id for cls, _ in my_classes]

    submissions = await PromotionsRepository.list_submissions_for_classes(session, class_ids, year)
    submission_by_class = {str(s.class_id): s for s in submissions}
    submission_staff = await PromotionsRepository.staff_by_ids(
        session,
        [s.submitted_by_id for s in submissions] + [s.reviewed_by_id for s in submissions],
    )
    enrolled_counts = await PromotionsRepository.active_enrollment_count_by_class(
        session, year, class_ids
    )

    items = [
        TeacherClassRow(
            class_id=cls.id,
            class_name=cls.name,
            division=cls.division,
            is_primary=is_primary,
            total_students=enrolled_counts.get(str(cls.id), 0),
            submission=(
                _to_submission_read(submission_by_class[str(cls.id)], submission_staff)
                if str(cls.id) in submission_by_class
                else None
            ),
        )
        for cls, is_primary in my_classes
    ]
    return TeacherClassesResponse(items=items, total=len(items), page=1, size=len(items))


# ─── Submission CRUD ────────────────────────────────────────────────────────


@router.post(
    "/submissions/ensure",
    response_model=EnsureSubmissionResponse,
    response_model_by_alias=True,
)
async def ensure_submission(
    payload: EnsureSubmissionRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> EnsureSubmissionResponse:
    """Admin or the class's own teacher may kick this off."""
    if user.role not in {ADMIN, TEACHER}:
        raise ForbiddenError("Only Admin or the class teacher can open a list.")
    if user.role == TEACHER:
        if not user.linked_id:
            raise ForbiddenError("Teacher identity missing.")
        # Confirm the teacher actually teaches this class.
        stmt = (
            select(literal(1))
            .select_from(ClassTeacher)
            .where(
                and_(
                    ClassTeacher.class_id == payload.class_id,
                    ClassTeacher.staff_id == user.linked_id,
                )
            )
        )
        if (await session.execute(stmt)).first() is None:
            raise ForbiddenError("You aren't a class teacher for this class.")

    submission = await PromotionsService.ensure_submission(
        session, school_id, class_id=payload.class_id
    )
    return EnsureSubmissionResponse(submission_id=submission.id)


async def _build_detail(
    session: AsyncSession, school_id: UUID | str, submission: PromotionSubmission
) -> SubmissionDetail:
    cls = await session.get(Class, submission.class_id)
    if not cls:
        raise NotFoundError("Class not found.")
    nx_year = next_academic_year(cls.academic_year)
    # School-wide, not filtered by this class's own division — a
    # cross-division promotion (e.g. Primary 6 → JHS 1) needs the target
    # class from a different division to actually appear in this dropdown.
    next_year_classes = await PromotionsRepository.classes_for_school_year(
        session, school_id, nx_year
    )
    decisions = await PromotionsRepository.list_decisions_for_submission(session, submission.id)
    students_by_id = await PromotionsRepository.students_by_ids(
        session, [d.student_id for d in decisions]
    )
    submission_staff = await PromotionsRepository.staff_by_ids(
        session, [submission.submitted_by_id, submission.reviewed_by_id]
    )
    teachers = await PromotionsRepository.class_teachers_by_class(session, [cls.id])
    comment_rows = await PromotionsRepository.list_comments_for_submission(session, submission.id)

    decision_reads = _sort_decisions(_decision_reads(decisions, students_by_id))
    return SubmissionDetail(
        submission=_to_submission_read(submission, submission_staff),
        class_name=cls.name,
        division=cls.division,
        next_academic_year=nx_year,
        next_year_classes=[NextYearClassOption(id=c.id, name=c.name) for c in next_year_classes],
        decisions=decision_reads,
        class_teachers=[
            ClassTeacherView(
                staff_id=t.id,
                staff_name=f"{t.first_name} {t.last_name}",
                is_primary=is_primary,
            )
            for t, is_primary in teachers.get(str(cls.id), [])
        ],
        comments=[
            PromotionCommentRead(
                id=c.id,
                author_id=c.author_id,
                author_name=f"{author.first_name} {author.last_name}",
                body=c.body,
                created_at=c.created_at,
            )
            for c, author in comment_rows
        ],
    )


def _decision_reads(
    decisions: list[PromotionDecision],
    students_by_id: dict[str, Student],
) -> list[DecisionRead]:
    result: list[DecisionRead] = []
    for d in decisions:
        student = students_by_id.get(str(d.student_id))
        if student is None:
            display_name = str(d.student_id)
            photo = None
        else:
            middle = f" {student.middle_name}" if student.middle_name else ""
            display_name = f"{student.first_name}{middle} {student.last_name}"
            photo = student.photo_url
        result.append(
            DecisionRead(
                id=d.id,
                submission_id=d.submission_id,
                student_id=d.student_id,
                student_name=display_name,
                student_photo_url=photo,
                decision=d.decision,
                target_class_id=d.target_class_id,
                reason=d.reason,
                suggested_decision=d.suggested_decision,
                suggested_reason=d.suggested_reason,
                failed_core_subjects=d.failed_core_subjects,
            )
        )
    return result


def _sort_decisions(decisions: list[DecisionRead]) -> list[DecisionRead]:
    return sorted(decisions, key=lambda d: d.student_name.lower())


@router.get(
    "/submissions/{submission_id}",
    response_model=SubmissionDetail,
    response_model_by_alias=True,
)
async def get_submission(
    submission_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SubmissionDetail:
    _ = user
    # Tenant-scoped fetch — treating cross-school ids as "not found"
    # so we don't leak whether the id exists in another tenant.
    submission = await PromotionsRepository.find_submission_by_id(session, school_id, submission_id)
    if not submission:
        raise NotFoundError(f"Submission {submission_id!r} not found.")
    return await _build_detail(session, school_id, submission)


@router.get(
    "/submissions/by-class/{class_id}",
    response_model=SubmissionDetail | None,
    response_model_by_alias=True,
)
async def get_submission_by_class(
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SubmissionDetail | None:
    _ = user
    school = await SchoolsService.get(session, school_id)
    submission = await PromotionsRepository.find_submission_by_class(
        session, school_id, class_id, school.academic_year
    )
    if not submission:
        return None
    return await _build_detail(session, school_id, submission)


@router.patch(
    "/submissions/{submission_id}/decisions",
    response_model=SubmissionRead,
    response_model_by_alias=True,
)
async def save_draft(
    submission_id: UUID,
    payload: SaveDraftRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SubmissionRead:
    if user.role not in {ADMIN, TEACHER}:
        raise ForbiddenError("Only Admin or the class teacher can save.")
    submission = await PromotionsService.save_draft(
        session,
        school_id,
        submission_id,
        updates=payload.updates,
        actor_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
    submission_staff = await PromotionsRepository.staff_by_ids(
        session, [submission.submitted_by_id, submission.reviewed_by_id]
    )
    return _to_submission_read(submission, submission_staff)


@router.post(
    "/submissions/{submission_id}/submit",
    response_model=SubmissionRead,
    response_model_by_alias=True,
)
async def submit_list(
    submission_id: UUID,
    payload: SubmitListRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SubmissionRead:
    if user.role not in {ADMIN, TEACHER}:
        raise ForbiddenError("Only Admin or the class teacher can submit.")
    if not user.linked_id:
        raise ForbiddenError("Actor identity missing.")
    submission = await PromotionsService.submit_list(
        session,
        school_id,
        submission_id,
        updates=payload.updates,
        actor_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
    submission_staff = await PromotionsRepository.staff_by_ids(
        session, [submission.submitted_by_id, submission.reviewed_by_id]
    )
    return _to_submission_read(submission, submission_staff)


@router.post(
    "/submissions/{submission_id}/approve",
    response_model=SubmissionRead,
    response_model_by_alias=True,
)
async def approve_submission(
    submission_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SubmissionRead:
    _require_admin_or_deputy(user)
    if not user.linked_id:
        raise ForbiddenError("Reviewer identity missing.")
    submission = await PromotionsService.approve(
        session,
        school_id,
        submission_id,
        reviewer_staff_id=user.linked_id,
        actor_user_id=user.user_id,
        actor_role=user.role or "",
    )
    submission_staff = await PromotionsRepository.staff_by_ids(
        session, [submission.submitted_by_id, submission.reviewed_by_id]
    )
    return _to_submission_read(submission, submission_staff)


@router.post(
    "/submissions/{submission_id}/send-back",
    response_model=SubmissionRead,
    response_model_by_alias=True,
)
async def send_back(
    submission_id: UUID,
    payload: SendBackRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SubmissionRead:
    _require_admin_or_deputy(user)
    if not user.linked_id:
        raise ForbiddenError("Reviewer identity missing.")
    submission = await PromotionsService.send_back(
        session,
        school_id,
        submission_id,
        comment=payload.comment,
        reviewer_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
    submission_staff = await PromotionsRepository.staff_by_ids(
        session, [submission.submitted_by_id, submission.reviewed_by_id]
    )
    return _to_submission_read(submission, submission_staff)


@router.post(
    "/submissions/bulk-approve",
    response_model=BulkApproveResponse,
    response_model_by_alias=True,
)
async def bulk_approve_submissions(
    payload: BulkApproveRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> BulkApproveResponse:
    """Approve several submitted lists in one call — e.g. a Deputy Head
    clearing their whole queue at once. Best-effort: one bad row (wrong
    division, missing target class) doesn't block the rest of the
    batch — see `PromotionsService.bulk_approve`."""
    _require_admin_or_deputy(user)
    if not user.linked_id:
        raise ForbiddenError("Reviewer identity missing.")
    results = await PromotionsService.bulk_approve(
        session,
        school_id,
        payload.submission_ids,
        reviewer_staff_id=user.linked_id,
        actor_user_id=user.user_id,
        actor_role=user.role or "",
    )
    return BulkApproveResponse(
        results=[
            BulkApproveResult(submission_id=sid, class_name=cls_name, success=success, error=error)
            for sid, cls_name, success, error in results
        ]
    )
