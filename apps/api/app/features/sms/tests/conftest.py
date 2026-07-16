"""Fixtures for the SMS test suite. Distinct UUID range (`40404040-…`)."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.main import app

SCHOOL_UUID = UUID("40404040-4040-4409-8409-404040400001")
OTHER_SCHOOL_UUID = UUID("40404040-4040-4409-8409-404040400002")
GUARDIAN_UUID = UUID("40404040-4040-4409-8409-404040400301")
USER_UUID = UUID("40404040-4040-4409-8409-404040400401")


@pytest.fixture(autouse=True)
def _stub_sms_provider_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force `get_sms_provider()` to fall through to `StubSmsProvider`
    for every test in this package unless a test explicitly opts into a
    real provider (e.g. `test_provider.py`'s factory tests, which
    monkeypatch their own values afterward and so override this).
    Without this, a developer's local `.env` with real Hubtel/Arkesel
    credentials (e.g. for manual provider testing) would make every
    SMS-service/router/job test in this package a real, paid network
    call — same class of gap the email side already guards against in
    `integrations/email/tests/test_provider.py`."""
    monkeypatch.setattr(settings, "hubtel_client_id", None)
    monkeypatch.setattr(settings, "hubtel_client_secret", None)
    monkeypatch.setattr(settings, "hubtel_sender_id", None)
    monkeypatch.setattr(settings, "arkesel_api_key", None)
    monkeypatch.setattr(settings, "arkesel_sender_id", None)


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def seed_school(db_session: AsyncSession) -> School:
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-sms",
        name="Test School (sms suite)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_guardian(db_session: AsyncSession, seed_school: School) -> Guardian:
    guardian = Guardian(
        id=GUARDIAN_UUID,
        slug="GRD-SMS",
        school_id=SCHOOL_UUID,
        first_name="Efua",
        last_name="Guardian",
        phone="+233241110001",
    )
    db_session.add(guardian)
    await db_session.flush()
    return guardian


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


def auth_header(
    *,
    role: str = "Admin",
    school_id: UUID | str | None = SCHOOL_UUID,
    user_id: UUID | str = USER_UUID,
) -> dict[str, str]:
    now = int(time.time())
    app_metadata: dict[str, Any] = {"role": role}
    if school_id is not None:
        app_metadata["school_id"] = str(school_id)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + 3600,
            "email": "test@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
