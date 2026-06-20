from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.ingest import IngestRecordModel, IngestStatModel
from app.repositories.unit_of_work import flush_or_commit
from app.schemas.ingest import IngestKind

IngestRecordCreate = tuple[int, int, IngestKind, str, str | None, dict[str, Any], datetime | None]


@dataclass(frozen=True)
class IngestRecord:
    id: int
    project_id: int
    api_key_id: int
    kind: IngestKind
    event_type: str
    source: str | None
    payload: dict[str, Any]
    occurred_at: datetime | None
    received_at: datetime


@dataclass(frozen=True)
class IngestStatRecord:
    bucket_start: datetime
    project_id: int
    api_key_id: int
    kind: IngestKind
    source: str | None
    accepted_count: int
    rejected_count: int
    bytes_count: int


class IngestRepository(Protocol):
    def create_records(
        self,
        records: list[IngestRecordCreate],
    ) -> list[IngestRecord]: ...

    def list_stats(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        kind: IngestKind | None,
        limit: int,
    ) -> list[IngestStatRecord]: ...


def _minute_bucket(value: datetime) -> datetime:
    return value.replace(second=0, microsecond=0)


def _payload_size(value: dict[str, Any]) -> int:
    return len(
        json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    )


def _ingest_record(model: IngestRecordModel) -> IngestRecord:
    return IngestRecord(
        id=model.id,
        project_id=model.project_id,
        api_key_id=model.api_key_id,
        kind=IngestKind(model.kind),
        event_type=model.event_type,
        source=model.source,
        payload=model.payload,
        occurred_at=model.occurred_at,
        received_at=model.received_at,
    )


def _ingest_stat_record(model: IngestStatModel) -> IngestStatRecord:
    return IngestStatRecord(
        bucket_start=model.bucket_start,
        project_id=model.project_id,
        api_key_id=model.api_key_id,
        kind=IngestKind(model.kind),
        source=model.source or None,
        accepted_count=model.accepted_count,
        rejected_count=model.rejected_count,
        bytes_count=model.bytes_count,
    )


class SqlAlchemyIngestRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_records(
        self,
        records: list[IngestRecordCreate],
    ) -> list[IngestRecord]:
        models = [
            IngestRecordModel(
                project_id=project_id,
                api_key_id=api_key_id,
                kind=kind.value,
                event_type=event_type,
                source=source,
                payload=payload,
                occurred_at=occurred_at,
            )
            for project_id, api_key_id, kind, event_type, source, payload, occurred_at in records
        ]
        self._session.add_all(models)
        self._increment_accepted_stats(records)
        flush_or_commit(self._session)
        for model in models:
            self._session.refresh(model)
        return [_ingest_record(model) for model in models]

    def list_stats(
        self,
        *,
        project_ids: list[int] | None,
        project_id: int | None,
        kind: IngestKind | None,
        limit: int,
    ) -> list[IngestStatRecord]:
        statement: Select[tuple[IngestStatModel]] = select(IngestStatModel)
        if project_ids is not None:
            if not project_ids:
                return []
            statement = statement.where(IngestStatModel.project_id.in_(project_ids))
        if project_id is not None:
            statement = statement.where(IngestStatModel.project_id == project_id)
        if kind is not None:
            statement = statement.where(IngestStatModel.kind == kind.value)

        statement = statement.order_by(
            IngestStatModel.bucket_start.desc(),
            IngestStatModel.project_id,
            IngestStatModel.kind,
            IngestStatModel.source,
        ).limit(limit)
        return [_ingest_stat_record(model) for model in self._session.scalars(statement)]

    def _increment_accepted_stats(self, records: list[IngestRecordCreate]) -> None:
        grouped_stats: dict[tuple[datetime, int, int, IngestKind, str], tuple[int, int]] = (
            defaultdict(lambda: (0, 0))
        )
        for project_id, api_key_id, kind, _event_type, source, payload, occurred_at in records:
            bucket_start = _minute_bucket(occurred_at or datetime.now(UTC))
            normalized_source = source or ""
            key = (bucket_start, project_id, api_key_id, kind, normalized_source)
            accepted_count, bytes_count = grouped_stats[key]
            grouped_stats[key] = (accepted_count + 1, bytes_count + _payload_size(payload))

        for (
            bucket_start,
            project_id,
            api_key_id,
            kind,
            normalized_source,
        ), (accepted_count, bytes_count) in grouped_stats.items():
            stat = self._session.scalar(
                select(IngestStatModel).where(
                    IngestStatModel.bucket_start == bucket_start,
                    IngestStatModel.project_id == project_id,
                    IngestStatModel.api_key_id == api_key_id,
                    IngestStatModel.kind == kind.value,
                    IngestStatModel.source == normalized_source,
                )
            )
            if stat is None:
                self._session.add(
                    IngestStatModel(
                        bucket_start=bucket_start,
                        project_id=project_id,
                        api_key_id=api_key_id,
                        kind=kind.value,
                        source=normalized_source,
                        accepted_count=accepted_count,
                        bytes_count=bytes_count,
                    )
                )
                continue

            stat.accepted_count += accepted_count
            stat.bytes_count += bytes_count
