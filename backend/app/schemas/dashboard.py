from __future__ import annotations

from datetime import datetime
from math import isfinite
from typing import Any, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    ValidationInfo,
    field_validator,
    model_validator,
)

from app.schemas.json_validation import validate_json_payload

DashboardJson = dict[str, Any] | list[Any]
MAX_DASHBOARD_JSON_BYTES = 64 * 1024
MAX_DASHBOARD_JSON_DEPTH = 32
MAX_DASHBOARD_JSON_NODES = 4096
MAX_DASHBOARD_PANEL_ID_LENGTH = 64
MAX_DASHBOARD_PANEL_TITLE_LENGTH = 120

PANEL_TYPES = frozenset({"metrics", "logs", "events", "traces", "topology"})


def _default_json_object() -> dict[str, Any]:
    return {}


def _validate_dashboard_json(value: DashboardJson, *, field_name: str) -> DashboardJson:
    if not isinstance(value, dict | list):
        raise ValueError("必须是 JSON 对象或数组")
    validate_json_payload(
        value,
        field_name=field_name,
        max_bytes=MAX_DASHBOARD_JSON_BYTES,
        max_depth=MAX_DASHBOARD_JSON_DEPTH,
        max_nodes=MAX_DASHBOARD_JSON_NODES,
    )
    if field_name == "config":
        _validate_dashboard_config(value)
    return value


def _validate_dashboard_config(value: DashboardJson) -> None:
    if not isinstance(value, dict) or "panels" not in value:
        return
    panels = value["panels"]
    if not isinstance(panels, list):
        raise ValueError("config.panels 必须是数组")
    _validate_panel_collection(panels, field_path="config.panels")


def _validate_panel_collection(panels: list[Any], *, field_path: str) -> None:
    seen_ids: set[str] = set()
    for index, panel in enumerate(panels):
        panel_path = f"{field_path}[{index}]"
        if not isinstance(panel, dict):
            raise ValueError(f"{panel_path} 必须是 JSON 对象")
        panel_id = _validate_panel(panel, field_path=panel_path)
        if panel_id in seen_ids:
            raise ValueError(f"{panel_path}.id 不能重复")
        seen_ids.add(panel_id)


def _validate_panel(panel: dict[str, Any], *, field_path: str) -> str:
    panel_id = _require_non_empty_string(
        panel,
        key="id",
        field_path=field_path,
        max_length=MAX_DASHBOARD_PANEL_ID_LENGTH,
    )
    _require_non_empty_string(
        panel,
        key="title",
        field_path=field_path,
        max_length=MAX_DASHBOARD_PANEL_TITLE_LENGTH,
    )
    panel_type = _require_non_empty_string(
        panel,
        key="type",
        field_path=field_path,
        max_length=max(len(panel_type) for panel_type in PANEL_TYPES),
    )
    if panel_type not in PANEL_TYPES:
        raise ValueError(f"{field_path}.type 必须是 metrics/logs/events/traces/topology 之一")

    query = panel.get("query")
    if not isinstance(query, dict):
        raise ValueError(f"{field_path}.query 必须是 JSON 对象")
    _validate_panel_layout(panel, field_path=field_path)
    return panel_id


def _validate_panel_layout(panel: dict[str, Any], *, field_path: str) -> None:
    if "layout" not in panel:
        return
    layout = panel["layout"]
    if not isinstance(layout, dict):
        raise ValueError(f"{field_path}.layout 必须是 JSON 对象")
    layout_path = f"{field_path}.layout"

    for key in ("x", "y"):
        _require_number(
            layout,
            key=key,
            field_path=layout_path,
            minimum=0,
        )
    for key in ("w", "h"):
        _require_number(
            layout,
            key=key,
            field_path=layout_path,
            minimum=1,
        )


def _require_non_empty_string(
    mapping: dict[str, Any],
    *,
    key: str,
    field_path: str,
    max_length: int,
) -> str:
    if key not in mapping:
        raise ValueError(f"{field_path}.{key} 为必填字段")
    value = mapping[key]
    if not isinstance(value, str):
        raise ValueError(f"{field_path}.{key} 必须是字符串")
    stripped_value = value.strip()
    if not stripped_value:
        raise ValueError(f"{field_path}.{key} 不能为空")
    if len(stripped_value) > max_length:
        raise ValueError(f"{field_path}.{key} 不能超过 {max_length} 字符")
    return stripped_value


def _require_number(
    mapping: dict[str, Any],
    *,
    key: str,
    field_path: str,
    minimum: int,
) -> None:
    if key not in mapping:
        raise ValueError(f"{field_path}.{key} 为必填字段")
    value = mapping[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_path}.{key} 必须是数字")
    if isinstance(value, float) and not isfinite(value):
        raise ValueError(f"{field_path}.{key} 必须是有限数字")
    if value < minimum:
        raise ValueError(f"{field_path}.{key} 不能小于 {minimum}")


class DashboardSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class DashboardCreate(DashboardSchema):
    project_id: PositiveInt
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    layout: DashboardJson = Field(default_factory=_default_json_object)
    config: DashboardJson = Field(default_factory=_default_json_object)

    @field_validator("layout", "config")
    @classmethod
    def validate_json_container(
        cls,
        value: DashboardJson,
        info: ValidationInfo,
    ) -> DashboardJson:
        return _validate_dashboard_json(value, field_name=info.field_name or "dashboard JSON")


class DashboardUpdate(DashboardSchema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    layout: DashboardJson | None = None
    config: DashboardJson | None = None

    @field_validator("layout", "config")
    @classmethod
    def validate_json_container(
        cls,
        value: DashboardJson | None,
        info: ValidationInfo,
    ) -> DashboardJson | None:
        if value is None:
            return value
        return _validate_dashboard_json(value, field_name=info.field_name or "dashboard JSON")

    @model_validator(mode="after")
    def validate_patch_fields(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("至少提供一个可更新字段")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name 不能为空")
        if "layout" in self.model_fields_set and self.layout is None:
            raise ValueError("layout 必须是 JSON 对象或数组")
        if "config" in self.model_fields_set and self.config is None:
            raise ValueError("config 必须是 JSON 对象或数组")
        return self


class DashboardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    description: str | None
    layout: DashboardJson
    config: DashboardJson
    created_by_user_id: int
    updated_by_user_id: int
    created_at: datetime
    updated_at: datetime


class DashboardListResponse(BaseModel):
    items: list[DashboardResponse]
    limit: int
    offset: int
    total: int
