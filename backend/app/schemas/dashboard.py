from __future__ import annotations

import re
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
DASHBOARD_EXPORT_SCHEMA = "telemetry.dashboard"
DASHBOARD_EXPORT_VERSION = 1
MAX_DASHBOARD_JSON_BYTES = 64 * 1024
MAX_DASHBOARD_JSON_DEPTH = 32
MAX_DASHBOARD_JSON_NODES = 4096
MAX_DASHBOARD_PANEL_ID_LENGTH = 64
MAX_DASHBOARD_PANEL_TITLE_LENGTH = 120
MAX_DASHBOARD_VARIABLE_NAME_LENGTH = 64
MAX_DASHBOARD_VARIABLE_LABEL_LENGTH = 120
MAX_DASHBOARD_VARIABLE_TYPE_LENGTH = 32
MAX_DASHBOARD_VARIABLE_VALUE_LENGTH = 256

PANEL_TYPES = frozenset({"metrics", "logs", "events", "traces", "topology"})
DASHBOARD_TIME_RANGE_RELATIVES = frozenset({"15m", "1h", "6h", "24h", "7d"})
DASHBOARD_VARIABLE_TYPES = frozenset({"text", "number", "select"})
DASHBOARD_VARIABLE_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
DASHBOARD_IMPORT_FORBIDDEN_FIELDS = frozenset(
    {
        "id",
        "project_id",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at",
    }
)


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
    if not isinstance(value, dict):
        return
    if "time_range" in value:
        _validate_dashboard_time_range(value["time_range"])
    if "panels" in value:
        panels = value["panels"]
        if not isinstance(panels, list):
            raise ValueError("config.panels 必须是数组")
        _validate_panel_collection(panels, field_path="config.panels")
    if "variables" in value:
        variables = value["variables"]
        if not isinstance(variables, list):
            raise ValueError("config.variables 必须是数组")
        _validate_variable_collection(variables, field_path="config.variables")


def _validate_dashboard_time_range(time_range: Any) -> None:
    if not isinstance(time_range, dict):
        raise ValueError("config.time_range 必须是 JSON 对象")

    mode = _require_non_empty_string(
        time_range,
        key="mode",
        field_path="config.time_range",
        max_length=len("absolute"),
    )
    if mode == "relative":
        _validate_relative_time_range(time_range)
        return
    if mode == "absolute":
        _validate_absolute_time_range(time_range)
        return
    raise ValueError("config.time_range.mode 必须是 relative/absolute 之一")


def _validate_relative_time_range(time_range: dict[str, Any]) -> None:
    relative = _require_non_empty_string(
        time_range,
        key="relative",
        field_path="config.time_range",
        max_length=max(len(value) for value in DASHBOARD_TIME_RANGE_RELATIVES),
    )
    if relative not in DASHBOARD_TIME_RANGE_RELATIVES:
        raise ValueError("config.time_range.relative 必须是 15m/1h/6h/24h/7d 之一")


def _validate_absolute_time_range(time_range: dict[str, Any]) -> None:
    from_value = _require_trimmed_string(
        time_range,
        key="from",
        field_path="config.time_range",
    )
    to_value = _require_trimmed_string(
        time_range,
        key="to",
        field_path="config.time_range",
    )
    from_datetime = _parse_iso_datetime(
        from_value,
        field_path="config.time_range.from",
    )
    to_datetime = _parse_iso_datetime(
        to_value,
        field_path="config.time_range.to",
    )
    try:
        is_valid_range = from_datetime < to_datetime
    except TypeError:
        raise ValueError("config.time_range.from/to 必须使用可比较的 ISO 8601 时间字符串") from None
    if not is_valid_range:
        raise ValueError("config.time_range.from 必须早于 config.time_range.to")


def _parse_iso_datetime(value: str, *, field_path: str) -> datetime:
    parseable_value = f"{value[:-1]}+00:00" if value.endswith("Z") else value
    try:
        return datetime.fromisoformat(parseable_value)
    except ValueError:
        raise ValueError(f"{field_path} 必须是 ISO 8601 时间字符串") from None


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


def _validate_variable_collection(variables: list[Any], *, field_path: str) -> None:
    seen_names: set[str] = set()
    for index, variable in enumerate(variables):
        variable_path = f"{field_path}[{index}]"
        if not isinstance(variable, dict):
            raise ValueError(f"{variable_path} 必须是 JSON 对象")
        variable_name = _validate_variable(variable, field_path=variable_path)
        if variable_name in seen_names:
            raise ValueError(f"{variable_path}.name 不能重复")
        seen_names.add(variable_name)


def _validate_variable(variable: dict[str, Any], *, field_path: str) -> str:
    variable_name = _require_non_empty_string(
        variable,
        key="name",
        field_path=field_path,
        max_length=MAX_DASHBOARD_VARIABLE_NAME_LENGTH,
    )
    if DASHBOARD_VARIABLE_NAME_PATTERN.fullmatch(variable_name) is None:
        raise ValueError(f"{field_path}.name 只能包含字母、数字和下划线，且不能以数字开头")

    _optional_non_empty_string(
        variable,
        key="label",
        field_path=field_path,
        max_length=MAX_DASHBOARD_VARIABLE_LABEL_LENGTH,
    )
    variable_type = _require_non_empty_string(
        variable,
        key="type",
        field_path=field_path,
        max_length=MAX_DASHBOARD_VARIABLE_TYPE_LENGTH,
    )
    if variable_type not in DASHBOARD_VARIABLE_TYPES:
        raise ValueError(f"{field_path}.type 必须是 text/number/select 之一")

    if variable_type == "text":
        _validate_text_variable(variable, field_path=field_path)
    elif variable_type == "number":
        _validate_number_variable(variable, field_path=field_path)
    else:
        _validate_select_variable(variable, field_path=field_path)
    return variable_name


def _validate_text_variable(variable: dict[str, Any], *, field_path: str) -> None:
    if "options" in variable:
        raise ValueError(f"{field_path}.options 仅支持 select 类型变量")
    _optional_trimmed_string(
        variable,
        key="default",
        field_path=field_path,
        max_length=MAX_DASHBOARD_VARIABLE_VALUE_LENGTH,
    )


def _validate_number_variable(variable: dict[str, Any], *, field_path: str) -> None:
    if "options" in variable:
        raise ValueError(f"{field_path}.options 仅支持 select 类型变量")
    if "default" not in variable:
        return
    default_value = variable["default"]
    if isinstance(default_value, bool) or not isinstance(default_value, (int, float)):
        raise ValueError(f"{field_path}.default 必须是有限数字")
    if isinstance(default_value, float) and not isfinite(default_value):
        raise ValueError(f"{field_path}.default 必须是有限数字")


def _validate_select_variable(variable: dict[str, Any], *, field_path: str) -> None:
    if "options" not in variable:
        raise ValueError(f"{field_path}.options 为必填字段")
    raw_options = variable["options"]
    if not isinstance(raw_options, list):
        raise ValueError(f"{field_path}.options 必须是数组")
    if not raw_options:
        raise ValueError(f"{field_path}.options 不能为空")

    options: list[str] = []
    seen_options: set[str] = set()
    for index, raw_option in enumerate(raw_options):
        option_path = f"{field_path}.options[{index}]"
        if not isinstance(raw_option, str):
            raise ValueError(f"{option_path} 必须是字符串")
        option = raw_option.strip()
        if not option:
            raise ValueError(f"{option_path} 不能为空")
        if len(option) > MAX_DASHBOARD_VARIABLE_VALUE_LENGTH:
            raise ValueError(f"{option_path} 不能超过 {MAX_DASHBOARD_VARIABLE_VALUE_LENGTH} 字符")
        if option in seen_options:
            raise ValueError(f"{option_path} 不能重复")
        seen_options.add(option)
        options.append(option)
    variable["options"] = options

    default_value = _optional_trimmed_string(
        variable,
        key="default",
        field_path=field_path,
        max_length=MAX_DASHBOARD_VARIABLE_VALUE_LENGTH,
    )
    if default_value is not None and default_value not in seen_options:
        raise ValueError(f"{field_path}.default 必须匹配 options 中的一个值")


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
    mapping[key] = stripped_value
    return stripped_value


def _optional_non_empty_string(
    mapping: dict[str, Any],
    *,
    key: str,
    field_path: str,
    max_length: int,
) -> str | None:
    if key not in mapping:
        return None
    return _require_non_empty_string(
        mapping,
        key=key,
        field_path=field_path,
        max_length=max_length,
    )


def _optional_trimmed_string(
    mapping: dict[str, Any],
    *,
    key: str,
    field_path: str,
    max_length: int,
) -> str | None:
    if key not in mapping:
        return None
    value = mapping[key]
    if not isinstance(value, str):
        raise ValueError(f"{field_path}.{key} 必须是字符串")
    stripped_value = value.strip()
    if len(stripped_value) > max_length:
        raise ValueError(f"{field_path}.{key} 不能超过 {max_length} 字符")
    mapping[key] = stripped_value
    return stripped_value


def _require_trimmed_string(
    mapping: dict[str, Any],
    *,
    key: str,
    field_path: str,
) -> str:
    if key not in mapping:
        raise ValueError(f"{field_path}.{key} 为必填字段")
    value = mapping[key]
    if not isinstance(value, str):
        raise ValueError(f"{field_path}.{key} 必须是字符串")
    stripped_value = value.strip()
    if not stripped_value:
        raise ValueError(f"{field_path}.{key} 不能为空")
    mapping[key] = stripped_value
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


class DashboardCreateFromTemplate(DashboardSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class DashboardExportDocument(DashboardSchema):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    schema_: str = Field(alias="schema", min_length=1, max_length=64)
    version: int = Field(strict=True, ge=1)
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(max_length=500)
    layout: DashboardJson
    config: DashboardJson

    @model_validator(mode="before")
    @classmethod
    def reject_instance_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            forbidden_fields = sorted(set(data) & DASHBOARD_IMPORT_FORBIDDEN_FIELDS)
            if forbidden_fields:
                raise ValueError("导入文档不能包含实例字段: " + ", ".join(forbidden_fields))
        return data

    @field_validator("schema_")
    @classmethod
    def validate_schema_name(cls, value: str) -> str:
        if value != DASHBOARD_EXPORT_SCHEMA:
            raise ValueError(f"schema 必须是 {DASHBOARD_EXPORT_SCHEMA}")
        return value

    @field_validator("version")
    @classmethod
    def validate_version(cls, value: int) -> int:
        if value != DASHBOARD_EXPORT_VERSION:
            raise ValueError(f"version 必须是 {DASHBOARD_EXPORT_VERSION}")
        return value

    @field_validator("layout", "config")
    @classmethod
    def validate_json_container(
        cls,
        value: DashboardJson,
        info: ValidationInfo,
    ) -> DashboardJson:
        return _validate_dashboard_json(value, field_name=info.field_name or "dashboard JSON")


class DashboardImportRequest(DashboardSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    document: DashboardExportDocument
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


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


class DashboardTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    layout: DashboardJson
    config: DashboardJson


class DashboardTemplateListResponse(BaseModel):
    items: list[DashboardTemplateResponse]


class DashboardPanelPreviewResponse(BaseModel):
    project_id: int
    dashboard_id: int
    panel_id: str
    title: str
    panel_type: str
    query: dict[str, Any]
    preview: dict[str, Any]
