from __future__ import annotations

from datetime import datetime

from app.repositories.auth import UserRecord
from app.repositories.query import EventQueryRecord, LogQueryRecord, QueryRepository
from app.services.errors import ResourceNotFoundError
from app.services.permissions import PermissionService


class QueryService:
    def __init__(
        self,
        repository: QueryRepository,
        permission_service: PermissionService,
    ) -> None:
        self._repository = repository
        self._permission_service = permission_service

    def list_events(
        self,
        *,
        user: UserRecord,
        project_id: int | None,
        event_type: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
    ) -> list[EventQueryRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)

        return self._repository.list_events(
            project_ids=accessible_project_ids,
            project_id=project_id,
            event_type=event_type,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit,
        )

    def list_logs(
        self,
        *,
        user: UserRecord,
        project_id: int | None,
        level: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
    ) -> list[LogQueryRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)

        return self._repository.list_logs(
            project_ids=accessible_project_ids,
            project_id=project_id,
            level=level,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit,
        )

    def _accessible_project_ids(
        self,
        user: UserRecord,
        project_id: int | None,
    ) -> list[int] | None:
        accessible_project_ids = self._permission_service.list_accessible_project_ids(user)
        if (
            project_id is not None
            and accessible_project_ids is not None
            and project_id not in accessible_project_ids
        ):
            raise ResourceNotFoundError("项目不存在")
        return accessible_project_ids
