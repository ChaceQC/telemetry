from __future__ import annotations

from datetime import datetime
from enum import StrEnum
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

AlertRuleJson = dict[str, Any]
MAX_ALERT_RULE_JSON_BYTES = 16 * 1024
MAX_ALERT_RULE_JSON_DEPTH = 16
MAX_ALERT_RULE_JSON_NODES = 1024
MIN_ALERT_EVALUATION_SECONDS = 1
MAX_ALERT_EVALUATION_SECONDS = 86_400


class AlertRuleSeverity(StrEnum):
    info = "info"
    warning = "warning"
    critical = "critical"


class AlertRuleSignal(StrEnum):
    metrics = "metrics"
    logs = "logs"
    traces = "traces"
    events = "events"


class AlertRuleSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


def _validate_alert_rule_json(value: AlertRuleJson, *, field_name: str) -> AlertRuleJson:
    if not isinstance(value, dict):
        raise ValueError("必须是 JSON 对象")
    if not value:
        raise ValueError("不能为空")
    validate_json_payload(
        value,
        field_name=field_name,
        max_bytes=MAX_ALERT_RULE_JSON_BYTES,
        max_depth=MAX_ALERT_RULE_JSON_DEPTH,
        max_nodes=MAX_ALERT_RULE_JSON_NODES,
    )
    if field_name == "evaluation":
        _validate_evaluation(value)
    return value


def _validate_evaluation(value: dict[str, Any]) -> None:
    for field_name in ("window_seconds", "interval_seconds"):
        if field_name not in value:
            raise ValueError(f"evaluation.{field_name} 为必填字段")
        raw_value = value[field_name]
        if isinstance(raw_value, bool) or not isinstance(raw_value, int):
            raise ValueError(f"evaluation.{field_name} 必须是整数")
        if raw_value < MIN_ALERT_EVALUATION_SECONDS:
            raise ValueError(f"evaluation.{field_name} 不能小于 {MIN_ALERT_EVALUATION_SECONDS}")
        if raw_value > MAX_ALERT_EVALUATION_SECONDS:
            raise ValueError(f"evaluation.{field_name} 不能超过 {MAX_ALERT_EVALUATION_SECONDS}")


class AlertRuleCreate(AlertRuleSchema):
    project_id: PositiveInt
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    enabled: bool = True
    severity: AlertRuleSeverity
    signal: AlertRuleSignal
    condition: AlertRuleJson
    evaluation: AlertRuleJson

    @field_validator("condition", "evaluation")
    @classmethod
    def validate_json_container(
        cls,
        value: AlertRuleJson,
        info: ValidationInfo,
    ) -> AlertRuleJson:
        return _validate_alert_rule_json(value, field_name=info.field_name or "alert rule JSON")


class AlertRuleUpdate(AlertRuleSchema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None
    severity: AlertRuleSeverity | None = None
    signal: AlertRuleSignal | None = None
    condition: AlertRuleJson | None = None
    evaluation: AlertRuleJson | None = None

    @field_validator("condition", "evaluation")
    @classmethod
    def validate_json_container(
        cls,
        value: AlertRuleJson | None,
        info: ValidationInfo,
    ) -> AlertRuleJson | None:
        if value is None:
            return value
        return _validate_alert_rule_json(value, field_name=info.field_name or "alert rule JSON")

    @model_validator(mode="after")
    def validate_patch_fields(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("至少提供一个可更新字段")
        nullable_fields = {"description"}
        for field_name in self.model_fields_set - nullable_fields:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} 不能为空")
        return self


class AlertRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    description: str | None
    enabled: bool
    severity: AlertRuleSeverity
    signal: AlertRuleSignal
    condition: AlertRuleJson
    evaluation: AlertRuleJson
    created_by_user_id: int
    updated_by_user_id: int
    created_at: datetime
    updated_at: datetime


class AlertRuleListResponse(BaseModel):
    items: list[AlertRuleResponse]
    limit: int
    offset: int
    total: int


class AlertRuleEvaluationWindowResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: datetime = Field(alias="from")
    to: datetime
    window_seconds: int
    interval_seconds: int


class AlertRuleEvaluationConditionResponse(BaseModel):
    metric: str
    source: str | None = None
    operator: str
    threshold: float
    aggregation: str


class AlertRuleEvaluationObservedResponse(BaseModel):
    value: float
    sample_count: int
    aggregation: str
    unit: str | None


class AlertRuleEvaluationResponse(BaseModel):
    project_id: int
    rule_id: int
    status: str
    signal: AlertRuleSignal
    severity: AlertRuleSeverity
    checked_at: datetime
    window: AlertRuleEvaluationWindowResponse
    condition: AlertRuleEvaluationConditionResponse
    observed: AlertRuleEvaluationObservedResponse | None
    message: str
