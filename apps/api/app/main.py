"""FastAPI application entrypoint.

Wires the app, CORS, the global error envelope, and every feature
router. New features register their router here — that's the only
place this file needs to grow.

Run locally:
    uv run uvicorn app.main:app --reload --port 8000
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.db import engine
from app.core.errors import AppError
from app.core.observability import init_observability, instrument_app
from app.features.announcements.router import router as announcements_router
from app.features.appointments.router import router as appointments_router
from app.features.assignments.router import router as assignments_router
from app.features.attendance.router import router as attendance_router
from app.features.audit.router import router as audit_log_router
from app.features.calendar.router import router as calendar_router
from app.features.classes.router import router as classes_router
from app.features.enrollments.router import (
    classes_router as class_enrollments_router,
)
from app.features.enrollments.router import (
    router as enrollments_router,
)
from app.features.enrollments.router import (
    students_router as student_enrollments_router,
)
from app.features.exams.router import router as exams_router
from app.features.guardians.router import router as guardians_router
from app.features.health.router import router as health_router
from app.features.leave_requests.router import router as leave_requests_router
from app.features.lesson_plans.router import router as lesson_plans_router
from app.features.notifications.router import router as notifications_router
from app.features.promotions.router import router as promotions_router
from app.features.schemes.router import router as schemes_router
from app.features.school_terms.router import router as school_terms_router
from app.features.schools.router import router as schools_router
from app.features.staff.router import router as staff_router
from app.features.staff_attendance.router import router as staff_attendance_router
from app.features.students.router import router as students_router
from app.features.subjects.router import router as subjects_router

# Initialise observability before constructing the FastAPI app so that
# Sentry's middleware integrations attach to the instance we create
# below. Both Sentry and Logfire are no-ops when their credentials are
# unset, so this line is safe in any environment.
init_observability()


def create_app() -> FastAPI:
    """Build the FastAPI instance.

    Factored as a function so tests can construct fresh instances
    without import-time side effects.
    """
    app = FastAPI(
        title=settings.app_name,
        description="Backend API for the UHAS Basic School SMS.",
        version="0.1.0",
        # OpenAPI lives at /openapi.json; frontend codegen reads it.
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url=None,
    )

    # ── CORS — only the Next.js origin in dev/prod ────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global error envelope ────────────────────────────────────────────
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        """Convert domain exceptions to the consistent error shape."""
        payload: dict[str, Any] = {
            "error": {
                "code": exc.code,
                "message": exc.message,
            }
        }
        if exc.details:
            payload["error"]["details"] = exc.details
        return JSONResponse(status_code=exc.status_code, content=payload)

    # ── Routers ───────────────────────────────────────────────────────────
    # Each feature's router lands here. Keep the list flat + alphabetised
    # so it's easy to see what surfaces exist.
    app.include_router(health_router)
    app.include_router(schools_router)
    app.include_router(school_terms_router)
    app.include_router(staff_router)
    app.include_router(guardians_router)
    app.include_router(students_router)
    app.include_router(subjects_router)
    app.include_router(classes_router)
    app.include_router(enrollments_router)
    app.include_router(attendance_router)
    app.include_router(staff_attendance_router)
    app.include_router(leave_requests_router)
    app.include_router(student_enrollments_router)
    app.include_router(class_enrollments_router)
    app.include_router(exams_router)
    app.include_router(lesson_plans_router)
    app.include_router(schemes_router)
    app.include_router(assignments_router)
    app.include_router(promotions_router)
    app.include_router(announcements_router)
    app.include_router(notifications_router)
    app.include_router(calendar_router)
    app.include_router(appointments_router)
    app.include_router(audit_log_router)

    # Logfire instrumentation attaches after routers register so it sees
    # every endpoint. No-op when LOGFIRE_TOKEN is unset.
    instrument_app(app, engine)

    return app


app = create_app()
