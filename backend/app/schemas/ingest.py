from __future__ import annotations

import json
from datetime import datetime
from enum import StrEnum
from math import isfinite
from numbers import Real
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_EVENT_PAYLOAD_BYTES = 64 * 1024
MAX_BATCH_EVENTS = 100
MAX_BATCH_PAYLOAD_BYTES = 256 * 1024
MAX_METRIC_DATAPOINTS = 100
MAX_METRICS_PAYLOAD_BYTES = 256 * 1024
MAX_LOG_RECORDS = 100
MAX_LOGS_PAYLOAD_BYTES = 256 * 1024
MAX_LOG_MESSAGE_LENGTH = 8 * 1024


def json_size_bytes(value: Any) -> int:
    return len(
        json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    )


def reject_non_finite_numbers(value: Any) -> None:
    if isinstance(value, float) and not isfinite(value):
        raise ValueError("payload 不能包含 NaN 或 Infinity")
    if isinstance(value, dict):
        for nested_value in value.values():
            reject_non_finite_numbers(nested_value)
    elif isinstance(value, list | tuple):
        for nested_value in value:
            reject_non_finite_numbers(nested_value)


class IngestKind(StrEnum):
    event = "event"
    metric = "metric"
    log = "log"


class IngestEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    type: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    )
    payload: dict[str, Any]
    timestamp: datetime | None = None
    source: str | None = Field(default=None, max_length=128)

    @field_validator("payload")
    @classmethod
    def validate_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        reject_non_finite_numbers(value)
        payload_size = json_size_bytes(value)
        if payload_size > MAX_EVENT_PAYLOAD_BYTES:
            raise ValueError(f"payload 不能超过 {MAX_EVENT_PAYLOAD_BYTES} 字节")
        return value


class IngestBatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[IngestEventCreate] = Field(min_length=1, max_length=MAX_BATCH_EVENTS)

    @model_validator(mode="after")
    def validate_batch_payload_size(self) -> IngestBatchCreate:
        batch_size = json_size_bytes([event.model_dump(mode="json") for event in self.events])
        if batch_size > MAX_BATCH_PAYLOAD_BYTES:
            raise ValueError(f"batch payload 不能超过 {MAX_BATCH_PAYLOAD_BYTES} 字节")
        return self


class IngestMetricCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    )
    value: float
    timestamp: datetime | None = None
    unit: str | None = Field(default=None, max_length=32)
    type: str | None = Field(
        default=None,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    )
    tags: dict[str, Any] | None = None
    source: str | None = Field(default=None, max_length=128)
    payload: dict[str, Any] | None = None

    @field_validator("value", mode="before")
    @classmethod
    def validate_value_type(cls, value: Any) -> Any:
        if isinstance(value, bool) or not isinstance(value, Real):
            raise ValueError("value 必须是 JSON 数值")
        return value

    @field_validator("value")
    @classmethod
    def validate_value(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("value 必须是有限数值")
        return value

    @field_validator("tags", "payload")
    @classmethod
    def validate_json_object(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is not None:
            reject_non_finite_numbers(value)
        return value


class IngestMetricsCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metrics: list[IngestMetricCreate] = Field(min_length=1, max_length=MAX_METRIC_DATAPOINTS)

    @model_validator(mode="after")
    def validate_metrics_payload_size(self) -> IngestMetricsCreate:
        payload_size = json_size_bytes([metric.model_dump(mode="json") for metric in self.metrics])
        if payload_size > MAX_METRICS_PAYLOAD_BYTES:
            raise ValueError(f"metrics payload 不能超过 {MAX_METRICS_PAYLOAD_BYTES} 字节")
        return self


class IngestLogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    level: str = Field(
        min_length=1,
        max_length=32,
        pattern=r"^[A-Za-z][A-Za-z0-9._:-]*$",
    )
    message: str = Field(min_length=1, max_length=MAX_LOG_MESSAGE_LENGTH)
    timestamp: datetime | None = None
    logger: str | None = Field(default=None, max_length=128)
    source: str | None = Field(default=None, max_length=128)
    trace_id: str | None = Field(default=None, max_length=128)
    span_id: str | None = Field(default=None, max_length=128)
    attributes: dict[str, Any] | None = None
    payload: dict[str, Any] | None = None

    @field_validator("attributes", "payload")
    @classmethod
    def validate_json_object(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is not None:
            reject_non_finite_numbers(value)
        return value


class IngestLogsCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    logs: list[IngestLogCreate] = Field(min_length=1, max_length=MAX_LOG_RECORDS)

    @model_validator(mode="after")
    def validate_logs_payload_size(self) -> IngestLogsCreate:
        payload_size = json_size_bytes([log.model_dump(mode="json") for log in self.logs])
        if payload_size > MAX_LOGS_PAYLOAD_BYTES:
            raise ValueError(f"logs payload 不能超过 {MAX_LOGS_PAYLOAD_BYTES} 字节")
        return self


class IngestReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    kind: IngestKind
    type: str
    received_at: datetime


class IngestBatchResponse(BaseModel):
    accepted_count: int
    receipts: list[IngestReceiptResponse]


class IngestStatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bucket_start: datetime
    project_id: int
    api_key_id: int
    kind: IngestKind
    source: str | None
    accepted_count: int
    rejected_count: int
    bytes_count: int
