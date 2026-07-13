"""FastAPI application entrypoint.

Wires the app, CORS, the global error envelope, and every feature
router. New features register their router here — that's the only
place this file needs to grow.

Run locally:
    uv run uvicorn app.main:app --reload --port 8000
"""

from typing import Any

import inngest.fast_api
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.db import engine
from app.core.errors import AppError
from app.core.inngest import inngest_client
from app.core.observability import init_observability, instrument_app
from app.core.rate_limit import limiter
from app.features.announcements.router import router as announcements_router
from app.features.appointments.jobs import APPOINTMENTS_JOBS
from app.features.appointments.router import router as appointments_router
from app.features.assignments.router import router as assignments_router
from app.features.attendance.jobs import ATTENDANCE_JOBS
from app.features.attendance.router import (
    router as attendance_router,
)
from app.features.attendance.router import (
    students_router as student_attendance_router,
)
from app.features.audit.router import router as audit_log_router
from app.features.auth.router import router as auth_router
from app.features.calendar.router import router as calendar_router
from app.features.classes.router import (
    class_subjects_router,
)
from app.features.classes.router import (
    router as classes_router,
)
from app.features.enrollments.router import (
    classes_router as class_enrollments_router,
)
from app.features.enrollments.router import (
    router as enrollments_router,
)
from app.features.enrollments.router import (
    students_router as student_enrollments_router,
)
from app.features.exams.jobs import EXAMS_JOBS
from app.features.exams.router import (
    router as exams_router,
)
from app.features.exams.router import (
    students_router as student_exams_router,
)
from app.features.fees.jobs import FEES_JOBS
from app.features.fees.router import router as fees_router
from app.features.guardians.router import router as guardians_router
from app.features.health.jobs import HEALTH_JOBS
from app.features.health.router import router as health_router
from app.features.leave_requests.jobs import LEAVE_REQUESTS_JOBS
from app.features.leave_requests.router import router as leave_requests_router
from app.features.lesson_plans.jobs import LESSON_PLANS_JOBS
from app.features.lesson_plans.router import router as lesson_plans_router
from app.features.me.router import router as me_router
from app.features.notifications.router import router as notifications_router
from app.features.promotions.router import router as promotions_router
from app.features.reports.router import router as reports_router
from app.features.schemes.router import router as schemes_router
from app.features.school_terms.router import router as school_terms_router
from app.features.schools.router import router as schools_router
from app.features.search.router import router as search_router
from app.features.shell.router import router as shell_router
from app.features.sms.jobs import SMS_JOBS
from app.features.sms.router import router as sms_router
from app.features.staff.router import router as staff_router
from app.features.staff_attendance.router import router as staff_attendance_router
from app.features.students.router import router as students_router
from app.features.subjects.router import router as subjects_router
from app.features.users.jobs import USERS_JOBS
from app.features.users.router import router as users_router

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

    # ── Rate limiting — global default + per-route overrides (see
    # app/core/rate_limit.py for the threat model + keying rationale) ────
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

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

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        """Same error envelope as app_error_handler above — slowapi's
        exception isn't an AppError subclass, so it needs its own
        handler, but the shape the frontend sees is identical."""
        payload: dict[str, Any] = {
            "error": {
                "code": "rate_limited",
                "message": f"Rate limit exceeded: {exc.detail}",
            }
        }
        return JSONResponse(status_code=429, content=payload)

    # ── Routers ───────────────────────────────────────────────────────────
    # Each feature's router lands here. Keep the list flat + alphabetised
    # so it's easy to see what surfaces exist.
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(schools_router)
    app.include_router(school_terms_router)
    app.include_router(shell_router)
    app.include_router(staff_router)
    app.include_router(guardians_router)
    app.include_router(students_router)
    app.include_router(subjects_router)
    app.include_router(classes_router)
    app.include_router(class_subjects_router)
    app.include_router(enrollments_router)
    app.include_router(attendance_router)
    app.include_router(student_attendance_router)
    app.include_router(staff_attendance_router)
    app.include_router(leave_requests_router)
    app.include_router(student_enrollments_router)
    app.include_router(class_enrollments_router)
    app.include_router(exams_router)
    app.include_router(student_exams_router)
    app.include_router(lesson_plans_router)
    app.include_router(me_router)
    app.include_router(schemes_router)
    app.include_router(assignments_router)
    app.include_router(promotions_router)
    app.include_router(announcements_router)
    app.include_router(notifications_router)
    app.include_router(calendar_router)
    app.include_router(appointments_router)
    app.include_router(audit_log_router)
    app.include_router(reports_router)
    app.include_router(search_router)
    app.include_router(users_router)
    app.include_router(sms_router)
    app.include_router(fees_router)

    # ── Background jobs (Inngest) ────────────────────────────────────────
    # Each feature's `jobs/__init__.py` exports its own list; collect them
    # flat here and hand the lot to `serve(...)`, which mounts the
    # `/api/inngest` webhook route Inngest calls to drive step execution.
    # New feature domains: add `<domain>_JOBS` here when they grow a
    # `jobs/` folder.
    inngest.fast_api.serve(
        app,
        inngest_client,
        [
            *HEALTH_JOBS,
            *SMS_JOBS,
            *LESSON_PLANS_JOBS,
            *EXAMS_JOBS,
            *FEES_JOBS,
            *APPOINTMENTS_JOBS,
            *LEAVE_REQUESTS_JOBS,
            *ATTENDANCE_JOBS,
            *USERS_JOBS,
        ],
    )

    # Logfire instrumentation attaches after routers register so it sees
    # every endpoint. No-op when LOGFIRE_TOKEN is unset.
    instrument_app(app, engine)

    return app


app = create_app()
