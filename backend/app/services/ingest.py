from __future__ import annotations

from dataclasses import dataclass

from app.repositories.ingest import IngestRecord, IngestRepository
from app.schemas.ingest import IngestBatchCreate, IngestEventCreate, IngestKind
from app.services.api_keys import ApiKeyVerification


@dataclass(frozen=True)
class IngestAccepted:
    records: list[IngestRecord]


class IngestService:
    def __init__(self, repository: IngestRepository) -> None:
        self._repository = repository

    def ingest_event(
        self,
        *,
        context: ApiKeyVerification,
        event: IngestEventCreate,
    ) -> IngestRecord:
        return self.ingest_batch(
            context=context,
            batch=IngestBatchCreate(events=[event]),
        ).records[0]

    def ingest_batch(
        self,
        *,
        context: ApiKeyVerification,
        batch: IngestBatchCreate,
    ) -> IngestAccepted:
        records = self._repository.create_records(
            [
                (
                    context.project_id,
                    context.api_key_id,
                    IngestKind.event,
                    event.type,
                    event.source,
                    event.payload,
                    event.timestamp,
                )
                for event in batch.events
            ]
        )
        return IngestAccepted(records=records)
