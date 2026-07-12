"""Unit tests for Ghana phone normalization."""

from __future__ import annotations

import pytest

from app.core.phone import normalize_ghana_phone, validate_phone_field


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0244000111", "+233244000111"),
        ("233244000111", "+233244000111"),
        ("+233244000111", "+233244000111"),
        (" 0244 000 111 ", "+233244000111"),
        ("024-400-0111", "+233244000111"),
    ],
)
def test_normalize_accepts_common_ghana_formats(raw: str, expected: str) -> None:
    assert normalize_ghana_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "12345",
        "+12442000111",  # wrong country code
        "0244000",  # too short
        "02440001112",  # too long
        "not-a-phone",
        "",
    ],
)
def test_normalize_rejects_malformed_input(raw: str) -> None:
    with pytest.raises(ValueError):
        normalize_ghana_phone(raw)


def test_validate_phone_field_passes_through_none() -> None:
    assert validate_phone_field(None) is None


def test_validate_phone_field_normalizes() -> None:
    assert validate_phone_field("0244000111") == "+233244000111"
