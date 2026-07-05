"""Root-level pytest fixtures — apply to every test in the suite.

Unlike DB state (isolated per-test via a rolled-back transaction, see
each feature's `db_session` fixture), the rate limiter's in-memory
counters live on a module-level singleton (`app.core.rate_limit.limiter`)
that persists for the whole pytest process. Without a reset, two
unrelated test files hitting the same rate-limited endpoint with the
same test JWT `sub` could cumulatively trip a 429 that has nothing to
do with what either test is actually verifying — a purely
test-ordering-dependent flake. Rate limiting itself is meaningless
during tests (no real abuse to protect against), so full isolation is
the right tradeoff here, not a runtime feature-flag.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from app.core.rate_limit import limiter


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> Iterator[None]:
    limiter.reset()
    yield
