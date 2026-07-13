"""Pydantic schemas for the public auth-adjacent endpoints."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr


class PasswordResetRequest(BaseModel):
    email: EmailStr
