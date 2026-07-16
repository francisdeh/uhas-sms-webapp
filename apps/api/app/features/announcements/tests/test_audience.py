"""Unit tests for the announcement audience string parser — pure
functions, no DB. Covers the `:staff` suffix added alongside the
email/SMS notification PR; router tests cover the same distinction at
the integration level (create-time gates, list-time visibility)."""

from __future__ import annotations

from app.features.announcements.audience import (
    AllAudience,
    ClassAudience,
    DivisionAudience,
    format_all,
    format_class,
    format_division,
    parse_audience,
)


def test_parses_all() -> None:
    assert parse_audience("all") == AllAudience()


def test_parses_all_staff() -> None:
    assert parse_audience("all:staff") == AllAudience(staff_only=True)


def test_parses_division() -> None:
    assert parse_audience("division:JHS") == DivisionAudience(division="JHS")


def test_parses_division_staff() -> None:
    assert parse_audience("division:JHS:staff") == DivisionAudience(division="JHS", staff_only=True)


def test_parses_class() -> None:
    assert parse_audience("class:abc-123") == ClassAudience(class_id="abc-123")


def test_unknown_value_falls_back_to_all() -> None:
    """Corrupt/legacy rows show up in the school-wide feed rather than
    500'ing — matches the TS-side fallback behaviour."""
    assert parse_audience("garbage") == AllAudience()


def test_format_all_round_trips() -> None:
    assert format_all() == "all"
    assert parse_audience(format_all()) == AllAudience()
    assert format_all(staff_only=True) == "all:staff"
    assert parse_audience(format_all(staff_only=True)) == AllAudience(staff_only=True)


def test_format_division_round_trips() -> None:
    assert format_division("KG") == "division:KG"
    assert parse_audience(format_division("KG")) == DivisionAudience(division="KG")
    assert format_division("KG", staff_only=True) == "division:KG:staff"
    assert parse_audience(format_division("KG", staff_only=True)) == DivisionAudience(
        division="KG", staff_only=True
    )


def test_format_class_round_trips() -> None:
    formatted = format_class("00000000-0000-0000-0000-000000000001")
    assert formatted == "class:00000000-0000-0000-0000-000000000001"
    assert parse_audience(formatted) == ClassAudience(
        class_id="00000000-0000-0000-0000-000000000001"
    )
