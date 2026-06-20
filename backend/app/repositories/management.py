from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.management import EnvironmentModel, ProjectModel, ServiceModel
from app.schemas.management import ResourceStatus
from app.services.errors import (
    DuplicateResourceError,
    ResourceConflictError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)


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


class ManagementRepository(Protocol):
    def list_projects(self) -> list[ProjectRecord]: ...

    def get_project(self, project_id: int) -> ProjectRecord | None: ...

    def create_project(
        self,
        *,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> ProjectRecord: ...

    def list_environments(self, project_id: int | None = None) -> list[EnvironmentRecord]: ...

    def get_environment(self, environment_id: int) -> EnvironmentRecord | None: ...

    def create_environment(
        self,
        *,
        project_id: int,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> EnvironmentRecord: ...

    def list_services(
        self,
        *,
        project_id: int | None = None,
        environment_id: int | None = None,
    ) -> list[ServiceRecord]: ...

    def create_service(
        self,
        *,
        project_id: int,
        environment_id: int,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> ServiceRecord: ...


def _project_record(model: ProjectModel) -> ProjectRecord:
    return ProjectRecord(
        id=model.id,
        name=model.name,
        key=model.key,
        description=model.description,
        status=ResourceStatus(model.status),
        created_at=model.created_at,
    )


def _environment_record(model: EnvironmentModel) -> EnvironmentRecord:
    return EnvironmentRecord(
        id=model.id,
        project_id=model.project_id,
        name=model.name,
        key=model.key,
        description=model.description,
        status=ResourceStatus(model.status),
        created_at=model.created_at,
    )


def _service_record(model: ServiceModel) -> ServiceRecord:
    return ServiceRecord(
        id=model.id,
        project_id=model.project_id,
        environment_id=model.environment_id,
        name=model.name,
        key=model.key,
        description=model.description,
        status=ResourceStatus(model.status),
        created_at=model.created_at,
    )


def _integrity_error_code(error: IntegrityError) -> int | None:
    orig = error.orig
    args = getattr(orig, "args", ())
    if args and isinstance(args[0], int):
        return args[0]
    return None


def _integrity_error_text(error: IntegrityError) -> str:
    orig = error.orig
    args = getattr(orig, "args", ())
    parts = [str(part) for part in args]
    parts.append(str(error))
    return " ".join(parts).lower()


def _matches_any(error: IntegrityError, signatures: tuple[str, ...]) -> bool:
    text = _integrity_error_text(error)
    return any(signature.lower() in text for signature in signatures)


def _is_unique_violation(error: IntegrityError) -> bool:
    return _integrity_error_code(error) == 1062 or _matches_any(
        error,
        (
            "unique constraint failed",
            "duplicate entry",
            "duplicate key",
        ),
    )


def _is_foreign_key_violation(error: IntegrityError) -> bool:
    return _integrity_error_code(error) in {1451, 1452} or _matches_any(
        error,
        (
            "foreign key constraint failed",
            "foreign key constraint fails",
            "foreign key violation",
        ),
    )


def _is_constraint(error: IntegrityError, signatures: tuple[str, ...]) -> bool:
    return _matches_any(error, signatures)


def _project_integrity_error(
    error: IntegrityError,
) -> DuplicateResourceError | ResourceIntegrityError:
    if _is_unique_violation(error) and _is_constraint(
        error,
        (
            "uq_management_projects_key",
            "management_projects.key",
        ),
    ):
        return DuplicateResourceError("项目 key 已存在")
    return ResourceIntegrityError("管理资源完整性约束错误")


def _environment_integrity_error(
    error: IntegrityError,
    *,
    session: Session,
    project_id: int,
) -> DuplicateResourceError | ResourceNotFoundError | ResourceIntegrityError:
    if _is_unique_violation(error) and _is_constraint(
        error,
        (
            "uq_management_environments_project_key",
            "management_environments.project_id, management_environments.key",
        ),
    ):
        return DuplicateResourceError("同一项目下环境 key 已存在")
    if _is_foreign_key_violation(error):
        if session.get(ProjectModel, project_id) is None:
            return ResourceNotFoundError("项目不存在")
        if _is_constraint(error, ("fk_management_environments_project_id",)):
            return ResourceNotFoundError("项目不存在")
    return ResourceIntegrityError("管理资源完整性约束错误")


def _service_integrity_error(
    error: IntegrityError,
    *,
    session: Session,
    project_id: int,
    environment_id: int,
) -> (
    DuplicateResourceError | ResourceNotFoundError | ResourceConflictError | ResourceIntegrityError
):
    if _is_unique_violation(error) and _is_constraint(
        error,
        (
            "uq_management_services_environment_key",
            "management_services.environment_id, management_services.key",
        ),
    ):
        return DuplicateResourceError("同一环境下服务 key 已存在")
    if _is_foreign_key_violation(error) and _is_constraint(
        error,
        ("fk_management_services_project_id",),
    ):
        return ResourceNotFoundError("项目不存在")
    if _is_foreign_key_violation(error) and _is_constraint(
        error,
        ("fk_management_services_environment_id",),
    ):
        return ResourceNotFoundError("环境不存在")
    if _is_foreign_key_violation(error):
        if session.get(ProjectModel, project_id) is None:
            return ResourceNotFoundError("项目不存在")
        if session.get(EnvironmentModel, environment_id) is None:
            return ResourceNotFoundError("环境不存在")
        return ResourceConflictError("服务 project_id 必须与环境所属项目一致")
    return ResourceIntegrityError("管理资源完整性约束错误")


class SqlAlchemyManagementRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_projects(self) -> list[ProjectRecord]:
        projects = self._session.scalars(select(ProjectModel).order_by(ProjectModel.id)).all()
        return [_project_record(project) for project in projects]

    def get_project(self, project_id: int) -> ProjectRecord | None:
        project = self._session.get(ProjectModel, project_id)
        if project is None:
            return None
        return _project_record(project)

    def create_project(
        self,
        *,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> ProjectRecord:
        project = ProjectModel(
            name=name,
            key=key,
            description=description,
            status=status.value,
        )
        self._session.add(project)
        try:
            self._session.commit()
        except IntegrityError as error:
            self._session.rollback()
            raise _project_integrity_error(error) from error
        self._session.refresh(project)
        return _project_record(project)

    def list_environments(self, project_id: int | None = None) -> list[EnvironmentRecord]:
        statement = select(EnvironmentModel).order_by(EnvironmentModel.id)
        if project_id is not None:
            statement = statement.where(EnvironmentModel.project_id == project_id)
        environments = self._session.scalars(statement).all()
        return [_environment_record(environment) for environment in environments]

    def get_environment(self, environment_id: int) -> EnvironmentRecord | None:
        environment = self._session.get(EnvironmentModel, environment_id)
        if environment is None:
            return None
        return _environment_record(environment)

    def create_environment(
        self,
        *,
        project_id: int,
        name: str,
        key: str,
        description: str | None,
        status: ResourceStatus,
    ) -> EnvironmentRecord:
        environment = EnvironmentModel(
            project_id=project_id,
            name=name,
            key=key,
            description=description,
            status=status.value,
        )
        self._session.add(environment)
        try:
            self._session.commit()
        except IntegrityError as error:
            self._session.rollback()
            raise _environment_integrity_error(
                error,
                session=self._session,
                project_id=project_id,
            ) from error
        self._session.refresh(environment)
        return _environment_record(environment)

    def list_services(
        self,
        *,
        project_id: int | None = None,
        environment_id: int | None = None,
    ) -> list[ServiceRecord]:
        statement = select(ServiceModel).order_by(ServiceModel.id)
        if project_id is not None:
            statement = statement.where(ServiceModel.project_id == project_id)
        if environment_id is not None:
            statement = statement.where(ServiceModel.environment_id == environment_id)
        services = self._session.scalars(statement).all()
        return [_service_record(service) for service in services]

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
        service = ServiceModel(
            project_id=project_id,
            environment_id=environment_id,
            name=name,
            key=key,
            description=description,
            status=status.value,
        )
        self._session.add(service)
        try:
            self._session.commit()
        except IntegrityError as error:
            self._session.rollback()
            raise _service_integrity_error(
                error,
                session=self._session,
                project_id=project_id,
                environment_id=environment_id,
            ) from error
        self._session.refresh(service)
        return _service_record(service)


class InMemoryManagementRepository:
    """用于不连接数据库的局部单元测试。默认 API 路径使用 SQLAlchemy repository。"""

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
        environments: Iterable[EnvironmentRecord] = self._environments.values()
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
        services: Iterable[ServiceRecord] = self._services.values()
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
