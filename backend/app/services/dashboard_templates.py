from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass

from app.schemas.dashboard import DashboardCreate, DashboardJson
from app.services.errors import ResourceNotFoundError


@dataclass(frozen=True)
class DashboardTemplateRecord:
    id: str
    name: str
    description: str | None
    layout: DashboardJson
    config: DashboardJson


@dataclass(frozen=True)
class _DashboardTemplateDefinition:
    id: str
    name: str
    description: str | None
    layout: DashboardJson
    config: DashboardJson


_SERVICE_OVERVIEW_TEMPLATE = _DashboardTemplateDefinition(
    id="service-overview",
    name="服务总览",
    description="内置服务健康总览，覆盖指标、日志、链路和拓扑的最小排障入口。",
    layout={
        "version": 1,
        "columns": 12,
        "row_height": 8,
    },
    config={
        "version": 1,
        "refresh_seconds": 30,
        "time_range": {"mode": "relative", "relative": "1h"},
        "variables": [
            {
                "name": "service_source",
                "label": "服务来源",
                "type": "text",
                "default": "api",
            },
            {
                "name": "log_level",
                "label": "日志级别",
                "type": "select",
                "default": "error",
                "options": ["error", "warn", "info"],
            },
            {
                "name": "row_limit",
                "label": "样本数",
                "type": "number",
                "default": 20,
            },
        ],
        "panels": [
            {
                "id": "latency-trend",
                "title": "请求延迟趋势",
                "type": "metrics",
                "query": {
                    "source": "${service_source}",
                    "name": "http.server.duration",
                    "aggregation": "avg",
                    "window": "5m",
                    "limit": "${row_limit}",
                },
                "layout": {"x": 0, "y": 0, "w": 6, "h": 4},
            },
            {
                "id": "recent-logs",
                "title": "近期关键日志",
                "type": "logs",
                "query": {
                    "source": "${service_source}",
                    "level": "${log_level}",
                    "limit": "${row_limit}",
                },
                "layout": {"x": 6, "y": 0, "w": 6, "h": 4},
            },
            {
                "id": "recent-traces",
                "title": "近期链路样本",
                "type": "traces",
                "query": {
                    "source": "${service_source}",
                    "limit": "${row_limit}",
                },
                "layout": {"x": 0, "y": 4, "w": 6, "h": 4},
            },
            {
                "id": "service-topology",
                "title": "服务拓扑",
                "type": "topology",
                "query": {
                    "source": "${service_source}",
                    "limit": "${row_limit}",
                },
                "layout": {"x": 6, "y": 4, "w": 6, "h": 4},
            },
        ],
    },
)

_BUILT_IN_DASHBOARD_TEMPLATES = (_SERVICE_OVERVIEW_TEMPLATE,)
_DASHBOARD_TEMPLATE_BY_ID = {template.id: template for template in _BUILT_IN_DASHBOARD_TEMPLATES}


def _copy_dashboard_json(value: DashboardJson) -> DashboardJson:
    return deepcopy(value)


def _template_record(definition: _DashboardTemplateDefinition) -> DashboardTemplateRecord:
    payload = DashboardCreate(
        project_id=1,
        name=definition.name,
        description=definition.description,
        layout=_copy_dashboard_json(definition.layout),
        config=_copy_dashboard_json(definition.config),
    )
    return DashboardTemplateRecord(
        id=definition.id,
        name=payload.name,
        description=payload.description,
        layout=payload.layout,
        config=payload.config,
    )


def list_builtin_dashboard_templates() -> list[DashboardTemplateRecord]:
    return [_template_record(template) for template in _BUILT_IN_DASHBOARD_TEMPLATES]


def get_builtin_dashboard_template(template_id: str) -> DashboardTemplateRecord:
    normalized_template_id = template_id.strip()
    definition = _DASHBOARD_TEMPLATE_BY_ID.get(normalized_template_id)
    if definition is None:
        raise ResourceNotFoundError("仪表盘模板不存在")
    return _template_record(definition)
