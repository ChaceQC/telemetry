from __future__ import annotations

from app.repositories.auth import UserRecord
from app.repositories.management import (
    EnvironmentRecord,
    ManagementRepository,
    ProjectRecord,
    ServiceRecord,
)
from app.schemas.management import EnvironmentCreate, ProjectCreate, ServiceCreate
from app.schemas.permissions import ProjectRole
from app.services.errors import ResourceConflictError, ResourceNotFoundError
from app.services.permissions import PermissionService


class ManagementService:
    def __init__(
        self,
        repository: ManagementRepository,
        permission_service: PermissionService,
    ) -> None:
        self._repository = repository
        self._permission_service = permission_service

    def list_projects(self, user: UserRecord) -> list[ProjectRecord]:
        project_ids = self._permission_service.list_accessible_project_ids(user)
        return self._repository.list_projects(
            project_ids=None if project_ids is None else set(project_ids)
        )

    def create_project(self, payload: ProjectCreate, user: UserRecord) -> ProjectRecord:
        with self._repository.transaction():
            project = self._repository.create_project(**payload.model_dump())
            self._permission_service.grant_project_role(
                project_id=project.id,
                user_id=user.id,
                role=ProjectRole.admin,
            )
        return project

    def list_environments(
        self,
        user: UserRecord,
        project_id: int | None = None,
    ) -> list[EnvironmentRecord]:
        if project_id is not None:
            self._ensure_project_exists(project_id)
            self._permission_service.ensure_project_role(
                user=user,
                project_id=project_id,
                minimum_role=ProjectRole.viewer,
            )
            return self._repository.list_environments(project_id=project_id)

        project_ids = self._permission_service.list_accessible_project_ids(user)
        return self._repository.list_environments(
            project_ids=None if project_ids is None else set(project_ids)
        )

    def create_environment(self, payload: EnvironmentCreate, user: UserRecord) -> EnvironmentRecord:
        self._ensure_project_exists(payload.project_id)
        self._permission_service.ensure_project_role(
            user=user,
            project_id=payload.project_id,
            minimum_role=ProjectRole.editor,
        )

        return self._repository.create_environment(**payload.model_dump())

    def list_services(
        self,
        user: UserRecord,
        *,
        project_id: int | None = None,
        environment_id: int | None = None,
    ) -> list[ServiceRecord]:
        if project_id is not None:
            self._ensure_project_exists(project_id)
            self._permission_service.ensure_project_role(
                user=user,
                project_id=project_id,
                minimum_role=ProjectRole.viewer,
            )
            return self._repository.list_services(
                project_id=project_id,
                environment_id=environment_id,
            )

        if environment_id is not None:
            environment = self._repository.get_environment(environment_id)
            if environment is None:
                raise ResourceNotFoundError("环境不存在")
            self._permission_service.ensure_project_role(
                user=user,
                project_id=environment.project_id,
                minimum_role=ProjectRole.viewer,
            )
            return self._repository.list_services(environment_id=environment_id)

        project_ids = self._permission_service.list_accessible_project_ids(user)
        return self._repository.list_services(
            project_ids=None if project_ids is None else set(project_ids),
        )

    def create_service(self, payload: ServiceCreate, user: UserRecord) -> ServiceRecord:
        self._ensure_project_exists(payload.project_id)
        self._permission_service.ensure_project_role(
            user=user,
            project_id=payload.project_id,
            minimum_role=ProjectRole.editor,
        )

        environment = self._repository.get_environment_for_project(
            environment_id=payload.environment_id,
            project_id=payload.project_id,
        )
        if environment is None:
            environment = self._repository.get_environment(payload.environment_id)
            if environment is not None and self._permission_service.has_project_role(
                user=user,
                project_id=environment.project_id,
                minimum_role=ProjectRole.viewer,
            ):
                raise ResourceConflictError("服务 project_id 必须与环境所属项目一致")
            raise ResourceNotFoundError("环境不存在")

        return self._repository.create_service(**payload.model_dump())

    def _ensure_project_exists(self, project_id: int) -> None:
        if self._repository.get_project(project_id) is None:
            raise ResourceNotFoundError("项目不存在")
