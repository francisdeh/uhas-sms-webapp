"""Standard paginated-list envelope.

Every list endpoint returns the same shape:

  {
    "items": [ ... ],
    "total": <int>,   // total matching rows across the whole filtered set
    "page":  <int>,   // 1-based page index
    "size":  <int>,   // page size (rows per page)
  }

`Paginated[T]` is the canonical generic — domain modules subclass it to
keep a stable OpenAPI schema name (FastAPI would otherwise emit
`Paginated_StaffRead_`, which would churn the frontend TS types when
the generic specialisation changes):

    class StaffListResponse(Paginated[StaffRead]):
        pass

Subclassing also keeps the per-domain doc string discoverable when
generating OpenAPI / Stoplight docs.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Paginated[T](BaseModel):
    """Generic paged-list envelope. Use via `class XListResponse(Paginated[XRead]): pass`."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )

    items: list[T]
    total: int
    page: int
    size: int
