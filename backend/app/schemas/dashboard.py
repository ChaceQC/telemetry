from __future__ import annotations

from datetime import datetime
from typing import Any, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    field_validator,
    model_validator,
)

DashboardJson = dict[str, Any] | list[Any]


def _default_json_object() -> dict[str, Any]:
    return {}


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
    def validate_json_container(cls, value: DashboardJson) -> DashboardJson:
        if isinstance(value, dict | list):
            return value
        raise ValueError("必须是 JSON 对象或数组")


class DashboardUpdate(DashboardSchema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    layout: DashboardJson | None = None
    config: DashboardJson | None = None

    @field_validator("layout", "config")
    @classmethod
    def validate_json_container(cls, value: DashboardJson | None) -> DashboardJson | None:
        if value is None or isinstance(value, dict | list):
            return value
        raise ValueError("必须是 JSON 对象或数组")

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
