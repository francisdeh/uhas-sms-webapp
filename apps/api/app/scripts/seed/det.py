"""Deterministic UUID generator — Python port of `apps/web/src/lib/uuid.ts`.

Only rows referenced by a fixed claim baked into the Supabase Auth test
accounts (`apps/web/scripts/_seed-data/users.ts`) need a deterministic
ID: the school, and the staff/guardian row each account's `linked_id`
points at. Every other seeded row gets a random `uuid4()` — nothing
external references those by a pinned value.

Must stay byte-for-byte identical to the TypeScript version or the
JWT's `app_metadata.linked_id`/`school_id` claims won't resolve to a
real row.
"""

from __future__ import annotations

import hashlib
from uuid import UUID

_NAMESPACE = "uhas-sms-seed-v1"


def det(key: str) -> UUID:
    digest = hashlib.sha256(f"{_NAMESPACE}:{key}".encode()).hexdigest()
    return UUID(
        "-".join(
            [
                digest[0:8],
                digest[8:12],
                f"5{digest[13:16]}",
                f"8{digest[17:20]}",
                digest[20:32],
            ]
        )
    )
