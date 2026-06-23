from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.dashboard import DashboardModel
from app.models.management import ProjectModel
from app.repositories.management import _is_constraint, _is_foreign_key_violation
from app.repositories.unit_of_work import flush_or_commit
from app.services.errors import ResourceIntegrityError, ResourceNotFoundError

DashboardJson = dict[str, Any] | list[Any]


@dataclass(frozen=True)
class DashboardRecord:
    id: int
    project_id: int
    name: str
    description: str | None
    layout: DashboardJson
    config: DashboardJson
    created_by_user_id: int
    updated_by_user_id: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class DashboardPage:
    items: list[DashboardRecord]
    total: int


class DashboardRepository(Protocol):
    def list_dashboards(
        self,
        *,
        project_id: int | None,
        project_ids: set[int] | None,
        limit: int,
        offset: int,
    ) -> DashboardPage: ...

    def get_dashboard(self, dashboard_id: int) -> DashboardRecord | None: ...

    def get_project_dashboard(
        self,
        *,
        project_id: int,
        dashboard_id: int,
    ) -> DashboardRecord | None: ...

    def create_dashboard(
        self,
        *,
        project_id: int,
        name: str,
        description: str | None,
        layout: DashboardJson,
        config: DashboardJson,
        created_by_user_id: int,
    ) -> DashboardRecord: ...

    def update_dashboard(
        self,
        *,
        dashboard_id: int,
        name: str | None = None,
        description: str | None = None,
        layout: DashboardJson | None = None,
        config: DashboardJson | None = None,
        updated_by_user_id: int,
        update_description: bool = False,
    ) -> DashboardRecord: ...

    def delete_dashboard(self, dashboard_id: int) -> bool: ...


def _dashboard_record(model: DashboardModel) -> DashboardRecord:
    return DashboardRecord(
        id=model.id,
        project_id=model.project_id,
        name=model.name,
        description=model.description,
        layout=model.layout,
        config=model.config,
        created_by_user_id=model.created_by_user_id,
        updated_by_user_id=model.updated_by_user_id,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _dashboard_integrity_error(
    error: IntegrityError,
    *,
    session: Session,
    project_id: int | None,
) -> ResourceNotFoundError | ResourceIntegrityError:
    if _is_foreign_key_violation(error):
        if project_id is not None and session.get(ProjectModel, project_id) is None:
            return ResourceNotFoundError("项目不存在")
        if _is_constraint(error, ("fk_dashboards_project_id",)):
            return ResourceNotFoundError("项目不存在")
    return ResourceIntegrityError("仪表盘完整性约束错误")


class SqlAlchemyDashboardRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_dashboards(
        self,
        *,
        project_id: int | None,
        project_ids: set[int] | None,
        limit: int,
        offset: int,
    ) -> DashboardPage:
        if project_ids is not None and not project_ids:
            return DashboardPage(items=[], total=0)

        statement: Select[tuple[DashboardModel]] = select(DashboardModel)
        count_statement: Select[tuple[int]] = select(func.count()).select_from(DashboardModel)
        if project_id is not None:
            statement = statement.where(DashboardModel.project_id == project_id)
            count_statement = count_statement.where(DashboardModel.project_id == project_id)
        if project_ids is not None:
            statement = statement.where(DashboardModel.project_id.in_(project_ids))
            count_statement = count_statement.where(DashboardModel.project_id.in_(project_ids))

        total = self._session.scalar(count_statement) or 0
        statement = (
            statement.order_by(DashboardModel.updated_at.desc(), DashboardModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
        dashboards = self._session.scalars(statement).all()
        return DashboardPage(
            items=[_dashboard_record(dashboard) for dashboard in dashboards],
            total=total,
        )

    def get_dashboard(self, dashboard_id: int) -> DashboardRecord | None:
        dashboard = self._session.get(DashboardModel, dashboard_id)
        if dashboard is None:
            return None
        return _dashboard_record(dashboard)

    def get_project_dashboard(
        self,
        *,
        project_id: int,
        dashboard_id: int,
    ) -> DashboardRecord | None:
        dashboard = self._session.scalar(
            select(DashboardModel).where(
                DashboardModel.id == dashboard_id,
                DashboardModel.project_id == project_id,
            )
        )
        if dashboard is None:
            return None
        return _dashboard_record(dashboard)

    def create_dashboard(
        self,
        *,
        project_id: int,
        name: str,
        description: str | None,
        layout: DashboardJson,
        config: DashboardJson,
        created_by_user_id: int,
    ) -> DashboardRecord:
        dashboard = DashboardModel(
            project_id=project_id,
            name=name,
            description=description,
            layout=layout,
            config=config,
            created_by_user_id=created_by_user_id,
            updated_by_user_id=created_by_user_id,
        )
        self._session.add(dashboard)
        try:
            flush_or_commit(self._session)
        except IntegrityError as error:
            self._session.rollback()
            raise _dashboard_integrity_error(
                error,
                session=self._session,
                project_id=project_id,
            ) from error
        self._session.refresh(dashboard)
        return _dashboard_record(dashboard)

    def update_dashboard(
        self,
        *,
        dashboard_id: int,
        name: str | None = None,
        description: str | None = None,
        layout: DashboardJson | None = None,
        config: DashboardJson | None = None,
        updated_by_user_id: int,
        update_description: bool = False,
    ) -> DashboardRecord:
        dashboard = self._session.get(DashboardModel, dashboard_id)
        if dashboard is None:
            raise ResourceNotFoundError("仪表盘不存在")

        if name is not None:
            dashboard.name = name
        if update_description:
            dashboard.description = description
        if layout is not None:
            dashboard.layout = layout
        if config is not None:
            dashboard.config = config
        dashboard.updated_by_user_id = updated_by_user_id

        try:
            flush_or_commit(self._session)
        except IntegrityError as error:
            self._session.rollback()
            raise _dashboard_integrity_error(
                error,
                session=self._session,
                project_id=dashboard.project_id,
            ) from error
        self._session.refresh(dashboard)
        return _dashboard_record(dashboard)

    def delete_dashboard(self, dashboard_id: int) -> bool:
        dashboard = self._session.get(DashboardModel, dashboard_id)
        if dashboard is None:
            return False
        self._session.delete(dashboard)
        flush_or_commit(self._session)
        return True
