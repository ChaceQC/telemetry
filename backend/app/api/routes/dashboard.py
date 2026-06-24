import json
import re
from datetime import UTC, datetime, timedelta
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

DASHBOARD_RELATIVE_TIME_DELTAS = {
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}
PANEL_QUERY_VARIABLE_TEMPLATE_PATTERN = re.compile(r"^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$")


def _reject_json_constant(value: str) -> Any:
    raise ValueError(f"invalid JSON constant: {value}")


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


def _preview_now() -> datetime:
    return datetime.now(UTC)


def _parse_dashboard_time_range_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _dashboard_time_range_query(config: Any) -> dict[str, datetime | None]:
    if not isinstance(config, dict):
        return {}
    time_range = config.get("time_range")
    if not isinstance(time_range, dict):
        return {}

    mode = time_range.get("mode")
    if mode == "relative":
        relative = time_range.get("relative")
        if not isinstance(relative, str):
            return {}
        delta = DASHBOARD_RELATIVE_TIME_DELTAS.get(relative)
        if delta is None:
            return {}
        occurred_to = _preview_now()
        return {"occurred_from": occurred_to - delta, "occurred_to": occurred_to}
    if mode != "absolute":
        return {}

    occurred_from = _parse_dashboard_time_range_datetime(time_range.get("from"))
    absolute_occurred_to = _parse_dashboard_time_range_datetime(time_range.get("to"))
    if occurred_from is None or absolute_occurred_to is None:
        return {}
    try:
        if occurred_from >= absolute_occurred_to:
            return {}
    except TypeError:
        return {}
    return {"occurred_from": occurred_from, "occurred_to": absolute_occurred_to}


def _dashboard_variable_definitions(config: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(config, dict):
        return {}
    variables = config.get("variables")
    if not isinstance(variables, list):
        return {}

    definitions: dict[str, dict[str, Any]] = {}
    for variable in variables:
        if not isinstance(variable, dict):
            continue
        variable_name = variable.get("name")
        if isinstance(variable_name, str):
            definitions[variable_name] = variable
    return definitions


def _parse_panel_preview_variable_overrides(raw_variables: str | None) -> dict[str, Any]:
    if raw_variables is None:
        return {}
    if not raw_variables.strip():
        raise QueryFilterError("variables 必须是 JSON 对象")
    try:
        parsed_variables = json.loads(
            raw_variables,
            parse_constant=_reject_json_constant,
        )
    except ValueError as error:
        raise QueryFilterError("variables 必须是合法 JSON 对象") from error
    if not isinstance(parsed_variables, dict):
        raise QueryFilterError("variables 必须是 JSON 对象")
    return parsed_variables


def _dashboard_variable_select_options(
    variable: dict[str, Any],
    variable_name: str,
) -> set[str]:
    raw_options = variable.get("options")
    if not isinstance(raw_options, list) or not raw_options:
        raise QueryFilterError(f"panel.query 变量 {variable_name}.options 必须是非空字符串数组")
    options: set[str] = set()
    for option in raw_options:
        if not isinstance(option, str):
            raise QueryFilterError(f"panel.query 变量 {variable_name}.options 必须是非空字符串数组")
        options.add(option)
    return options


def _dashboard_variable_typed_value(
    variable: dict[str, Any],
    variable_name: str,
    value: Any,
    *,
    value_label: str,
) -> str | int | float:
    variable_type = variable.get("type")
    if variable_type in {"text", "select"}:
        if not isinstance(value, str):
            raise QueryFilterError(f"panel.query 变量 {variable_name}.{value_label} 必须是字符串")
        if variable_type == "select" and value not in _dashboard_variable_select_options(
            variable,
            variable_name,
        ):
            raise QueryFilterError(
                f"panel.query 变量 {variable_name}.{value_label} 必须匹配 options"
            )
        return value
    if variable_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            raise QueryFilterError(f"panel.query 变量 {variable_name}.{value_label} 必须是有限数值")
        return value
    raise QueryFilterError(f"panel.query 变量 {variable_name}.type 必须是 text/number/select 之一")


def _validate_panel_preview_variable_overrides(
    definitions: dict[str, dict[str, Any]],
    variable_overrides: dict[str, Any],
) -> None:
    for variable_name, override_value in variable_overrides.items():
        variable = definitions.get(variable_name)
        if variable is None:
            raise QueryFilterError(f"variables.{variable_name} 未定义")
        _dashboard_variable_typed_value(
            variable,
            variable_name,
            override_value,
            value_label="override",
        )


def _dashboard_variable_value(
    definitions: dict[str, dict[str, Any]],
    variable_name: str,
    *,
    variable_overrides: dict[str, Any],
) -> str | int | float:
    variable = definitions.get(variable_name)
    if variable is None:
        raise QueryFilterError(f"panel.query 变量 {variable_name} 未定义")
    if variable_name in variable_overrides:
        return _dashboard_variable_typed_value(
            variable,
            variable_name,
            variable_overrides[variable_name],
            value_label="override",
        )
    if "default" not in variable:
        raise QueryFilterError(f"panel.query 变量 {variable_name} 缺少 default")
    return _dashboard_variable_typed_value(
        variable,
        variable_name,
        variable["default"],
        value_label="default",
    )


def _panel_query_variable_name(value: str) -> str | None:
    match = PANEL_QUERY_VARIABLE_TEMPLATE_PATTERN.fullmatch(value)
    if match is not None:
        return match.group(1)
    if "${" in value:
        raise QueryFilterError("panel.query 变量模板语法无效")
    return None


def _resolve_panel_query_variable_defaults(
    query: dict[str, Any],
    *,
    dashboard_config: Any,
    variable_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    definitions = _dashboard_variable_definitions(dashboard_config)
    normalized_variable_overrides = variable_overrides or {}
    _validate_panel_preview_variable_overrides(definitions, normalized_variable_overrides)
    resolved_query: dict[str, Any] = {}
    for key, value in query.items():
        if isinstance(value, str):
            variable_name = _panel_query_variable_name(value)
            if variable_name is not None:
                value = _dashboard_variable_value(
                    definitions,
                    variable_name,
                    variable_overrides=normalized_variable_overrides,
                )
        resolved_query[key] = value
    return resolved_query


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


def _preview_common_query(
    query: dict[str, Any],
    *,
    dashboard_time_range: dict[str, datetime | None],
) -> dict[str, Any]:
    occurred_from = _panel_query_datetime(query, "occurred_from")
    occurred_to = _panel_query_datetime(query, "occurred_to")
    return {
        "source": _panel_query_string(query, "source", max_length=128),
        "occurred_from": occurred_from
        if occurred_from is not None
        else dashboard_time_range.get("occurred_from"),
        "occurred_to": occurred_to
        if occurred_to is not None
        else dashboard_time_range.get("occurred_to"),
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
    dashboard_time_range: dict[str, datetime | None],
) -> dict[str, Any]:
    common_query = _preview_common_query(query, dashboard_time_range=dashboard_time_range)
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
    variables: Annotated[str | None, Query(max_length=8192)] = None,
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
        variable_overrides = _parse_panel_preview_variable_overrides(variables)
        resolved_panel_query = _resolve_panel_query_variable_defaults(
            panel_query,
            dashboard_config=dashboard.config,
            variable_overrides=variable_overrides,
        )
        preview = _build_panel_preview(
            query_service=query_service,
            current_user=current_user,
            project_id=project_id,
            panel_type=panel_type,
            query=resolved_panel_query,
            dashboard_time_range=_dashboard_time_range_query(dashboard.config),
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
