"""Closed set of `schemes.status` + `schemes.type` values.

Schemes have a simpler flow than lesson plans: no rejection loop, no
two-stage review. A Unit Head (or Deputy Head / Admin) just
acknowledges that they've seen it — schemes are typically an artefact
delivered up-front (before the term), not gated content.

    draft ──submit──► submitted ──acknowledge──► acknowledged
                          ▲
                          └─── (terminal — no rejection path)
"""

from __future__ import annotations

from typing import Final, Literal

DRAFT: Final = "draft"
SUBMITTED: Final = "submitted"
ACKNOWLEDGED: Final = "acknowledged"

SchemeStatus = Literal["draft", "submitted", "acknowledged"]

# `work` = Scheme of Work; `learning` = Scheme of Learning. The two live
# on the same table because they share every other column.
SchemeType = Literal["work", "learning"]
