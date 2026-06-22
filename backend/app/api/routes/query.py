from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.api.dependencies import get_current_user, get_query_service
from app.repositories.auth import UserRecord
from app.schemas.query import (
    EventQueryPageResponse,
    EventQueryResponse,
    LogContextQueryResponse,
    LogQueryPageResponse,
    LogQueryResponse,
    MetricQueryPageResponse,
    MetricQueryResponse,
)
from app.services.errors import ResourceNotFoundError
from app.services.query import QueryCursorError, QueryFilterError, QueryService

router = APIRouter(prefix="/api/v1/query", tags=["query"])


@router.get(
    "/events",
    response_model=EventQueryPageResponse,
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
    cursor: Annotated[str | None, Query(min_length=1, max_length=1024)] = None,
) -> EventQueryPageResponse:
    try:
        page = query_service.list_events(
            user=current_user,
            project_id=project_id,
            event_type=event_type,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit,
            cursor=cursor,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except QueryCursorError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return EventQueryPageResponse(
        items=[EventQueryResponse.model_validate(event) for event in page.items],
        next_cursor=page.next_cursor,
    )


@router.get(
    "/logs",
    response_model=LogQueryPageResponse,
    summary="查询日志",
)
def list_logs(
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    level: Annotated[str | None, Query(min_length=1, max_length=32)] = None,
    source: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    keyword: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    trace_id: Annotated[str | None, Query()] = None,
    span_id: Annotated[str | None, Query()] = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    limit: Annotated[int, Query(gt=0, le=500)] = 100,
    cursor: Annotated[str | None, Query(min_length=1, max_length=1024)] = None,
) -> LogQueryPageResponse:
    try:
        page = query_service.list_logs(
            user=current_user,
            project_id=project_id,
            level=level,
            source=source,
            keyword=keyword,
            trace_id=trace_id,
            span_id=span_id,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit,
            cursor=cursor,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except QueryCursorError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    except QueryFilterError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return LogQueryPageResponse(
        items=[LogQueryResponse.model_validate(log) for log in page.items],
        next_cursor=page.next_cursor,
    )


@router.get(
    "/logs/{log_id}/context",
    response_model=LogContextQueryResponse,
    summary="查询日志上下文",
)
def get_log_context(
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    log_id: Annotated[int, Path(gt=0)],
    before: Annotated[int, Query(ge=0, le=20)] = 5,
    after: Annotated[int, Query(ge=0, le=20)] = 5,
) -> LogContextQueryResponse:
    try:
        context = query_service.get_log_context(
            user=current_user,
            log_id=log_id,
            before=before,
            after=after,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    return LogContextQueryResponse(
        target=LogQueryResponse.model_validate(context.target),
        before=[LogQueryResponse.model_validate(log) for log in context.before],
        after=[LogQueryResponse.model_validate(log) for log in context.after],
    )


@router.get(
    "/metrics",
    response_model=MetricQueryPageResponse,
    summary="查询指标",
)
def list_metrics(
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    name: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    source: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    limit: Annotated[int, Query(gt=0, le=500)] = 100,
    cursor: Annotated[str | None, Query(min_length=1, max_length=1024)] = None,
) -> MetricQueryPageResponse:
    try:
        page = query_service.list_metrics(
            user=current_user,
            project_id=project_id,
            name=name,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit,
            cursor=cursor,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except QueryCursorError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return MetricQueryPageResponse(
        items=[MetricQueryResponse.model_validate(metric) for metric in page.items],
        next_cursor=page.next_cursor,
    )
