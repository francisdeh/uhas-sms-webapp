"""Academic-year arithmetic — mirrors `apps/web/.../promotions/lib/academic-year.ts`."""

from __future__ import annotations


def next_academic_year(current: str) -> str:
    """`"2025/2026"` → `"2026/2027"`. Both halves are incremented.

    Raises `ValueError` if the input isn't in `YYYY/YYYY` form. The
    upstream services always pass a `schools.academic_year` value which
    the DB constrains to that pattern, so this is defensive.
    """
    try:
        start_s, end_s = current.split("/")
        start, end = int(start_s), int(end_s)
    except ValueError as exc:
        raise ValueError(f"Invalid academic year: {current!r}") from exc
    return f"{start + 1}/{end + 1}"
