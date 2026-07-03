"""Pydantic schema for the /shell/nav-badges endpoint.

`NavBadges` is the wire shape the Next-side sidebar consumes to
render red pips next to each menu entry. Every field defaults to
zero so a client on an older build doesn't break when the model
grows a new badge — the additional key is silently 0.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class NavBadges(BaseModel):
    """Counts the sidebar renders next to menu entries.

    Only Unit Heads (Teacher + is_unit_head) and Deputy Heads receive
    a non-zero `lesson_plans_pending_review`. All other roles get a
    zero-filled object so the client shape stays uniform.
    """

    model_config = _CAMEL_CONFIG

    lesson_plans_pending_review: int = 0
