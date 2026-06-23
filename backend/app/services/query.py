from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass, field
from datetime import datetime
from math import isfinite
from typing import Any, Literal

from app.repositories.auth import UserRecord
from app.repositories.management import ManagementRepository
from app.repositories.query import (
    EventQueryRecord,
    LogQueryRecord,
    MetricAggregateRecord,
    MetricQueryRecord,
    QueryCursor,
    QueryRepository,
    TraceQueryRecord,
    TraceTopologyEdgeRecord,
    TraceTopologyNodeRecord,
    TraceTopologyRecord,
)
from app.services.errors import ResourceNotFoundError
from app.services.permissions import PermissionService

QueryKind = Literal["event", "log", "metric", "trace"]
QuerySignatureValue = int | float | str | None
MetricAggregateWindow = Literal["1m", "5m", "15m", "1h"]
MetricAggregation = Literal["avg", "sum", "min", "max", "count"]
METRIC_WINDOW_SECONDS: dict[MetricAggregateWindow, int] = {
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "1h": 60 * 60,
}


class QueryCursorError(Exception):
    """查询游标无效或不适用于当前查询。"""


class QueryFilterError(Exception):
    """查询筛选参数无效。"""


@dataclass(frozen=True)
class QueryPage[
    QueryRecordT: (
        EventQueryRecord,
        LogQueryRecord,
        MetricQueryRecord,
        TraceQueryRecord,
    )
]:
    items: list[QueryRecordT]
    next_cursor: str | None


@dataclass(frozen=True)
class LogContext:
    target: LogQueryRecord
    before: list[LogQueryRecord]
    after: list[LogQueryRecord]


@dataclass
class _TopologyNodeAccumulator:
    source: str
    span_count: int = 0
    trace_ids: set[str] = field(default_factory=set)
    error_span_count: int = 0
    duration_sum_ms: float = 0.0
    duration_count: int = 0
    max_duration_ms: float | None = None

    def add_span(
        self,
        *,
        trace_id: str,
        duration_ms: float | None,
        is_error: bool,
    ) -> None:
        self.span_count += 1
        if trace_id:
            self.trace_ids.add(trace_id)
        if is_error:
            self.error_span_count += 1
        self.add_duration(duration_ms)

    def add_duration(self, duration_ms: float | None) -> None:
        if duration_ms is None or not isfinite(duration_ms):
            return
        self.duration_sum_ms += duration_ms
        self.duration_count += 1
        if self.max_duration_ms is None or duration_ms > self.max_duration_ms:
            self.max_duration_ms = duration_ms

    def to_record(self) -> TraceTopologyNodeRecord:
        return TraceTopologyNodeRecord(
            source=self.source,
            span_count=self.span_count,
            trace_count=len(self.trace_ids),
            error_span_count=self.error_span_count,
            avg_duration_ms=_average_duration(self.duration_sum_ms, self.duration_count),
            max_duration_ms=self.max_duration_ms,
        )


@dataclass
class _TopologyEdgeAccumulator:
    from_source: str
    to_source: str
    call_count: int = 0
    error_count: int = 0
    duration_sum_ms: float = 0.0
    duration_count: int = 0
    max_duration_ms: float | None = None

    def add_call(
        self,
        *,
        duration_ms: float | None,
        is_error: bool,
    ) -> None:
        self.call_count += 1
        if is_error:
            self.error_count += 1
        if duration_ms is None or not isfinite(duration_ms):
            return
        self.duration_sum_ms += duration_ms
        self.duration_count += 1
        if self.max_duration_ms is None or duration_ms > self.max_duration_ms:
            self.max_duration_ms = duration_ms

    def to_record(self) -> TraceTopologyEdgeRecord:
        return TraceTopologyEdgeRecord(
            from_source=self.from_source,
            to_source=self.to_source,
            call_count=self.call_count,
            error_count=self.error_count,
            avg_duration_ms=_average_duration(self.duration_sum_ms, self.duration_count),
            max_duration_ms=self.max_duration_ms,
        )


class QueryService:
    def __init__(
        self,
        repository: QueryRepository,
        permission_service: PermissionService,
        management_repository: ManagementRepository,
        *,
        trace_topology_span_scan_limit: int,
    ) -> None:
        self._repository = repository
        self._permission_service = permission_service
        self._management_repository = management_repository
        self._trace_topology_span_scan_limit = trace_topology_span_scan_limit

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
        cursor: str | None,
    ) -> QueryPage[EventQueryRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)
        query = _query_signature(
            project_id=project_id,
            type=event_type,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
        )
        query_cursor = _decode_cursor(cursor, expected_kind="event", expected_query=query)

        records = self._repository.list_events(
            project_ids=accessible_project_ids,
            project_id=project_id,
            event_type=event_type,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit + 1,
            cursor=query_cursor,
        )
        return _page_records(records, limit=limit, kind="event", query=query)

    def list_logs(
        self,
        *,
        user: UserRecord,
        project_id: int | None,
        level: str | None,
        source: str | None,
        keyword: str | None,
        trace_id: str | None,
        span_id: str | None,
        request_id: str | None,
        user_id: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: str | None,
    ) -> QueryPage[LogQueryRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)
        normalized_keyword = _normalize_keyword(keyword)
        normalized_trace_id = _normalize_optional_text(
            trace_id,
            field_name="trace_id",
            max_length=128,
        )
        normalized_span_id = _normalize_optional_text(
            span_id,
            field_name="span_id",
            max_length=128,
        )
        normalized_request_id = _normalize_optional_text(
            request_id,
            field_name="request_id",
            max_length=128,
        )
        normalized_user_id = _normalize_optional_text(
            user_id,
            field_name="user_id",
            max_length=128,
        )
        query = _query_signature(
            project_id=project_id,
            level=level,
            source=source,
            keyword=normalized_keyword,
            trace_id=normalized_trace_id,
            span_id=normalized_span_id,
            request_id=normalized_request_id,
            user_id=normalized_user_id,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
        )
        query_cursor = _decode_cursor(cursor, expected_kind="log", expected_query=query)

        records = self._repository.list_logs(
            project_ids=accessible_project_ids,
            project_id=project_id,
            level=level,
            source=source,
            keyword=normalized_keyword,
            trace_id=normalized_trace_id,
            span_id=normalized_span_id,
            request_id=normalized_request_id,
            user_id=normalized_user_id,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit + 1,
            cursor=query_cursor,
        )
        return _page_records(records, limit=limit, kind="log", query=query)

    def list_traces(
        self,
        *,
        user: UserRecord,
        project_id: int | None,
        trace_id: str | None,
        span_id: str | None,
        name: str | None,
        source: str | None,
        status_code: str | None,
        duration_min_ms: float | None,
        duration_max_ms: float | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: str | None,
    ) -> QueryPage[TraceQueryRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)
        normalized_trace_id = _normalize_optional_text(
            trace_id,
            field_name="trace_id",
            max_length=128,
        )
        normalized_span_id = _normalize_optional_text(
            span_id,
            field_name="span_id",
            max_length=128,
        )
        normalized_status_code = _normalize_optional_text(
            status_code,
            field_name="status_code",
            max_length=64,
        )
        normalized_duration_min_ms = _normalize_optional_duration_ms(
            duration_min_ms,
            field_name="duration_min_ms",
        )
        normalized_duration_max_ms = _normalize_optional_duration_ms(
            duration_max_ms,
            field_name="duration_max_ms",
        )
        if (
            normalized_duration_min_ms is not None
            and normalized_duration_max_ms is not None
            and normalized_duration_min_ms > normalized_duration_max_ms
        ):
            raise QueryFilterError("duration_min_ms 不能大于 duration_max_ms")
        query = _query_signature(
            project_id=project_id,
            trace_id=normalized_trace_id,
            span_id=normalized_span_id,
            name=name,
            source=source,
            status_code=normalized_status_code,
            duration_min_ms=normalized_duration_min_ms,
            duration_max_ms=normalized_duration_max_ms,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
        )
        query_cursor = _decode_cursor(cursor, expected_kind="trace", expected_query=query)

        records = self._repository.list_traces(
            project_ids=accessible_project_ids,
            project_id=project_id,
            trace_id=normalized_trace_id,
            span_id=normalized_span_id,
            name=name,
            source=source,
            status_code=normalized_status_code,
            duration_min_ms=normalized_duration_min_ms,
            duration_max_ms=normalized_duration_max_ms,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit + 1,
            cursor=query_cursor,
        )
        return _page_records(records, limit=limit, kind="trace", query=query)

    def get_log_context(
        self,
        *,
        user: UserRecord,
        log_id: int,
        before: int,
        after: int,
    ) -> LogContext:
        target = self._repository.get_log_by_id(log_id=log_id)
        if target is None:
            raise ResourceNotFoundError("日志不存在")

        accessible_project_ids = self._permission_service.list_accessible_project_ids(user)
        if accessible_project_ids is not None and target.project_id not in accessible_project_ids:
            raise ResourceNotFoundError("日志不存在")

        return LogContext(
            target=target,
            before=self._repository.list_log_context_before(target=target, limit=before),
            after=self._repository.list_log_context_after(target=target, limit=after),
        )

    def get_trace_topology(
        self,
        *,
        user: UserRecord,
        project_id: int,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
    ) -> TraceTopologyRecord:
        accessible_project_ids = self._accessible_project_ids(user, project_id)
        normalized_source = _normalize_optional_text(
            source,
            field_name="source",
            max_length=128,
        )
        spans = self._repository.list_trace_spans_for_topology(
            project_ids=accessible_project_ids,
            project_id=project_id,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=self._trace_topology_span_scan_limit,
        )
        return _build_trace_topology(spans, source=normalized_source, limit=limit)

    def list_metrics(
        self,
        *,
        user: UserRecord,
        project_id: int | None,
        name: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: str | None,
    ) -> QueryPage[MetricQueryRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)
        query = _query_signature(
            project_id=project_id,
            name=name,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
        )
        query_cursor = _decode_cursor(cursor, expected_kind="metric", expected_query=query)

        records = self._repository.list_metrics(
            project_ids=accessible_project_ids,
            project_id=project_id,
            name=name,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit + 1,
            cursor=query_cursor,
        )
        return _page_records(records, limit=limit, kind="metric", query=query)

    def aggregate_metrics(
        self,
        *,
        user: UserRecord,
        project_id: int | None,
        name: str | None,
        source: str | None,
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        window: MetricAggregateWindow,
        aggregation: MetricAggregation,
        limit: int,
    ) -> list[MetricAggregateRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)
        return self._repository.aggregate_metrics(
            project_ids=accessible_project_ids,
            project_id=project_id,
            name=name,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            window_seconds=METRIC_WINDOW_SECONDS[window],
            aggregation=aggregation,
            limit=limit,
        )

    def _accessible_project_ids(
        self,
        user: UserRecord,
        project_id: int | None,
    ) -> list[int] | None:
        accessible_project_ids = self._permission_service.list_accessible_project_ids(user)
        if project_id is None:
            return accessible_project_ids

        if self._management_repository.get_project(project_id) is None:
            raise ResourceNotFoundError("项目不存在")
        if accessible_project_ids is not None and project_id not in accessible_project_ids:
            raise ResourceNotFoundError("项目不存在")
        return accessible_project_ids


def _query_signature(
    **values: int | float | str | datetime | None,
) -> dict[str, QuerySignatureValue]:
    return {
        key: value.isoformat() if isinstance(value, datetime) else value
        for key, value in values.items()
    }


def _normalize_optional_text(
    value: str | None,
    *,
    field_name: str | None = None,
    max_length: int | None = None,
) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if max_length is not None and len(normalized) > max_length:
        name = field_name or "查询参数"
        raise QueryFilterError(f"{name} 长度不能超过 {max_length}")
    return normalized or None


def _normalize_keyword(value: str | None) -> str | None:
    return _normalize_optional_text(value)


def _normalize_optional_duration_ms(
    value: float | None,
    *,
    field_name: str,
) -> float | None:
    if value is None:
        return None
    if not isfinite(value):
        raise QueryFilterError(f"{field_name} 必须是有限数值")
    if value < 0:
        raise QueryFilterError(f"{field_name} 不能小于 0")
    return value


def _average_duration(total_duration_ms: float, count: int) -> float | None:
    if count == 0:
        return None
    return total_duration_ms / count


def _normalized_source(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _is_error_status(status_code: str | None) -> bool:
    return status_code is not None and status_code.strip().lower() == "error"


def _build_trace_topology(
    spans: list[TraceQueryRecord],
    *,
    source: str | None,
    limit: int,
) -> TraceTopologyRecord:
    nodes_by_source: dict[str, _TopologyNodeAccumulator] = {}
    spans_by_trace_and_span: dict[tuple[str, str], TraceQueryRecord] = {}
    ambiguous_span_keys: set[tuple[str, str]] = set()

    for span in spans:
        span_source = _normalized_source(span.source)
        if span.trace_id and span.span_id:
            span_key = (span.trace_id, span.span_id)
            if span_key not in ambiguous_span_keys:
                if span_key in spans_by_trace_and_span:
                    del spans_by_trace_and_span[span_key]
                    ambiguous_span_keys.add(span_key)
                else:
                    spans_by_trace_and_span[span_key] = span
        if span_source is None:
            continue

        node = nodes_by_source.setdefault(
            span_source,
            _TopologyNodeAccumulator(source=span_source),
        )
        node.add_span(
            trace_id=span.trace_id,
            duration_ms=span.duration_ms,
            is_error=_is_error_status(span.status_code),
        )

    edges_by_sources: dict[tuple[str, str], _TopologyEdgeAccumulator] = {}
    for child in spans:
        if not child.trace_id or not child.parent_span_id:
            continue
        parent_key = (child.trace_id, child.parent_span_id)
        if parent_key in ambiguous_span_keys:
            continue
        parent = spans_by_trace_and_span.get(parent_key)
        if parent is None:
            continue

        from_source = _normalized_source(parent.source)
        to_source = _normalized_source(child.source)
        if from_source is None or to_source is None or from_source == to_source:
            continue

        edge = edges_by_sources.setdefault(
            (from_source, to_source),
            _TopologyEdgeAccumulator(from_source=from_source, to_source=to_source),
        )
        edge.add_call(
            duration_ms=child.duration_ms,
            is_error=_is_error_status(child.status_code),
        )

    visible_sources = set(nodes_by_source)
    if source is not None:
        visible_sources = set()
        if source in nodes_by_source:
            visible_sources.add(source)
        for edge in edges_by_sources.values():
            if edge.from_source == source or edge.to_source == source:
                visible_sources.add(edge.from_source)
                visible_sources.add(edge.to_source)

    node_records = [
        node.to_record()
        for node_source, node in nodes_by_source.items()
        if node_source in visible_sources
    ]
    node_records.sort(
        key=lambda node: (
            0 if source is not None and node.source == source else 1,
            -node.span_count,
            node.source,
        )
    )
    limited_sources = {node.source for node in node_records[:limit]}
    edge_records = [
        edge.to_record()
        for edge in edges_by_sources.values()
        if edge.from_source in limited_sources and edge.to_source in limited_sources
    ]
    edge_records.sort(
        key=lambda edge: (
            -edge.call_count,
            edge.from_source,
            edge.to_source,
        )
    )
    return TraceTopologyRecord(
        nodes=node_records[:limit],
        edges=edge_records,
    )


def _decode_cursor(
    cursor: str | None,
    *,
    expected_kind: QueryKind,
    expected_query: dict[str, QuerySignatureValue],
) -> QueryCursor | None:
    if cursor is None:
        return None
    try:
        padding = "=" * (-len(cursor) % 4)
        decoded = base64.b64decode(
            cursor + padding,
            altchars=b"-_",
            validate=True,
        )
        payload = json.loads(decoded.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError
        if (
            payload.get("v") != 1
            or payload.get("kind") != expected_kind
            or payload.get("query") != expected_query
        ):
            raise ValueError
        received_at_raw = payload.get("received_at")
        id_raw = payload.get("id")
        if not isinstance(received_at_raw, str):
            raise ValueError
        if isinstance(id_raw, bool) or not isinstance(id_raw, int) or id_raw <= 0:
            raise ValueError
        return QueryCursor(received_at=datetime.fromisoformat(received_at_raw), id=id_raw)
    except (
        binascii.Error,
        UnicodeDecodeError,
        ValueError,
        TypeError,
        json.JSONDecodeError,
    ) as error:
        raise QueryCursorError("cursor 无效或不匹配当前查询") from error


def _encode_cursor(
    record: EventQueryRecord | LogQueryRecord | MetricQueryRecord | TraceQueryRecord,
    kind: QueryKind,
    query: dict[str, QuerySignatureValue],
) -> str:
    payload: dict[str, Any] = {
        "v": 1,
        "kind": kind,
        "query": query,
        "received_at": record.received_at.isoformat(),
        "id": record.id,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    return encoded.rstrip("=")


def _page_records[
    QueryRecordT: (
        EventQueryRecord,
        LogQueryRecord,
        MetricQueryRecord,
        TraceQueryRecord,
    )
](
    records: list[QueryRecordT],
    *,
    limit: int,
    kind: QueryKind,
    query: dict[str, QuerySignatureValue],
) -> QueryPage[QueryRecordT]:
    items = records[:limit]
    next_cursor = _encode_cursor(items[-1], kind, query) if len(records) > limit and items else None
    return QueryPage(items=items, next_cursor=next_cursor)
