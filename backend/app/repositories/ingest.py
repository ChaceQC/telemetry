from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.models.ingest import IngestRecordModel
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


class IngestRepository(Protocol):
    def create_records(
        self,
        records: list[IngestRecordCreate],
    ) -> list[IngestRecord]: ...


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
        flush_or_commit(self._session)
        for model in models:
            self._session.refresh(model)
        return [_ingest_record(model) for model in models]
