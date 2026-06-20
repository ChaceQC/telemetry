from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, PositiveInt


class ResourceStatus(StrEnum):
    active = "active"
    inactive = "inactive"
    archived = "archived"


class ManagementSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class ResourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    key: str
    description: str | None
    status: ResourceStatus
    created_at: datetime


class ProjectCreate(ManagementSchema):
    name: str = Field(min_length=1, max_length=100)
    key: str = Field(min_length=2, max_length=64, pattern=r"^[a-z][a-z0-9_-]*$")
    description: str | None = Field(default=None, max_length=500)
    status: ResourceStatus = ResourceStatus.active


class ProjectResponse(ResourceResponse):
    pass


class EnvironmentCreate(ProjectCreate):
    project_id: PositiveInt


class EnvironmentResponse(ResourceResponse):
    project_id: int


class ServiceCreate(EnvironmentCreate):
    environment_id: PositiveInt


class ServiceResponse(ResourceResponse):
    project_id: int
    environment_id: int
