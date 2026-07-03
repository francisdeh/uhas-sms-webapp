"""HTTP route for global search.

    GET /search?q=<query>   →  SearchResults   (any authenticated user)

Powers the Next-side Cmd-K palette; role scope is enforced entirely
by `SearchService` so this file stays thin.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentUserDep
from app.features.search.schema import SearchResults
from app.features.search.service import SearchService

router = APIRouter(prefix="/search", tags=["search"])


@router.get(
    "",
    response_model=SearchResults,
    response_model_by_alias=True,
    summary="Global cross-domain search for the Cmd-K palette",
)
async def global_search(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str, Query(max_length=200)] = "",
) -> SearchResults:
    return await SearchService.search(session, user, q)
