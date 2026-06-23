from datetime import datetime
from math import isfinite
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.api.dependencies import get_current_user, get_dashboard_service, get_query_service
from app.repositories.auth import UserRecord
from app.schemas.dashboard import (
    DashboardCreate,
    DashboardListResponse,
    DashboardPanelPreviewResponse,
    DashboardResponse,
    DashboardUpdate,
)
from app.schemas.query import (
    EventQueryResponse,
    LogQueryResponse,
    MetricAggregateResponse,
    TraceQueryResponse,
    TraceTopologyResponse,
)
from app.services.dashboard import DashboardService
from app.services.errors import (
    ResourceForbiddenError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)
from app.services.query import QueryFilterError, QueryService

router = APIRouter(
    prefix="/api/v1",
    tags=["dashboards"],
    dependencies=[Depends(get_current_user)],
)


def _map_dashboard_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, ResourceForbiddenError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if isinstance(error, ResourceIntegrityError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="仪表盘接口错误")


def _find_dashboard_panel(config: Any, *, panel_id: str) -> dict[str, Any]:
    normalized_panel_id = panel_id.strip()
    if not normalized_panel_id or not isinstance(config, dict):
        raise ResourceNotFoundError("panel 不存在")
    panels = config.get("panels")
    if not isinstance(panels, list):
        raise ResourceNotFoundError("panel 不存在")
    for panel in panels:
        if isinstance(panel, dict) and panel.get("id") == normalized_panel_id:
            return panel
    raise ResourceNotFoundError("panel 不存在")


def _panel_query_string(
    query: dict[str, Any],
    key: str,
    *,
    max_length: int,
) -> str | None:
    value = query.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise QueryFilterError(f"panel.query.{key} 必须是字符串")
    normalized = value.strip()
    if len(normalized) > max_length:
        raise QueryFilterError(f"panel.query.{key} 不能超过 {max_length} 字符")
    return normalized or None


def _panel_query_datetime(query: dict[str, Any], key: str) -> datetime | None:
    value = query.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise QueryFilterError(f"panel.query.{key} 必须是 ISO 8601 时间字符串")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise QueryFilterError(f"panel.query.{key} 必须是 ISO 8601 时间字符串") from error


def _panel_query_limit(query: dict[str, Any], *, default: int = 20, maximum: int = 100) -> int:
    value = query.get("limit", default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise QueryFilterError("panel.query.limit 必须是整数")
    if value < 1 or value > maximum:
        raise QueryFilterError(f"panel.query.limit 必须在 1..{maximum} 之间")
    return value


def _panel_query_float(query: dict[str, Any], key: str) -> float | None:
    value = query.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise QueryFilterError(f"panel.query.{key} 必须是有限数值")
    return float(value)


def _panel_metric_window(query: dict[str, Any]) -> Literal["1m", "5m", "15m", "1h"]:
    value = query.get("window", "5m")
    if not isinstance(value, str):
        raise QueryFilterError("panel.query.window 必须是 1m/5m/15m/1h 之一")
    if value not in {"1m", "5m", "15m", "1h"}:
        raise QueryFilterError("panel.query.window 必须是 1m/5m/15m/1h 之一")
    return cast(Literal["1m", "5m", "15m", "1h"], value)


def _panel_metric_aggregation(
    query: dict[str, Any],
) -> Literal["avg", "sum", "min", "max", "count"]:
    value = query.get("aggregation", "avg")
    if not isinstance(value, str):
        raise QueryFilterError("panel.query.aggregation 必须是 avg/sum/min/max/count 之一")
    if value not in {"avg", "sum", "min", "max", "count"}:
        raise QueryFilterError("panel.query.aggregation 必须是 avg/sum/min/max/count 之一")
    return cast(Literal["avg", "sum", "min", "max", "count"], value)


def _panel_query_type(query: dict[str, Any]) -> str | None:
    event_type = _panel_query_string(query, "type", max_length=128)
    if event_type is None:
        event_type = _panel_query_string(query, "event_type", max_length=128)
    return event_type


def _preview_common_query(query: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": _panel_query_string(query, "source", max_length=128),
        "occurred_from": _panel_query_datetime(query, "occurred_from"),
        "occurred_to": _panel_query_datetime(query, "occurred_to"),
        "limit": _panel_query_limit(query),
    }


def _dump_items(items: list[Any], response_model: type[Any]) -> list[dict[str, Any]]:
    return [response_model.model_validate(item).model_dump(mode="json") for item in items]


def _build_panel_preview(
    *,
    query_service: QueryService,
    current_user: UserRecord,
    project_id: int,
    panel_type: str,
    query: dict[str, Any],
) -> dict[str, Any]:
    common_query = _preview_common_query(query)
    if panel_type == "metrics":
        items = query_service.aggregate_metrics(
            user=current_user,
            project_id=project_id,
            name=_panel_query_string(query, "name", max_length=128),
            source=common_query["source"],
            occurred_from=common_query["occurred_from"],
            occurred_to=common_query["occurred_to"],
            window=_panel_metric_window(query),
            aggregation=_panel_metric_aggregation(query),
            limit=common_query["limit"],
        )
        return {
            "kind": "metrics",
            "mode": "aggregate",
            "items": _dump_items(items, MetricAggregateResponse),
        }
    if panel_type == "logs":
        logs_page = query_service.list_logs(
            user=current_user,
            project_id=project_id,
            level=_panel_query_string(query, "level", max_length=32),
            source=common_query["source"],
            keyword=_panel_query_string(query, "keyword", max_length=128),
            trace_id=_panel_query_string(query, "trace_id", max_length=128),
            span_id=_panel_query_string(query, "span_id", max_length=128),
            request_id=_panel_query_string(query, "request_id", max_length=128),
            user_id=_panel_query_string(query, "user_id", max_length=128),
            occurred_from=common_query["occurred_from"],
            occurred_to=common_query["occurred_to"],
            limit=common_query["limit"],
            cursor=None,
        )
        return {
            "kind": "logs",
            "mode": "recent",
            "items": _dump_items(logs_page.items, LogQueryResponse),
        }
    if panel_type == "events":
        events_page = query_service.list_events(
            user=current_user,
            project_id=project_id,
            event_type=_panel_query_type(query),
            source=common_query["source"],
            occurred_from=common_query["occurred_from"],
            occurred_to=common_query["occurred_to"],
            limit=common_query["limit"],
            cursor=None,
        )
        return {
            "kind": "events",
            "mode": "recent",
            "items": _dump_items(events_page.items, EventQueryResponse),
        }
    if panel_type == "traces":
        traces_page = query_service.list_traces(
            user=current_user,
            project_id=project_id,
            trace_id=_panel_query_string(query, "trace_id", max_length=128),
            span_id=_panel_query_string(query, "span_id", max_length=128),
            name=_panel_query_string(query, "name", max_length=128),
            source=common_query["source"],
            status_code=_panel_query_string(query, "status_code", max_length=64),
            duration_min_ms=_panel_query_float(query, "duration_min_ms"),
            duration_max_ms=_panel_query_float(query, "duration_max_ms"),
            occurred_from=common_query["occurred_from"],
            occurred_to=common_query["occurred_to"],
            limit=common_query["limit"],
            cursor=None,
        )
        return {
            "kind": "traces",
            "mode": "recent",
            "items": _dump_items(traces_page.items, TraceQueryResponse),
        }
    if panel_type == "topology":
        topology = query_service.get_trace_topology(
            user=current_user,
            project_id=project_id,
            source=common_query["source"],
            occurred_from=common_query["occurred_from"],
            occurred_to=common_query["occurred_to"],
            limit=common_query["limit"],
        )
        payload = TraceTopologyResponse.model_validate(topology).model_dump(mode="json")
        return {
            "kind": "topology",
            "mode": "topology",
            "nodes": payload["nodes"],
            "edges": payload["edges"],
        }
    raise QueryFilterError("panel.type 暂不支持查询预览")


@router.get(
    "/dashboards",
    response_model=DashboardListResponse,
    summary="列出仪表盘",
)
def list_dashboards(
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(gt=0, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DashboardListResponse:
    try:
        page = dashboard_service.list_dashboards(
            user=current_user,
            project_id=project_id,
            limit=limit,
            offset=offset,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardListResponse(
        items=[DashboardResponse.model_validate(dashboard) for dashboard in page.items],
        limit=limit,
        offset=offset,
        total=page.total,
    )


@router.post(
    "/dashboards",
    response_model=DashboardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建仪表盘",
)
def create_dashboard(
    payload: DashboardCreate,
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> DashboardResponse:
    try:
        dashboard = dashboard_service.create_dashboard(payload=payload, user=current_user)
    except (ResourceForbiddenError, ResourceIntegrityError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardResponse.model_validate(dashboard)


@router.get(
    "/projects/{project_id}/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="读取仪表盘",
)
def get_project_dashboard(
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    dashboard_id: Annotated[int, Path(gt=0)],
) -> DashboardResponse:
    try:
        dashboard = dashboard_service.get_dashboard(
            user=current_user,
            project_id=project_id,
            dashboard_id=dashboard_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardResponse.model_validate(dashboard)


@router.get(
    "/projects/{project_id}/dashboards/{dashboard_id}/panels/{panel_id}/preview",
    response_model=DashboardPanelPreviewResponse,
    summary="预览仪表盘 panel 查询",
)
def preview_project_dashboard_panel(
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    query_service: Annotated[QueryService, Depends(get_query_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    dashboard_id: Annotated[int, Path(gt=0)],
    panel_id: Annotated[str, Path(min_length=1, max_length=64)],
) -> DashboardPanelPreviewResponse:
    try:
        dashboard = dashboard_service.get_dashboard(
            user=current_user,
            project_id=project_id,
            dashboard_id=dashboard_id,
        )
        panel = _find_dashboard_panel(dashboard.config, panel_id=panel_id)
        panel_title = panel.get("title")
        panel_type = panel.get("type")
        panel_query = panel.get("query")
        if (
            not isinstance(panel_title, str)
            or not isinstance(panel_type, str)
            or not isinstance(panel_query, dict)
        ):
            raise QueryFilterError("panel 配置无效")
        preview = _build_panel_preview(
            query_service=query_service,
            current_user=current_user,
            project_id=project_id,
            panel_type=panel_type,
            query=panel_query,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    except QueryFilterError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return DashboardPanelPreviewResponse(
        project_id=project_id,
        dashboard_id=dashboard_id,
        panel_id=str(panel["id"]),
        title=panel_title,
        panel_type=panel_type,
        query=panel_query,
        preview=preview,
    )


@router.patch(
    "/projects/{project_id}/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="更新仪表盘",
)
def update_project_dashboard(
    payload: DashboardUpdate,
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    dashboard_id: Annotated[int, Path(gt=0)],
) -> DashboardResponse:
    try:
        dashboard = dashboard_service.update_dashboard(
            user=current_user,
            project_id=project_id,
            dashboard_id=dashboard_id,
            payload=payload,
        )
    except (ResourceForbiddenError, ResourceIntegrityError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardResponse.model_validate(dashboard)


@router.delete(
    "/projects/{project_id}/dashboards/{dashboard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除仪表盘",
)
def delete_project_dashboard(
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    dashboard_id: Annotated[int, Path(gt=0)],
) -> None:
    try:
        dashboard_service.delete_dashboard(
            user=current_user,
            project_id=project_id,
            dashboard_id=dashboard_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
