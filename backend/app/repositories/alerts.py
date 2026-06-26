from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.alerts import AlertRuleModel
from app.models.management import ProjectModel
from app.repositories.management import _is_constraint, _is_foreign_key_violation
from app.repositories.unit_of_work import flush_or_commit
from app.schemas.alerts import AlertRuleSeverity, AlertRuleSignal
from app.services.errors import (
    DuplicateResourceError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)

AlertRuleJson = dict[str, Any]


@dataclass(frozen=True)
class AlertRuleRecord:
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


@dataclass(frozen=True)
class AlertRulePage:
    items: list[AlertRuleRecord]
    total: int


class AlertRuleRepository(Protocol):
    def list_alert_rules(
        self,
        *,
        project_id: int | None,
        project_ids: set[int] | None,
        severity: AlertRuleSeverity | None,
        signal: AlertRuleSignal | None,
        enabled: bool | None,
        limit: int,
        offset: int,
    ) -> AlertRulePage: ...

    def get_project_alert_rule(
        self,
        *,
        project_id: int,
        rule_id: int,
    ) -> AlertRuleRecord | None: ...

    def create_alert_rule(
        self,
        *,
        project_id: int,
        name: str,
        description: str | None,
        enabled: bool,
        severity: AlertRuleSeverity,
        signal: AlertRuleSignal,
        condition: AlertRuleJson,
        evaluation: AlertRuleJson,
        created_by_user_id: int,
    ) -> AlertRuleRecord: ...

    def update_alert_rule(
        self,
        *,
        rule_id: int,
        updated_by_user_id: int,
        name: str | None = None,
        description: str | None = None,
        enabled: bool | None = None,
        severity: AlertRuleSeverity | None = None,
        signal: AlertRuleSignal | None = None,
        condition: AlertRuleJson | None = None,
        evaluation: AlertRuleJson | None = None,
        update_description: bool = False,
    ) -> AlertRuleRecord: ...

    def delete_alert_rule(self, rule_id: int) -> bool: ...


def _alert_rule_record(model: AlertRuleModel) -> AlertRuleRecord:
    return AlertRuleRecord(
        id=model.id,
        project_id=model.project_id,
        name=model.name,
        description=model.description,
        enabled=model.enabled,
        severity=AlertRuleSeverity(model.severity),
        signal=AlertRuleSignal(model.signal),
        condition=model.condition,
        evaluation=model.evaluation,
        created_by_user_id=model.created_by_user_id,
        updated_by_user_id=model.updated_by_user_id,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _alert_rule_integrity_error(
    error: IntegrityError,
    *,
    session: Session,
    project_id: int | None,
) -> DuplicateResourceError | ResourceNotFoundError | ResourceIntegrityError:
    if _is_constraint(
        error,
        (
            "uq_alert_rules_project_name",
            "alert_rules.project_id, alert_rules.name",
        ),
    ):
        return DuplicateResourceError("同一项目下告警规则名称已存在")
    if _is_foreign_key_violation(error):
        if project_id is not None and session.get(ProjectModel, project_id) is None:
            return ResourceNotFoundError("项目不存在")
        if _is_constraint(error, ("fk_alert_rules_project_id",)):
            return ResourceNotFoundError("项目不存在")
    return ResourceIntegrityError("告警规则完整性约束错误")


class SqlAlchemyAlertRuleRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_alert_rules(
        self,
        *,
        project_id: int | None,
        project_ids: set[int] | None,
        severity: AlertRuleSeverity | None,
        signal: AlertRuleSignal | None,
        enabled: bool | None,
        limit: int,
        offset: int,
    ) -> AlertRulePage:
        if project_ids is not None and not project_ids:
            return AlertRulePage(items=[], total=0)

        statement: Select[tuple[AlertRuleModel]] = select(AlertRuleModel)
        count_statement: Select[tuple[int]] = select(func.count()).select_from(AlertRuleModel)
        statement, count_statement = self._apply_filters(
            statement=statement,
            count_statement=count_statement,
            project_id=project_id,
            project_ids=project_ids,
            severity=severity,
            signal=signal,
            enabled=enabled,
        )

        total = self._session.scalar(count_statement) or 0
        statement = (
            statement.order_by(AlertRuleModel.updated_at.desc(), AlertRuleModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rules = self._session.scalars(statement).all()
        return AlertRulePage(
            items=[_alert_rule_record(rule) for rule in rules],
            total=total,
        )

    def _apply_filters(
        self,
        *,
        statement: Select[tuple[AlertRuleModel]],
        count_statement: Select[tuple[int]],
        project_id: int | None,
        project_ids: set[int] | None,
        severity: AlertRuleSeverity | None,
        signal: AlertRuleSignal | None,
        enabled: bool | None,
    ) -> tuple[Select[tuple[AlertRuleModel]], Select[tuple[int]]]:
        if project_id is not None:
            statement = statement.where(AlertRuleModel.project_id == project_id)
            count_statement = count_statement.where(AlertRuleModel.project_id == project_id)
        if project_ids is not None:
            statement = statement.where(AlertRuleModel.project_id.in_(project_ids))
            count_statement = count_statement.where(AlertRuleModel.project_id.in_(project_ids))
        if severity is not None:
            statement = statement.where(AlertRuleModel.severity == severity.value)
            count_statement = count_statement.where(AlertRuleModel.severity == severity.value)
        if signal is not None:
            statement = statement.where(AlertRuleModel.signal == signal.value)
            count_statement = count_statement.where(AlertRuleModel.signal == signal.value)
        if enabled is not None:
            statement = statement.where(AlertRuleModel.enabled.is_(enabled))
            count_statement = count_statement.where(AlertRuleModel.enabled.is_(enabled))
        return statement, count_statement

    def get_project_alert_rule(
        self,
        *,
        project_id: int,
        rule_id: int,
    ) -> AlertRuleRecord | None:
        rule = self._session.scalar(
            select(AlertRuleModel).where(
                AlertRuleModel.id == rule_id,
                AlertRuleModel.project_id == project_id,
            )
        )
        if rule is None:
            return None
        return _alert_rule_record(rule)

    def create_alert_rule(
        self,
        *,
        project_id: int,
        name: str,
        description: str | None,
        enabled: bool,
        severity: AlertRuleSeverity,
        signal: AlertRuleSignal,
        condition: AlertRuleJson,
        evaluation: AlertRuleJson,
        created_by_user_id: int,
    ) -> AlertRuleRecord:
        rule = AlertRuleModel(
            project_id=project_id,
            name=name,
            description=description,
            enabled=enabled,
            severity=severity.value,
            signal=signal.value,
            condition=condition,
            evaluation=evaluation,
            created_by_user_id=created_by_user_id,
            updated_by_user_id=created_by_user_id,
        )
        self._session.add(rule)
        try:
            flush_or_commit(self._session)
        except IntegrityError as error:
            self._session.rollback()
            raise _alert_rule_integrity_error(
                error,
                session=self._session,
                project_id=project_id,
            ) from error
        self._session.refresh(rule)
        return _alert_rule_record(rule)

    def update_alert_rule(
        self,
        *,
        rule_id: int,
        updated_by_user_id: int,
        name: str | None = None,
        description: str | None = None,
        enabled: bool | None = None,
        severity: AlertRuleSeverity | None = None,
        signal: AlertRuleSignal | None = None,
        condition: AlertRuleJson | None = None,
        evaluation: AlertRuleJson | None = None,
        update_description: bool = False,
    ) -> AlertRuleRecord:
        rule = self._session.get(AlertRuleModel, rule_id)
        if rule is None:
            raise ResourceNotFoundError("告警规则不存在")

        if name is not None:
            rule.name = name
        if update_description:
            rule.description = description
        if enabled is not None:
            rule.enabled = enabled
        if severity is not None:
            rule.severity = severity.value
        if signal is not None:
            rule.signal = signal.value
        if condition is not None:
            rule.condition = condition
        if evaluation is not None:
            rule.evaluation = evaluation
        rule.updated_by_user_id = updated_by_user_id

        try:
            flush_or_commit(self._session)
        except IntegrityError as error:
            self._session.rollback()
            raise _alert_rule_integrity_error(
                error,
                session=self._session,
                project_id=rule.project_id,
            ) from error
        self._session.refresh(rule)
        return _alert_rule_record(rule)

    def delete_alert_rule(self, rule_id: int) -> bool:
        rule = self._session.get(AlertRuleModel, rule_id)
        if rule is None:
            return False
        self._session.delete(rule)
        flush_or_commit(self._session)
        return True
