from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class EventQueryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    type: str
    source: str | None
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime


class EventQueryPageResponse(BaseModel):
    items: list[EventQueryResponse]
    next_cursor: str | None


class LogQueryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    level: str
    message: str
    source: str | None
    logger: str | None
    trace_id: str | None
    span_id: str | None
    attributes: dict[str, Any]
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime


class LogQueryPageResponse(BaseModel):
    items: list[LogQueryResponse]
    next_cursor: str | None


class LogContextQueryResponse(BaseModel):
    target: LogQueryResponse
    before: list[LogQueryResponse]
    after: list[LogQueryResponse]


class MetricQueryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    value: float
    unit: str | None
    type: str | None
    source: str | None
    tags: dict[str, Any]
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime


class MetricQueryPageResponse(BaseModel):
    items: list[MetricQueryResponse]
    next_cursor: str | None
