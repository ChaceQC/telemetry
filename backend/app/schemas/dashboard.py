from __future__ import annotations

from datetime import datetime
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
    return value


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
