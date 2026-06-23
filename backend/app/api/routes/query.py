from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.api.dependencies import get_current_user, get_query_service
from app.repositories.auth import UserRecord
from app.schemas.query import (
    EventQueryPageResponse,
    EventQueryResponse,
    LogContextQueryResponse,
    LogQueryPageResponse,
    LogQueryResponse,
    MetricAggregatePageResponse,
    MetricAggregateResponse,
    MetricQueryPageResponse,
    MetricQueryResponse,
    TraceQueryPageResponse,
    TraceQueryResponse,
    TraceTopologyResponse,
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
    request_id: Annotated[str | None, Query()] = None,
    user_id: Annotated[str | None, Query()] = None,
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
            request_id=request_id,
            user_id=user_id,
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
    "/traces/topology",
    response_model=TraceTopologyResponse,
    summary="查询 Trace 服务拓扑",
)
def get_trace_topology(
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Query(gt=0)],
    source: Annotated[str | None, Query()] = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    limit: Annotated[int, Query(gt=0, le=500)] = 100,
) -> TraceTopologyResponse:
    try:
        topology = query_service.get_trace_topology(
            user=current_user,
            project_id=project_id,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except QueryFilterError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return TraceTopologyResponse.model_validate(topology)


@router.get(
    "/traces",
    response_model=TraceQueryPageResponse,
    summary="查询 Trace spans",
)
def list_traces(
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    trace_id: Annotated[str | None, Query()] = None,
    span_id: Annotated[str | None, Query()] = None,
    name: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    source: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    status_code: Annotated[str | None, Query()] = None,
    duration_min_ms: Annotated[float | None, Query(ge=0)] = None,
    duration_max_ms: Annotated[float | None, Query(ge=0)] = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    limit: Annotated[int, Query(gt=0, le=500)] = 100,
    cursor: Annotated[str | None, Query(min_length=1, max_length=1024)] = None,
) -> TraceQueryPageResponse:
    try:
        page = query_service.list_traces(
            user=current_user,
            project_id=project_id,
            trace_id=trace_id,
            span_id=span_id,
            name=name,
            source=source,
            status_code=status_code,
            duration_min_ms=duration_min_ms,
            duration_max_ms=duration_max_ms,
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
    return TraceQueryPageResponse(
        items=[TraceQueryResponse.model_validate(span) for span in page.items],
        next_cursor=page.next_cursor,
    )


@router.get(
    "/metrics/aggregate",
    response_model=MetricAggregatePageResponse,
    summary="查询指标聚合窗口",
)
def aggregate_metrics(
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    name: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    source: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    window: Literal["1m", "5m", "15m", "1h"] = "5m",
    aggregation: Literal["avg", "sum", "min", "max", "count"] = "avg",
    limit: Annotated[int, Query(gt=0, le=500)] = 100,
) -> MetricAggregatePageResponse:
    try:
        items = query_service.aggregate_metrics(
            user=current_user,
            project_id=project_id,
            name=name,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            window=window,
            aggregation=aggregation,
            limit=limit,
        )
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    return MetricAggregatePageResponse(
        items=[MetricAggregateResponse.model_validate(item) for item in items]
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
