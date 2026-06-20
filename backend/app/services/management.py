from __future__ import annotations

from app.repositories.management import (
    EnvironmentRecord,
    ManagementRepository,
    ProjectRecord,
    ServiceRecord,
)
from app.schemas.management import EnvironmentCreate, ProjectCreate, ServiceCreate
from app.services.errors import ResourceConflictError, ResourceNotFoundError


class ManagementService:
    def __init__(self, repository: ManagementRepository) -> None:
        self._repository = repository

    def list_projects(self) -> list[ProjectRecord]:
        return self._repository.list_projects()

    def create_project(self, payload: ProjectCreate) -> ProjectRecord:
        return self._repository.create_project(**payload.model_dump())

    def list_environments(self, project_id: int | None = None) -> list[EnvironmentRecord]:
        return self._repository.list_environments(project_id=project_id)

    def create_environment(self, payload: EnvironmentCreate) -> EnvironmentRecord:
        if self._repository.get_project(payload.project_id) is None:
            raise ResourceNotFoundError("项目不存在")

        return self._repository.create_environment(**payload.model_dump())

    def list_services(
        self,
        *,
        project_id: int | None = None,
        environment_id: int | None = None,
    ) -> list[ServiceRecord]:
        return self._repository.list_services(
            project_id=project_id,
            environment_id=environment_id,
        )

    def create_service(self, payload: ServiceCreate) -> ServiceRecord:
        if self._repository.get_project(payload.project_id) is None:
            raise ResourceNotFoundError("项目不存在")

        environment = self._repository.get_environment(payload.environment_id)
        if environment is None:
            raise ResourceNotFoundError("环境不存在")

        if environment.project_id != payload.project_id:
            raise ResourceConflictError("服务 project_id 必须与环境所属项目一致")

        return self._repository.create_service(**payload.model_dump())
