from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from numbers import Real
from typing import Any, Protocol

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session

from app.models.ingest import IngestRecordModel
from app.schemas.ingest import IngestKind


@dataclass(frozen=True)
class QueryCursor:
    received_at: datetime
    id: int


@dataclass(frozen=True)
class EventQueryRecord:
    id: int
    project_id: int
    type: str
    source: str | None
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime


@dataclass(frozen=True)
class LogQueryRecord:
    id: int
    project_id: int
    level: str
    message: str
    source: str | None
    logger: str | None
    trace_id: str | None
    span_id: str | None
    attributes: dict[str, Any]
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime


@dataclass(frozen=True)
class MetricQueryRecord:
    id: int
    project_id: int
    name: str
    value: float
    unit: str | None
    type: str | None
    source: str | None
    tags: dict[str, Any]
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
        cursor: QueryCursor | None,
    ) -> list[EventQueryRecord]: ...

    def list_logs(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        level: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: QueryCursor | None,
    ) -> list[LogQueryRecord]: ...

    def get_log_by_id(self, *, log_id: int) -> LogQueryRecord | None: ...

    def list_log_context_before(
        self,
        *,
        target: LogQueryRecord,
        limit: int,
    ) -> list[LogQueryRecord]: ...

    def list_log_context_after(
        self,
        *,
        target: LogQueryRecord,
        limit: int,
    ) -> list[LogQueryRecord]: ...

    def list_metrics(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        name: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: QueryCursor | None,
    ) -> list[MetricQueryRecord]: ...


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


def _payload_string(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    return value if isinstance(value, str) else None


def _payload_object(payload: dict[str, Any], key: str) -> dict[str, Any]:
    value = payload.get(key)
    return value if isinstance(value, dict) else {}


def _payload_number(payload: dict[str, Any], key: str) -> float:
    value = payload.get(key)
    if isinstance(value, bool) or not isinstance(value, Real):
        return 0.0
    return float(value)


def _log_query_record(model: IngestRecordModel) -> LogQueryRecord:
    message = _payload_string(model.payload, "message")
    return LogQueryRecord(
        id=model.id,
        project_id=model.project_id,
        level=model.event_type,
        message=message or "",
        source=model.source,
        logger=_payload_string(model.payload, "logger"),
        trace_id=_payload_string(model.payload, "trace_id"),
        span_id=_payload_string(model.payload, "span_id"),
        attributes=_payload_object(model.payload, "attributes"),
        payload=_payload_object(model.payload, "payload"),
        occurred_at=model.occurred_at,
        received_at=model.received_at,
    )


def _metric_query_record(model: IngestRecordModel) -> MetricQueryRecord:
    return MetricQueryRecord(
        id=model.id,
        project_id=model.project_id,
        name=model.event_type,
        value=_payload_number(model.payload, "value"),
        unit=_payload_string(model.payload, "unit"),
        type=_payload_string(model.payload, "type"),
        source=model.source,
        tags=_payload_object(model.payload, "tags"),
        payload=_payload_object(model.payload, "payload"),
        occurred_at=model.occurred_at,
        received_at=model.received_at,
    )


def _apply_common_filters(
    statement: Select[tuple[IngestRecordModel]],
    *,
    project_ids: list[int] | None,
    project_id: int | None,
    source: str | None,
    occurred_from: datetime | None,
    occurred_to: datetime | None,
    cursor: QueryCursor | None,
) -> Select[tuple[IngestRecordModel]]:
    if project_ids is not None:
        statement = statement.where(IngestRecordModel.project_id.in_(project_ids))
    if project_id is not None:
        statement = statement.where(IngestRecordModel.project_id == project_id)
    if source is not None:
        statement = statement.where(IngestRecordModel.source == source)
    if occurred_from is not None:
        statement = statement.where(IngestRecordModel.occurred_at >= occurred_from)
    if occurred_to is not None:
        statement = statement.where(IngestRecordModel.occurred_at <= occurred_to)
    if cursor is not None:
        statement = statement.where(
            or_(
                IngestRecordModel.received_at < cursor.received_at,
                and_(
                    IngestRecordModel.received_at == cursor.received_at,
                    IngestRecordModel.id < cursor.id,
                ),
            )
        )
    return statement


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
        cursor: QueryCursor | None,
    ) -> list[EventQueryRecord]:
        statement: Select[tuple[IngestRecordModel]] = select(IngestRecordModel).where(
            IngestRecordModel.kind == IngestKind.event.value
        )
        if project_ids is not None:
            if not project_ids:
                return []
        statement = _apply_common_filters(
            statement,
            project_ids=project_ids,
            project_id=project_id,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            cursor=cursor,
        )
        if event_type is not None:
            statement = statement.where(IngestRecordModel.event_type == event_type)

        statement = statement.order_by(
            IngestRecordModel.received_at.desc(),
            IngestRecordModel.id.desc(),
        ).limit(limit)
        return [_event_query_record(model) for model in self._session.scalars(statement)]

    def list_logs(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        level: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: QueryCursor | None,
    ) -> list[LogQueryRecord]:
        statement: Select[tuple[IngestRecordModel]] = select(IngestRecordModel).where(
            IngestRecordModel.kind == IngestKind.log.value
        )
        if project_ids is not None:
            if not project_ids:
                return []
        statement = _apply_common_filters(
            statement,
            project_ids=project_ids,
            project_id=project_id,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            cursor=cursor,
        )
        if level is not None:
            statement = statement.where(IngestRecordModel.event_type == level)

        statement = statement.order_by(
            IngestRecordModel.received_at.desc(),
            IngestRecordModel.id.desc(),
        ).limit(limit)
        return [_log_query_record(model) for model in self._session.scalars(statement)]

    def get_log_by_id(self, *, log_id: int) -> LogQueryRecord | None:
        statement = select(IngestRecordModel).where(
            IngestRecordModel.id == log_id,
            IngestRecordModel.kind == IngestKind.log.value,
        )
        model = self._session.scalars(statement).first()
        return _log_query_record(model) if model is not None else None

    def list_log_context_before(
        self,
        *,
        target: LogQueryRecord,
        limit: int,
    ) -> list[LogQueryRecord]:
        if limit == 0:
            return []
        statement = (
            select(IngestRecordModel)
            .where(
                IngestRecordModel.project_id == target.project_id,
                IngestRecordModel.kind == IngestKind.log.value,
                or_(
                    IngestRecordModel.received_at < target.received_at,
                    and_(
                        IngestRecordModel.received_at == target.received_at,
                        IngestRecordModel.id < target.id,
                    ),
                ),
            )
            .order_by(
                IngestRecordModel.received_at.desc(),
                IngestRecordModel.id.desc(),
            )
            .limit(limit)
        )
        records = [_log_query_record(model) for model in self._session.scalars(statement)]
        return list(reversed(records))

    def list_log_context_after(
        self,
        *,
        target: LogQueryRecord,
        limit: int,
    ) -> list[LogQueryRecord]:
        if limit == 0:
            return []
        statement = (
            select(IngestRecordModel)
            .where(
                IngestRecordModel.project_id == target.project_id,
                IngestRecordModel.kind == IngestKind.log.value,
                or_(
                    IngestRecordModel.received_at > target.received_at,
                    and_(
                        IngestRecordModel.received_at == target.received_at,
                        IngestRecordModel.id > target.id,
                    ),
                ),
            )
            .order_by(
                IngestRecordModel.received_at.asc(),
                IngestRecordModel.id.asc(),
            )
            .limit(limit)
        )
        return [_log_query_record(model) for model in self._session.scalars(statement)]

    def list_metrics(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        name: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: QueryCursor | None,
    ) -> list[MetricQueryRecord]:
        statement: Select[tuple[IngestRecordModel]] = select(IngestRecordModel).where(
            IngestRecordModel.kind == IngestKind.metric.value
        )
        if project_ids is not None:
            if not project_ids:
                return []
        statement = _apply_common_filters(
            statement,
            project_ids=project_ids,
            project_id=project_id,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            cursor=cursor,
        )
        if name is not None:
            statement = statement.where(IngestRecordModel.event_type == name)

        statement = statement.order_by(
            IngestRecordModel.received_at.desc(),
            IngestRecordModel.id.desc(),
        ).limit(limit)
        return [_metric_query_record(model) for model in self._session.scalars(statement)]
