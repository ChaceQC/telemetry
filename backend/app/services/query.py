from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from app.repositories.auth import UserRecord
from app.repositories.query import (
    EventQueryRecord,
    LogQueryRecord,
    MetricQueryRecord,
    QueryCursor,
    QueryRepository,
)
from app.services.errors import ResourceNotFoundError
from app.services.permissions import PermissionService

QueryKind = Literal["event", "log", "metric"]


class QueryCursorError(Exception):
    """查询游标无效或不适用于当前查询。"""


@dataclass(frozen=True)
class QueryPage[QueryRecordT: (EventQueryRecord, LogQueryRecord, MetricQueryRecord)]:
    items: list[QueryRecordT]
    next_cursor: str | None


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
        occurred_from: datetime | None,
        occurred_to: datetime | None,
        limit: int,
        cursor: str | None,
    ) -> QueryPage[LogQueryRecord]:
        accessible_project_ids = self._accessible_project_ids(user, project_id)
        query = _query_signature(
            project_id=project_id,
            level=level,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
        )
        query_cursor = _decode_cursor(cursor, expected_kind="log", expected_query=query)

        records = self._repository.list_logs(
            project_ids=accessible_project_ids,
            project_id=project_id,
            level=level,
            source=source,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            limit=limit + 1,
            cursor=query_cursor,
        )
        return _page_records(records, limit=limit, kind="log", query=query)

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


def _query_signature(**values: int | str | datetime | None) -> dict[str, int | str | None]:
    return {
        key: value.isoformat() if isinstance(value, datetime) else value
        for key, value in values.items()
    }


def _decode_cursor(
    cursor: str | None,
    *,
    expected_kind: QueryKind,
    expected_query: dict[str, int | str | None],
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
    record: EventQueryRecord | LogQueryRecord | MetricQueryRecord,
    kind: QueryKind,
    query: dict[str, int | str | None],
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


def _page_records[QueryRecordT: (EventQueryRecord, LogQueryRecord, MetricQueryRecord)](
    records: list[QueryRecordT],
    *,
    limit: int,
    kind: QueryKind,
    query: dict[str, int | str | None],
) -> QueryPage[QueryRecordT]:
    items = records[:limit]
    next_cursor = _encode_cursor(items[-1], kind, query) if len(records) > limit and items else None
    return QueryPage(items=items, next_cursor=next_cursor)
