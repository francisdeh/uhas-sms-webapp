"""HTTP routes for Exams + Scores.

  GET    /exams                           → paged list (filters: year, term, type, published)
  GET    /exams/{id}                      → fetch
  POST   /exams                           → create (Admin)
  PATCH  /exams/{id}                      → edit metadata — only while unpublished (Admin)
  POST   /exams/{id}/publish              → publish + audit (Admin)
  POST   /exams/{id}/unpublish            → unpublish + audit (Admin)

  GET    /exams/{id}/scores               → the grid for (classId, subjectId)
  PUT    /exams/{id}/scores               → batch upsert — computes totals/grades + ranks

Scores writes require any authenticated staff (Teacher is the primary
caller; Admin/Deputy can also save). Reads are open to any authenticated
role.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdmin
from app.core.rate_limit import REPORT_CARD_PDF_LIMIT, limiter
from app.features.classes.model import Class
from app.features.exams.class_reports_svc import ClassReportsService
from app.features.exams.model import ClassReportSubmission, Exam, Score, StudentReportRemark
from app.features.exams.report_card_pdf import ReportCardPdfService
from app.features.exams.report_card_svc import ReportCardService
from app.features.exams.schema import (
    ClassReportListItem,
    ClassReportListResponse,
    ClassReportRead,
    ClassReportUpsertRequest,
    ExamCreate,
    ExamRead,
    ExamsListResponse,
    ExamUpdate,
    HosCommentUpdate,
    ReportCardResponse,
    ScoreRead,
    ScoresGridResponse,
    ScoresUpsertRequest,
    StudentRemarkRead,
)
from app.features.exams.service import ExamsService, ScoresService
from app.features.students.model import Student
from app.features.subjects.model import Subject
from app.integrations.storage import StorageClient, get_storage_client

router = APIRouter(prefix="/exams", tags=["exams"])


def _to_exam_read(row: Exam) -> ExamRead:
    return ExamRead.model_validate(row).model_copy(update={"is_published": bool(row.is_published)})


def _to_score_read(student: Student, subject: Subject, score: Score | None) -> ScoreRead:
    """Build a ScoreRead — handles the "student in roster but no score yet"
    case by returning zeroed identity + null components."""
    if score is None:
        # Synthesise a pseudo-row so the grid always has one row per
        # student. UUID(0) is a sentinel; the frontend keys off
        # `studentId`, not `id`, so it doesn't matter here.
        return ScoreRead(
            id=UUID(int=0),
            exam_id=UUID(int=0),
            student_id=student.id,
            student_first_name=student.first_name,
            student_last_name=student.last_name,
            student_slug=student.slug,
            subject_id=subject.id,
            subject_slug=subject.slug,
            subject_name=subject.name,
        )
    return ScoreRead(
        id=score.id,
        exam_id=score.exam_id,
        student_id=student.id,
        student_first_name=student.first_name,
        student_last_name=student.last_name,
        student_slug=student.slug,
        subject_id=subject.id,
        subject_slug=subject.slug,
        subject_name=subject.name,
        cat1=score.cat1,
        cat2=score.cat2,
        project_work=score.project_work,
        group_work=score.group_work,
        exam_score=score.exam_score,
        total_score=score.total_score,
        grade=score.grade,
        interpretation=score.interpretation,
        subject_position=score.subject_position,
    )


# ─── /exams ──────────────────────────────────────────────────────────────────


@router.get("", response_model=ExamsListResponse, response_model_by_alias=True)
async def list_exams(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query()] = None,
    academic_year: Annotated[str | None, Query(alias="academicYear")] = None,
    term: Annotated[int | None, Query(ge=1, le=3)] = None,
    exam_type: Annotated[str | None, Query(alias="type")] = None,
    published: Annotated[bool | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ExamsListResponse:
    rows, total = await ExamsService.list_for_school(
        session,
        school_id,
        q=q,
        academic_year=academic_year,
        term=term,
        exam_type=exam_type,
        published=published,
        page=page,
        size=size,
    )
    return ExamsListResponse(
        items=[_to_exam_read(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{exam_id}", response_model=ExamRead, response_model_by_alias=True)
async def get_exam(
    exam_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExamRead:
    row = await ExamsService.get(session, school_id, exam_id)
    return _to_exam_read(row)


@router.post(
    "",
    response_model=ExamRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_exam(
    payload: ExamCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ExamRead:
    row = await ExamsService.create(session, school_id, payload)
    return _to_exam_read(row)


@router.patch("/{exam_id}", response_model=ExamRead, response_model_by_alias=True)
async def update_exam(
    exam_id: UUID,
    payload: ExamUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ExamRead:
    row = await ExamsService.update(session, school_id, exam_id, payload)
    return _to_exam_read(row)


@router.post("/{exam_id}/publish", response_model=ExamRead, response_model_by_alias=True)
async def publish_exam(
    exam_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ExamRead:
    row = await ExamsService.set_published(
        session, school_id, exam_id, publish=True, actor_user_id=user.user_id
    )
    return _to_exam_read(row)


@router.post("/{exam_id}/unpublish", response_model=ExamRead, response_model_by_alias=True)
async def unpublish_exam(
    exam_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ExamRead:
    row = await ExamsService.set_published(
        session, school_id, exam_id, publish=False, actor_user_id=user.user_id
    )
    return _to_exam_read(row)


# ─── /exams/{id}/scores ──────────────────────────────────────────────────────


@router.get(
    "/{exam_id}/scores",
    response_model=ScoresGridResponse,
    response_model_by_alias=True,
)
async def get_scores_grid(
    exam_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    class_id: Annotated[UUID, Query(alias="classId")],
    subject_id: Annotated[UUID, Query(alias="subjectId")],
) -> ScoresGridResponse:
    rows = await ScoresService.get_grid(
        session, school_id, exam_id=exam_id, class_id=class_id, subject_id=subject_id
    )
    return ScoresGridResponse(
        exam_id=exam_id,
        class_id=class_id,
        subject_id=subject_id,
        items=[_to_score_read(student, subject, score) for (student, subject, score) in rows],
    )


@router.put(
    "/{exam_id}/scores",
    response_model=ScoresGridResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Batch-save scores for a (classId, subjectId)",
)
async def upsert_scores(
    exam_id: UUID,
    payload: ScoresUpsertRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ScoresGridResponse:
    await ScoresService.upsert_batch(
        session, school_id, exam_id, payload, actor_user_id=user.user_id
    )
    # Re-read the grid so the response reflects the freshly-recomputed
    # positions across ALL students, not just the payload rows.
    rows = await ScoresService.get_grid(
        session,
        school_id,
        exam_id=exam_id,
        class_id=payload.class_id,
        subject_id=payload.subject_id,
    )
    return ScoresGridResponse(
        exam_id=exam_id,
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        items=[_to_score_read(student, subject, score) for (student, subject, score) in rows],
    )


# ─── /exams/{id}/class-reports ───────────────────────────────────────────────


def _to_class_report_list_item(
    report: ClassReportSubmission | None, cls: Class, exam_id: UUID
) -> ClassReportListItem:
    """Synthesise a `draft` row when no report exists yet — the frontend
    always renders one row per class in the response."""
    if report is None:
        return ClassReportListItem(
            id=UUID(int=0),
            exam_id=exam_id,
            class_id=cls.id,
            class_name=cls.name,
            division=cls.division,
            status="draft",
        )
    return ClassReportListItem(
        id=report.id,
        exam_id=report.exam_id,
        class_id=report.class_id,
        class_name=cls.name,
        division=cls.division,
        status=("submitted" if report.status == "submitted" else "draft"),
        submitted_by_id=report.submitted_by_id,
        submitted_at=report.submitted_at,
        hos_comment=report.head_of_school_comment,
        updated_at=report.updated_at,
    )


def _to_remark_read(student: Student, remark: StudentReportRemark | None) -> StudentRemarkRead:
    return StudentRemarkRead(
        student_id=student.id,
        student_first_name=student.first_name,
        student_last_name=student.last_name,
        text=(remark.class_teacher_remark if remark else None),
        updated_at=(remark.updated_at if remark else None),
    )


def _to_class_report_read(
    report: ClassReportSubmission | None,
    cls: Class,
    exam_id: UUID,
    roster: list[tuple[Student, StudentReportRemark | None]],
) -> ClassReportRead:
    remarks = [_to_remark_read(s, r) for s, r in roster]
    if report is None:
        return ClassReportRead(
            exam_id=exam_id,
            class_id=cls.id,
            class_name=cls.name,
            division=cls.division,
            status="draft",
            remarks=remarks,
        )
    return ClassReportRead(
        id=report.id,
        exam_id=report.exam_id,
        class_id=report.class_id,
        class_name=cls.name,
        division=cls.division,
        status=("submitted" if report.status == "submitted" else "draft"),
        submitted_by_id=report.submitted_by_id,
        submitted_at=report.submitted_at,
        hos_comment=report.head_of_school_comment,
        remarks=remarks,
        updated_at=report.updated_at,
    )


@router.get(
    "/{exam_id}/class-reports",
    response_model=ClassReportListResponse,
    response_model_by_alias=True,
)
async def list_class_reports(
    exam_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ClassReportListResponse:
    rows = await ClassReportsService.list_for_exam(
        session,
        school_id=school_id,
        exam_id=exam_id,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
    )
    return ClassReportListResponse(
        items=[_to_class_report_list_item(r, c, exam_id) for r, c in rows]
    )


@router.get(
    "/{exam_id}/class-reports/{class_id}",
    response_model=ClassReportRead,
    response_model_by_alias=True,
)
async def get_class_report(
    exam_id: UUID,
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ClassReportRead:
    report, cls, roster = await ClassReportsService.get_detail(
        session,
        school_id=school_id,
        exam_id=exam_id,
        class_id=class_id,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
    )
    return _to_class_report_read(report, cls, exam_id, roster)


@router.put(
    "/{exam_id}/class-reports/{class_id}/draft",
    response_model=ClassReportRead,
    response_model_by_alias=True,
)
async def save_class_report_draft(
    exam_id: UUID,
    class_id: UUID,
    payload: ClassReportUpsertRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ClassReportRead:
    await ClassReportsService.save_draft(
        session,
        school_id=school_id,
        exam_id=exam_id,
        class_id=class_id,
        hos_comment=payload.hos_comment,
        remarks=payload.remarks,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
    )
    report, cls, roster = await ClassReportsService.get_detail(
        session,
        school_id=school_id,
        exam_id=exam_id,
        class_id=class_id,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
    )
    return _to_class_report_read(report, cls, exam_id, roster)


@router.post(
    "/{exam_id}/class-reports/{class_id}/submit",
    response_model=ClassReportRead,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
)
async def submit_class_report(
    exam_id: UUID,
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ClassReportRead:
    await ClassReportsService.submit(
        session,
        school_id=school_id,
        exam_id=exam_id,
        class_id=class_id,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
    )
    report, cls, roster = await ClassReportsService.get_detail(
        session,
        school_id=school_id,
        exam_id=exam_id,
        class_id=class_id,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
    )
    return _to_class_report_read(report, cls, exam_id, roster)


@router.patch(
    "/{exam_id}/class-reports/{class_id}/hos-comment",
    response_model=ClassReportRead,
    response_model_by_alias=True,
)
async def update_class_report_hos_comment(
    exam_id: UUID,
    class_id: UUID,
    payload: HosCommentUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ClassReportRead:
    await ClassReportsService.update_hos_comment(
        session,
        school_id=school_id,
        exam_id=exam_id,
        class_id=class_id,
        hos_comment=payload.hos_comment,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
        actor_user_id=user.user_id,
    )
    report, cls, roster = await ClassReportsService.get_detail(
        session,
        school_id=school_id,
        exam_id=exam_id,
        class_id=class_id,
        actor_role=user.role or "",
        actor_staff_id=user.linked_id,
    )
    return _to_class_report_read(report, cls, exam_id, roster)


# ─── Nested under /students/{student_id} ──────────────────────────────────────
# Second router — mounted separately in main.py so this router keeps
# its own /exams prefix.

students_router = APIRouter(prefix="/students", tags=["exams"])


@students_router.get(
    "/{student_id}/report-card",
    response_model=ReportCardResponse,
    response_model_by_alias=True,
    summary="Assembled report card for one student, one exam",
)
async def get_student_report_card(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    exam_id: Annotated[UUID, Query(alias="examId")],
) -> ReportCardResponse:
    return await ReportCardService.get(
        session, school_id, user, student_id=student_id, exam_id=exam_id
    )


@students_router.get(
    "/{student_id}/report-card/pdf",
    summary="Real PDF of one student's report card, one exam",
)
@limiter.limit(REPORT_CARD_PDF_LIMIT)
async def get_student_report_card_pdf(
    request: Request,  # required by @limiter.limit, not used directly
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    storage: Annotated[StorageClient, Depends(get_storage_client)],
    exam_id: Annotated[UUID, Query(alias="examId")],
) -> RedirectResponse:
    url = await ReportCardPdfService.get_or_render(
        session, school_id, user, student_id=student_id, exam_id=exam_id, storage=storage
    )
    return RedirectResponse(url)
