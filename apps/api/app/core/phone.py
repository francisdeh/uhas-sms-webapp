"""Ghana phone number normalization.

Guardians/staff type phone numbers in whatever form is habitual —
local (`0244000000`), international without the plus
(`233244000000`), or full E.164 (`+233244000000`). Everything that
ends up talking to Supabase Auth's `phone` field or an SMS provider
needs the same canonical form, so normalization happens once here
rather than being re-implemented per call site.
"""

from __future__ import annotations

import re

_LOCAL = re.compile(r"^0(\d{9})$")
_INTL_NO_PLUS = re.compile(r"^233(\d{9})$")
_INTL = re.compile(r"^\+233(\d{9})$")


def normalize_ghana_phone(raw: str) -> str:
    """`0244000000` / `233244000000` / `+233244000000` -> `+233244000000`.

    Raises `ValueError` (surfaces as a Pydantic validation error at the
    schema layer) for anything else — no attempt to guess intent for
    malformed input.
    """
    candidate = raw.strip().replace(" ", "").replace("-", "")
    for pattern in (_INTL, _INTL_NO_PLUS, _LOCAL):
        match = pattern.match(candidate)
        if match:
            return f"+233{match.group(1)}"
    raise ValueError(
        f"{raw!r} is not a recognisable Ghana phone number "
        "(expected 0XXXXXXXXX, 233XXXXXXXXX, or +233XXXXXXXXX)."
    )


def validate_phone_field(value: str | None) -> str | None:
    """`@field_validator("phone")`-friendly wrapper — every write-path
    schema with a `phone` field (`GuardianCreate`/`Update`,
    `StaffCreate`/`Update`) calls this as its validator body. Not
    applied to `*Read` schemas — normalizing on read would reject
    any phone stored before this normalization existed."""
    return normalize_ghana_phone(value) if value else value
