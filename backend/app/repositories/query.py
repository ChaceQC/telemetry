from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from numbers import Real
from typing import Any, Protocol

from sqlalchemy import (
    ColumnElement,
    Float,
    Integer,
    Select,
    String,
    and_,
    case,
    cast,
    func,
    literal,
    literal_column,
    or_,
    select,
)
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


@dataclass(frozen=True)
class MetricAggregateRecord:
    project_id: int
    name: str
    source: str | None
    window_start: datetime
    window_end: datetime
    aggregation: str
    value: float
    sample_count: int
    unit: str | None


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
        keyword: str | None,
        trace_id: str | None,
        span_id: str | None,
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

    def aggregate_metrics(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        name: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        window_seconds: int,
        aggregation: str,
        limit: int,
    ) -> list[MetricAggregateRecord]: ...


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


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _apply_log_keyword_filter(
    statement: Select[tuple[IngestRecordModel]],
    keyword: str | None,
    *,
    dialect_name: str,
) -> Select[tuple[IngestRecordModel]]:
    if keyword is None:
        return statement

    pattern = f"%{_escape_like(keyword)}%"
    message_text = cast(IngestRecordModel.payload["message"].as_string(), String)
    return statement.where(
        or_(
            message_text.ilike(pattern, escape="\\"),
            _payload_value_text_matches(pattern, dialect_name=dialect_name),
        )
    )


def _payload_value_text_matches(pattern: str, *, dialect_name: str) -> ColumnElement[bool]:
    if dialect_name == "sqlite":
        payload_values = func.json_tree(
            IngestRecordModel.payload,
            "$.payload",
        ).table_valued("value", "type")
        value_text = case(
            (payload_values.c.type == "true", literal("true")),
            (payload_values.c.type == "false", literal("false")),
            else_=cast(payload_values.c.value, String),
        )
        return (
            select(1)
            .select_from(payload_values)
            .where(
                payload_values.c.type.in_(("text", "integer", "real", "true", "false")),
                value_text.ilike(pattern, escape="\\"),
            )
            .exists()
        )
    if dialect_name in {"mysql", "mariadb"}:
        return func.JSON_SEARCH(
            func.JSON_EXTRACT(IngestRecordModel.payload, "$.payload"),
            "one",
            pattern,
            "\\",
        ).is_not(None)
    return cast(IngestRecordModel.payload["payload"].as_string(), String).ilike(
        pattern,
        escape="\\",
    )


def _apply_log_structured_field_filters(
    statement: Select[tuple[IngestRecordModel]],
    *,
    trace_id: str | None,
    span_id: str | None,
) -> Select[tuple[IngestRecordModel]]:
    if trace_id is not None:
        statement = statement.where(IngestRecordModel.payload["trace_id"].as_string() == trace_id)
    if span_id is not None:
        statement = statement.where(IngestRecordModel.payload["span_id"].as_string() == span_id)
    return statement


def _metric_window_epoch(
    dialect_name: str,
    *,
    window_seconds: int,
) -> ColumnElement[int]:
    if dialect_name == "sqlite":
        epoch = cast(func.strftime("%s", IngestRecordModel.occurred_at), Integer)
    elif dialect_name in {"mysql", "mariadb"}:
        epoch = cast(
            func.timestampdiff(
                literal_column("SECOND"),
                literal_column("'1970-01-01 00:00:00'"),
                IngestRecordModel.occurred_at,
            ),
            Integer,
        )
    else:
        epoch = cast(func.extract("epoch", IngestRecordModel.occurred_at), Integer)
    return cast(func.floor(epoch / window_seconds), Integer) * window_seconds


def _metric_aggregate_value(
    aggregation: str,
    value_expression: ColumnElement[float],
) -> ColumnElement[float]:
    if aggregation == "sum":
        return func.sum(value_expression)
    if aggregation == "min":
        return func.min(value_expression)
    if aggregation == "max":
        return func.max(value_expression)
    if aggregation == "count":
        return cast(func.count(value_expression), Float)
    return func.avg(value_expression)


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
        keyword: str | None,
        trace_id: str | None,
        span_id: str | None,
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
        statement = _apply_log_keyword_filter(
            statement,
            keyword,
            dialect_name=self._session.get_bind().dialect.name,
        )
        statement = _apply_log_structured_field_filters(
            statement,
            trace_id=trace_id,
            span_id=span_id,
        )

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

    def aggregate_metrics(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        name: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        window_seconds: int,
        aggregation: str,
        limit: int,
    ) -> list[MetricAggregateRecord]:
        if project_ids is not None and not project_ids:
            return []

        dialect_name = self._session.get_bind().dialect.name
        window_epoch = _metric_window_epoch(dialect_name, window_seconds=window_seconds).label(
            "window_epoch"
        )
        metric_value = cast(IngestRecordModel.payload["value"].as_float(), Float)
        aggregate_value = _metric_aggregate_value(aggregation, metric_value).label("value")
        sample_count = func.count(metric_value).label("sample_count")
        unit = func.min(IngestRecordModel.payload["unit"].as_string()).label("unit")

        statement = select(
            IngestRecordModel.project_id,
            IngestRecordModel.event_type,
            IngestRecordModel.source,
            window_epoch,
            aggregate_value,
            sample_count,
            unit,
        ).where(
            IngestRecordModel.kind == IngestKind.metric.value,
            IngestRecordModel.occurred_at.is_not(None),
        )
        if project_ids is not None:
            statement = statement.where(IngestRecordModel.project_id.in_(project_ids))
        if project_id is not None:
            statement = statement.where(IngestRecordModel.project_id == project_id)
        if name is not None:
            statement = statement.where(IngestRecordModel.event_type == name)
        if source is not None:
            statement = statement.where(IngestRecordModel.source == source)
        if occurred_from is not None:
            statement = statement.where(IngestRecordModel.occurred_at >= occurred_from)
        if occurred_to is not None:
            statement = statement.where(IngestRecordModel.occurred_at <= occurred_to)

        statement = (
            statement.group_by(
                IngestRecordModel.project_id,
                IngestRecordModel.event_type,
                IngestRecordModel.source,
                window_epoch,
            )
            .order_by(
                window_epoch.desc(),
                IngestRecordModel.project_id,
                IngestRecordModel.event_type,
                IngestRecordModel.source,
            )
            .limit(limit)
        )

        records: list[MetricAggregateRecord] = []
        for row in self._session.execute(statement):
            window_start = datetime.fromtimestamp(int(row.window_epoch), tz=UTC)
            records.append(
                MetricAggregateRecord(
                    project_id=row.project_id,
                    name=row.event_type,
                    source=row.source,
                    window_start=window_start,
                    window_end=datetime.fromtimestamp(
                        int(row.window_epoch) + window_seconds,
                        tz=UTC,
                    ),
                    aggregation=aggregation,
                    value=float(row.value),
                    sample_count=int(row.sample_count),
                    unit=row.unit,
                )
            )
        return records
