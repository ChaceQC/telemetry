from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user, get_query_service
from app.repositories.auth import UserRecord
from app.schemas.query import EventQueryResponse
from app.services.errors import ResourceNotFoundError
from app.services.query import QueryService

router = APIRouter(prefix="/api/v1/query", tags=["query"])


@router.get(
    "/events",
    response_model=list[EventQueryResponse],
    summary="查询事件",
)
def list_events(
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    event_type: Annotated[
        str | None,
        Query(alias="type", min_length=1, max_length=128),
    ] = None,
    source: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    limit: Annotated[int, Query(gt=0, le=500)] = 100,
) -> list[EventQueryResponse]:
    try:
        events = query_service.list_events(
            user=current_user,
            project_id=project_id,
            event_type=event_type,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    return [EventQueryResponse.model_validate(event) for event in events]
