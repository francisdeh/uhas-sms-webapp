"""Closed set for staff profile depth (Phase 6 item 4): document
labels. Mirrors `students.constants.DocumentLabel`."""

from __future__ import annotations

from typing import Final, Literal

CERTIFICATE: Final = "Certificate"
CONTRACT: Final = "Contract"
NATIONAL_ID: Final = "National ID"
CV: Final = "CV"
OTHER_DOCUMENT: Final = "Other"

DocumentLabel = Literal["Certificate", "Contract", "National ID", "CV", "Other"]
