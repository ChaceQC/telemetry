from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.ingest import IngestRecordModel
from app.schemas.ingest import IngestKind


@dataclass(frozen=True)
class EventQueryRecord:
    id: int
    project_id: int
    type: str
    source: str | None
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime


class QueryRepository(Protocol):
    def list_events(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        event_type: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
    ) -> list[EventQueryRecord]: ...


def _event_query_record(model: IngestRecordModel) -> EventQueryRecord:
    return EventQueryRecord(
        id=model.id,
        project_id=model.project_id,
        type=model.event_type,
        source=model.source,
        payload=model.payload,
        occurred_at=model.occurred_at,
        received_at=model.received_at,
    )


class SqlAlchemyQueryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_events(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        event_type: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
    ) -> list[EventQueryRecord]:
        statement: Select[tuple[IngestRecordModel]] = select(IngestRecordModel).where(
            IngestRecordModel.kind == IngestKind.event.value
        )
        if project_ids is not None:
            if not project_ids:
                return []
            statement = statement.where(IngestRecordModel.project_id.in_(project_ids))
        if project_id is not None:
            statement = statement.where(IngestRecordModel.project_id == project_id)
        if event_type is not None:
            statement = statement.where(IngestRecordModel.event_type == event_type)
        if source is not None:
            statement = statement.where(IngestRecordModel.source == source)
        if occurred_from is not None:
            statement = statement.where(IngestRecordModel.occurred_at >= occurred_from)
        if occurred_to is not None:
            statement = statement.where(IngestRecordModel.occurred_at <= occurred_to)

        statement = statement.order_by(
            IngestRecordModel.received_at.desc(),
            IngestRecordModel.id.desc(),
        ).limit(limit)
        return [_event_query_record(model) for model in self._session.scalars(statement)]
