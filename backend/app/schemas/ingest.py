from __future__ import annotations

import json
from datetime import datetime
from enum import StrEnum
from math import isfinite
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_EVENT_PAYLOAD_BYTES = 64 * 1024
MAX_BATCH_EVENTS = 100
MAX_BATCH_PAYLOAD_BYTES = 256 * 1024


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
        payload_size = len(
            json.dumps(
                value,
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            ).encode("utf-8")
        )
        if payload_size > MAX_EVENT_PAYLOAD_BYTES:
            raise ValueError(f"payload 不能超过 {MAX_EVENT_PAYLOAD_BYTES} 字节")
        return value


class IngestBatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[IngestEventCreate] = Field(min_length=1, max_length=MAX_BATCH_EVENTS)

    @model_validator(mode="after")
    def validate_batch_payload_size(self) -> IngestBatchCreate:
        batch_size = len(
            json.dumps(
                [event.model_dump(mode="json") for event in self.events],
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            ).encode("utf-8")
        )
        if batch_size > MAX_BATCH_PAYLOAD_BYTES:
            raise ValueError(f"batch payload 不能超过 {MAX_BATCH_PAYLOAD_BYTES} 字节")
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
