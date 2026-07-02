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

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdmin
from app.features.exams.model import Exam, Score
from app.features.exams.schema import (
    ExamCreate,
    ExamRead,
    ExamsListResponse,
    ExamUpdate,
    ScoreRead,
    ScoresGridResponse,
    ScoresUpsertRequest,
)
from app.features.exams.service import ExamsService, ScoresService
from app.features.students.model import Student
from app.features.subjects.model import Subject

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
