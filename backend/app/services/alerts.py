from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import isfinite
from numbers import Real

from app.repositories.alerts import AlertRulePage, AlertRuleRecord, AlertRuleRepository
from app.repositories.auth import UserRecord
from app.repositories.management import ManagementRepository
from app.repositories.query import MetricAggregateRecord, QueryRepository
from app.schemas.alerts import (
    MAX_ALERT_EVALUATION_SECONDS,
    MIN_ALERT_EVALUATION_SECONDS,
    AlertRuleCreate,
    AlertRuleJson,
    AlertRuleSeverity,
    AlertRuleSignal,
    AlertRuleUpdate,
)
from app.schemas.permissions import ProjectRole, role_includes
from app.services.errors import ResourceForbiddenError, ResourceNotFoundError
from app.services.permissions import PermissionService

ALERT_METRIC_OPERATORS = frozenset({"gt", "gte", "lt", "lte", "eq", "ne"})
ALERT_METRIC_AGGREGATIONS = frozenset({"avg", "sum", "min", "max", "count"})
ALERT_OPERATOR_SYMBOLS = {
    "gt": ">",
    "gte": ">=",
    "lt": "<",
    "lte": "<=",
    "eq": "==",
    "ne": "!=",
}


class AlertRuleEvaluationError(Exception):
    """告警规则当前不满足手动评估执行语义。"""


@dataclass(frozen=True)
class AlertMetricCondition:
    metric: str
    source: str | None
    operator: str
    threshold: float
    aggregation: str


@dataclass(frozen=True)
class AlertRuleEvaluationWindow:
    start: datetime
    end: datetime
    window_seconds: int
    interval_seconds: int


@dataclass(frozen=True)
class AlertRuleEvaluationObserved:
    value: float
    sample_count: int
    aggregation: str
    unit: str | None


@dataclass(frozen=True)
class AlertRuleEvaluationResult:
    project_id: int
    rule_id: int
    status: str
    signal: AlertRuleSignal
    severity: AlertRuleSeverity
    checked_at: datetime
    window: AlertRuleEvaluationWindow
    condition: AlertMetricCondition
    observed: AlertRuleEvaluationObserved | None
    message: str


class AlertRuleService:
    def __init__(
        self,
        repository: AlertRuleRepository,
        query_repository: QueryRepository,
        management_repository: ManagementRepository,
        permission_service: PermissionService,
    ) -> None:
        self._repository = repository
        self._query_repository = query_repository
        self._management_repository = management_repository
        self._permission_service = permission_service

    def list_alert_rules(
        self,
        *,
        user: UserRecord,
        project_id: int | None = None,
        severity: AlertRuleSeverity | None = None,
        signal: AlertRuleSignal | None = None,
        enabled: bool | None = None,
        limit: int,
        offset: int,
    ) -> AlertRulePage:
        if project_id is not None:
            self._ensure_project_role_hidden(
                user=user,
                project_id=project_id,
                minimum_role=ProjectRole.viewer,
            )
            return self._repository.list_alert_rules(
                project_id=project_id,
                project_ids=None,
                severity=severity,
                signal=signal,
                enabled=enabled,
                limit=limit,
                offset=offset,
            )

        project_ids = self._permission_service.list_accessible_project_ids(user)
        return self._repository.list_alert_rules(
            project_id=None,
            project_ids=None if project_ids is None else set(project_ids),
            severity=severity,
            signal=signal,
            enabled=enabled,
            limit=limit,
            offset=offset,
        )

    def get_alert_rule(
        self,
        *,
        user: UserRecord,
        project_id: int,
        rule_id: int,
    ) -> AlertRuleRecord:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.viewer,
        )
        rule = self._repository.get_project_alert_rule(
            project_id=project_id,
            rule_id=rule_id,
        )
        if rule is None:
            raise ResourceNotFoundError("告警规则不存在")
        return rule

    def create_alert_rule(
        self,
        *,
        payload: AlertRuleCreate,
        user: UserRecord,
    ) -> AlertRuleRecord:
        self._ensure_project_role_hidden(
            user=user,
            project_id=payload.project_id,
            minimum_role=ProjectRole.editor,
        )
        return self._repository.create_alert_rule(
            project_id=payload.project_id,
            name=payload.name,
            description=payload.description,
            enabled=payload.enabled,
            severity=payload.severity,
            signal=payload.signal,
            condition=payload.condition,
            evaluation=payload.evaluation,
            created_by_user_id=user.id,
        )

    def update_alert_rule(
        self,
        *,
        user: UserRecord,
        project_id: int,
        rule_id: int,
        payload: AlertRuleUpdate,
    ) -> AlertRuleRecord:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.editor,
        )
        if (
            self._repository.get_project_alert_rule(
                project_id=project_id,
                rule_id=rule_id,
            )
            is None
        ):
            raise ResourceNotFoundError("告警规则不存在")

        return self._repository.update_alert_rule(
            rule_id=rule_id,
            updated_by_user_id=user.id,
            name=payload.name,
            description=payload.description,
            enabled=payload.enabled,
            severity=payload.severity,
            signal=payload.signal,
            condition=payload.condition,
            evaluation=payload.evaluation,
            update_description="description" in payload.model_fields_set,
        )

    def delete_alert_rule(
        self,
        *,
        user: UserRecord,
        project_id: int,
        rule_id: int,
    ) -> None:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.editor,
        )
        rule = self._repository.get_project_alert_rule(project_id=project_id, rule_id=rule_id)
        if rule is None:
            raise ResourceNotFoundError("告警规则不存在")
        if not self._repository.delete_alert_rule(rule_id):
            raise ResourceNotFoundError("告警规则不存在")

    def evaluate_alert_rule(
        self,
        *,
        user: UserRecord,
        project_id: int,
        rule_id: int,
    ) -> AlertRuleEvaluationResult:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.viewer,
        )
        rule = self._repository.get_project_alert_rule(
            project_id=project_id,
            rule_id=rule_id,
        )
        if rule is None:
            raise ResourceNotFoundError("告警规则不存在")
        if rule.signal != AlertRuleSignal.metrics:
            raise AlertRuleEvaluationError("仅支持 metrics 告警规则评估")

        condition = _normalize_metric_condition(rule.condition)
        window_seconds, interval_seconds = _normalize_evaluation(rule.evaluation)
        checked_at = datetime.now(UTC)
        window = AlertRuleEvaluationWindow(
            start=checked_at - timedelta(seconds=window_seconds),
            end=checked_at,
            window_seconds=window_seconds,
            interval_seconds=interval_seconds,
        )

        if not rule.enabled:
            return AlertRuleEvaluationResult(
                project_id=rule.project_id,
                rule_id=rule.id,
                status="disabled",
                signal=rule.signal,
                severity=rule.severity,
                checked_at=checked_at,
                window=window,
                condition=condition,
                observed=None,
                message=f"alert rule {rule.id} is disabled",
            )

        aggregate = self._query_repository.aggregate_metric_window(
            project_id=project_id,
            name=condition.metric,
            source=condition.source,
            occurred_from=window.start,
            occurred_to=window.end,
            aggregation=condition.aggregation,
        )
        if aggregate is None:
            return AlertRuleEvaluationResult(
                project_id=rule.project_id,
                rule_id=rule.id,
                status="no_data",
                signal=rule.signal,
                severity=rule.severity,
                checked_at=checked_at,
                window=window,
                condition=condition,
                observed=None,
                message=(
                    f"metric {condition.metric} {condition.aggregation} "
                    f"has no data in the evaluation window"
                ),
            )

        observed = _observed_from_aggregate(aggregate)
        is_firing = _compare_metric_threshold(
            observed.value,
            operator=condition.operator,
            threshold=condition.threshold,
        )
        symbol = ALERT_OPERATOR_SYMBOLS[condition.operator]
        message = (
            f"metric {condition.metric} {condition.aggregation} "
            f"{_format_number(observed.value)} {symbol} {_format_number(condition.threshold)}"
        )
        if not is_firing:
            message = (
                f"metric {condition.metric} {condition.aggregation} "
                f"{_format_number(observed.value)} not {symbol} "
                f"{_format_number(condition.threshold)}"
            )
        return AlertRuleEvaluationResult(
            project_id=rule.project_id,
            rule_id=rule.id,
            status="firing" if is_firing else "ok",
            signal=rule.signal,
            severity=rule.severity,
            checked_at=checked_at,
            window=window,
            condition=condition,
            observed=observed,
            message=message,
        )

    def _ensure_project_role_hidden(
        self,
        *,
        user: UserRecord,
        project_id: int,
        minimum_role: ProjectRole,
    ) -> None:
        if user.is_superuser:
            if self._management_repository.get_project(project_id) is None:
                raise ResourceNotFoundError("项目不存在")
            return

        role = self._permission_service.get_project_role(user=user, project_id=project_id)
        if role is None:
            raise ResourceNotFoundError("项目不存在")
        if self._management_repository.get_project(project_id) is None:
            raise ResourceNotFoundError("项目不存在")
        if not role_includes(role, minimum_role):
            raise ResourceForbiddenError("无项目权限")


def _normalize_metric_condition(condition: AlertRuleJson) -> AlertMetricCondition:
    metric = _required_string(
        condition,
        key="metric",
        field_path="condition.metric",
        max_length=128,
    )
    source = _optional_string(
        condition,
        key="source",
        field_path="condition.source",
        max_length=128,
    )
    operator = _required_string(
        condition,
        key="operator",
        field_path="condition.operator",
        max_length=128,
    )
    if operator not in ALERT_METRIC_OPERATORS:
        raise AlertRuleEvaluationError("condition.operator 必须是 gt/gte/lt/lte/eq/ne 之一")

    if "threshold" not in condition:
        raise AlertRuleEvaluationError("condition.threshold 为必填字段")
    threshold_raw = condition["threshold"]
    if isinstance(threshold_raw, bool) or not isinstance(threshold_raw, Real):
        raise AlertRuleEvaluationError("condition.threshold 必须是有限 JSON number")
    threshold = float(threshold_raw)
    if not isfinite(threshold):
        raise AlertRuleEvaluationError("condition.threshold 必须是有限 JSON number")

    aggregation = condition.get("aggregation", "avg")
    if not isinstance(aggregation, str):
        raise AlertRuleEvaluationError("condition.aggregation 必须是字符串")
    aggregation = aggregation.strip()
    if aggregation not in ALERT_METRIC_AGGREGATIONS:
        raise AlertRuleEvaluationError("condition.aggregation 必须是 avg/sum/min/max/count 之一")

    return AlertMetricCondition(
        metric=metric,
        source=source,
        operator=operator,
        threshold=threshold,
        aggregation=aggregation,
    )


def _normalize_evaluation(evaluation: AlertRuleJson) -> tuple[int, int]:
    return (
        _required_evaluation_seconds(evaluation, "window_seconds"),
        _required_evaluation_seconds(evaluation, "interval_seconds"),
    )


def _required_evaluation_seconds(evaluation: AlertRuleJson, key: str) -> int:
    if key not in evaluation:
        raise AlertRuleEvaluationError(f"evaluation.{key} 为必填字段")
    value = evaluation[key]
    if isinstance(value, bool) or not isinstance(value, int):
        raise AlertRuleEvaluationError(f"evaluation.{key} 必须是整数")
    if value < MIN_ALERT_EVALUATION_SECONDS:
        raise AlertRuleEvaluationError(f"evaluation.{key} 不能小于 {MIN_ALERT_EVALUATION_SECONDS}")
    if value > MAX_ALERT_EVALUATION_SECONDS:
        raise AlertRuleEvaluationError(f"evaluation.{key} 不能超过 {MAX_ALERT_EVALUATION_SECONDS}")
    return value


def _required_string(
    mapping: AlertRuleJson,
    *,
    key: str,
    field_path: str,
    max_length: int,
) -> str:
    if key not in mapping:
        raise AlertRuleEvaluationError(f"{field_path} 为必填字段")
    value = mapping[key]
    if not isinstance(value, str):
        raise AlertRuleEvaluationError(f"{field_path} 必须是字符串")
    normalized = value.strip()
    if not normalized:
        raise AlertRuleEvaluationError(f"{field_path} 不能为空")
    if len(normalized) > max_length:
        raise AlertRuleEvaluationError(f"{field_path} 不能超过 {max_length} 字符")
    return normalized


def _optional_string(
    mapping: AlertRuleJson,
    *,
    key: str,
    field_path: str,
    max_length: int,
) -> str | None:
    if key not in mapping:
        return None
    return _required_string(
        mapping,
        key=key,
        field_path=field_path,
        max_length=max_length,
    )


def _observed_from_aggregate(aggregate: MetricAggregateRecord) -> AlertRuleEvaluationObserved:
    return AlertRuleEvaluationObserved(
        value=aggregate.value,
        sample_count=aggregate.sample_count,
        aggregation=aggregate.aggregation,
        unit=aggregate.unit,
    )


def _compare_metric_threshold(value: float, *, operator: str, threshold: float) -> bool:
    if operator == "gt":
        return value > threshold
    if operator == "gte":
        return value >= threshold
    if operator == "lt":
        return value < threshold
    if operator == "lte":
        return value <= threshold
    if operator == "eq":
        return value == threshold
    if operator == "ne":
        return value != threshold
    raise AlertRuleEvaluationError("condition.operator 必须是 gt/gte/lt/lte/eq/ne 之一")


def _format_number(value: float) -> str:
    return f"{value:g}"
