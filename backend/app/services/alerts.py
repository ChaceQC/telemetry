from __future__ import annotations

from app.repositories.alerts import AlertRulePage, AlertRuleRecord, AlertRuleRepository
from app.repositories.auth import UserRecord
from app.repositories.management import ManagementRepository
from app.schemas.alerts import AlertRuleCreate, AlertRuleSeverity, AlertRuleSignal, AlertRuleUpdate
from app.schemas.permissions import ProjectRole, role_includes
from app.services.errors import ResourceForbiddenError, ResourceNotFoundError
from app.services.permissions import PermissionService


class AlertRuleService:
    def __init__(
        self,
        repository: AlertRuleRepository,
        management_repository: ManagementRepository,
        permission_service: PermissionService,
    ) -> None:
        self._repository = repository
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
