from __future__ import annotations

from app.repositories.auth import UserRecord
from app.repositories.dashboard import DashboardPage, DashboardRecord, DashboardRepository
from app.repositories.management import ManagementRepository
from app.schemas.dashboard import DashboardCreate, DashboardCreateFromTemplate, DashboardUpdate
from app.schemas.permissions import ProjectRole, role_includes
from app.services.dashboard_templates import (
    DashboardTemplateRecord,
    get_builtin_dashboard_template,
    list_builtin_dashboard_templates,
)
from app.services.errors import ResourceForbiddenError, ResourceNotFoundError
from app.services.permissions import PermissionService


class DashboardService:
    def __init__(
        self,
        repository: DashboardRepository,
        management_repository: ManagementRepository,
        permission_service: PermissionService,
    ) -> None:
        self._repository = repository
        self._management_repository = management_repository
        self._permission_service = permission_service

    def list_dashboards(
        self,
        *,
        user: UserRecord,
        project_id: int | None = None,
        limit: int,
        offset: int,
    ) -> DashboardPage:
        if project_id is not None:
            self._ensure_project_role_hidden(
                user=user,
                project_id=project_id,
                minimum_role=ProjectRole.viewer,
            )
            return self._repository.list_dashboards(
                project_id=project_id,
                project_ids=None,
                limit=limit,
                offset=offset,
            )

        project_ids = self._permission_service.list_accessible_project_ids(user)
        return self._repository.list_dashboards(
            project_id=None,
            project_ids=None if project_ids is None else set(project_ids),
            limit=limit,
            offset=offset,
        )

    def get_dashboard(
        self,
        *,
        user: UserRecord,
        project_id: int,
        dashboard_id: int,
    ) -> DashboardRecord:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.viewer,
        )
        dashboard = self._repository.get_project_dashboard(
            project_id=project_id,
            dashboard_id=dashboard_id,
        )
        if dashboard is None:
            raise ResourceNotFoundError("仪表盘不存在")
        return dashboard

    def create_dashboard(self, *, payload: DashboardCreate, user: UserRecord) -> DashboardRecord:
        self._ensure_project_role_hidden(
            user=user,
            project_id=payload.project_id,
            minimum_role=ProjectRole.editor,
        )
        return self._repository.create_dashboard(
            project_id=payload.project_id,
            name=payload.name,
            description=payload.description,
            layout=payload.layout,
            config=payload.config,
            created_by_user_id=user.id,
        )

    def list_dashboard_templates(self) -> list[DashboardTemplateRecord]:
        return list_builtin_dashboard_templates()

    def get_dashboard_template(self, *, template_id: str) -> DashboardTemplateRecord:
        return get_builtin_dashboard_template(template_id)

    def create_dashboard_from_template(
        self,
        *,
        user: UserRecord,
        project_id: int,
        template_id: str,
        payload: DashboardCreateFromTemplate,
    ) -> DashboardRecord:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.editor,
        )
        template = get_builtin_dashboard_template(template_id)
        create_payload = DashboardCreate(
            project_id=project_id,
            name=payload.name or template.name,
            description=payload.description
            if payload.description is not None
            else template.description,
            layout=template.layout,
            config=template.config,
        )
        return self.create_dashboard(payload=create_payload, user=user)

    def update_dashboard(
        self,
        *,
        user: UserRecord,
        project_id: int,
        dashboard_id: int,
        payload: DashboardUpdate,
    ) -> DashboardRecord:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.editor,
        )
        if (
            self._repository.get_project_dashboard(
                project_id=project_id,
                dashboard_id=dashboard_id,
            )
            is None
        ):
            raise ResourceNotFoundError("仪表盘不存在")

        return self._repository.update_dashboard(
            dashboard_id=dashboard_id,
            name=payload.name,
            description=payload.description,
            layout=payload.layout,
            config=payload.config,
            updated_by_user_id=user.id,
            update_description="description" in payload.model_fields_set,
        )

    def delete_dashboard(
        self,
        *,
        user: UserRecord,
        project_id: int,
        dashboard_id: int,
    ) -> None:
        self._ensure_project_role_hidden(
            user=user,
            project_id=project_id,
            minimum_role=ProjectRole.editor,
        )
        dashboard = self._repository.get_project_dashboard(
            project_id=project_id,
            dashboard_id=dashboard_id,
        )
        if dashboard is None:
            raise ResourceNotFoundError("仪表盘不存在")
        if not self._repository.delete_dashboard(dashboard_id):
            raise ResourceNotFoundError("仪表盘不存在")

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
