"""Closed sets for student profile depth (Phase 6 item 1): blood type
and document labels."""

from __future__ import annotations

from typing import Final, Literal

A_POS: Final = "A+"
A_NEG: Final = "A-"
B_POS: Final = "B+"
B_NEG: Final = "B-"
AB_POS: Final = "AB+"
AB_NEG: Final = "AB-"
O_POS: Final = "O+"
O_NEG: Final = "O-"
UNKNOWN_BLOOD_TYPE: Final = "Unknown"

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"]

BIRTH_CERTIFICATE: Final = "Birth Certificate"
GHANA_CARD: Final = "Ghana Card"
IMMUNIZATION_RECORD: Final = "Immunization Record"
TRANSFER_LETTER: Final = "Transfer Letter"
PASSPORT_PHOTO: Final = "Passport Photo"
OTHER_DOCUMENT: Final = "Other"

DocumentLabel = Literal[
    "Birth Certificate",
    "Ghana Card",
    "Immunization Record",
    "Transfer Letter",
    "Passport Photo",
    "Other",
]
