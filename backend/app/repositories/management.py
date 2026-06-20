from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.schemas.management import ResourceStatus
from app.services.errors import DuplicateResourceError


@dataclass(frozen=True)
class ProjectRecord:
    id: int
    name: str
    key: str
    description: str | None
    status: ResourceStatus
    created_at: datetime


@dataclass(frozen=True)
class EnvironmentRecord:
    id: int
    project_id: int
    name: str
    key: str
    description: str | None
    status: ResourceStatus
    created_at: datetime


@dataclass(frozen=True)
class ServiceRecord:
    id: int
    project_id: int
    environment_id: int
    name: str
    key: str
    description: str | None
    status: ResourceStatus
    created_at: datetime


class InMemoryManagementRepository:
    """阶段 1 临时内存仓储；MySQL 接入后替换本类并保留 service/API 契约。"""

    def __init__(self) -> None:
        self._projects: dict[int, ProjectRecord] = {}
        self._project_keys: dict[str, int] = {}
        self._environments: dict[int, EnvironmentRecord] = {}
        self._environment_keys: dict[tuple[int, str], int] = {}
        self._services: dict[int, ServiceRecord] = {}
        self._service_keys: dict[tuple[int, str], int] = {}
        self._next_project_id = 1
        self._next_environment_id = 1
        self._next_service_id = 1

    def list_projects(self) -> list[ProjectRecord]:
        return sorted(self._projects.values(), key=lambda project: project.id)

    def get_project(self, project_id: int) -> ProjectRecord | None:
        return self._projects.get(project_id)

    def create_project(
        self,
        *,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> ProjectRecord:
        if key in self._project_keys:
            raise DuplicateResourceError("项目 key 已存在")

        record = ProjectRecord(
            id=self._next_project_id,
            name=name,
            key=key,
            description=description,
            status=status,
            created_at=datetime.now(UTC),
        )
        self._next_project_id += 1
        self._projects[record.id] = record
        self._project_keys[record.key] = record.id
        return record

    def list_environments(self, project_id: int | None = None) -> list[EnvironmentRecord]:
        environments = self._environments.values()
        if project_id is not None:
            environments = [
                environment for environment in environments if environment.project_id == project_id
            ]
        return sorted(environments, key=lambda environment: environment.id)

    def get_environment(self, environment_id: int) -> EnvironmentRecord | None:
        return self._environments.get(environment_id)

    def create_environment(
        self,
        *,
        project_id: int,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> EnvironmentRecord:
        scoped_key = (project_id, key)
        if scoped_key in self._environment_keys:
            raise DuplicateResourceError("同一项目下环境 key 已存在")

        record = EnvironmentRecord(
            id=self._next_environment_id,
            project_id=project_id,
            name=name,
            key=key,
            description=description,
            status=status,
            created_at=datetime.now(UTC),
        )
        self._next_environment_id += 1
        self._environments[record.id] = record
        self._environment_keys[scoped_key] = record.id
        return record

    def list_services(
        self,
        *,
        project_id: int | None = None,
        environment_id: int | None = None,
    ) -> list[ServiceRecord]:
        services = self._services.values()
        if project_id is not None:
            services = [service for service in services if service.project_id == project_id]
        if environment_id is not None:
            services = [service for service in services if service.environment_id == environment_id]
        return sorted(services, key=lambda service: service.id)

    def create_service(
        self,
        *,
        project_id: int,
        environment_id: int,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> ServiceRecord:
        scoped_key = (environment_id, key)
        if scoped_key in self._service_keys:
            raise DuplicateResourceError("同一环境下服务 key 已存在")

        record = ServiceRecord(
            id=self._next_service_id,
            project_id=project_id,
            environment_id=environment_id,
            name=name,
            key=key,
            description=description,
            status=status,
            created_at=datetime.now(UTC),
        )
        self._next_service_id += 1
        self._services[record.id] = record
        self._service_keys[scoped_key] = record.id
        return record
