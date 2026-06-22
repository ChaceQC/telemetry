from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.repositories.auth import UserRecord
from app.repositories.ingest import IngestRecord, IngestRepository, IngestStatRecord
from app.schemas.ingest import (
    IngestBatchCreate,
    IngestEventCreate,
    IngestKind,
    IngestLogsCreate,
    IngestMetricsCreate,
    IngestTracesCreate,
    IngestTraceSpanCreate,
)
from app.services.api_keys import ApiKeyVerification
from app.services.errors import ResourceNotFoundError
from app.services.permissions import PermissionService


@dataclass(frozen=True)
class IngestAccepted:
    records: list[IngestRecord]


class IngestService:
    def __init__(
        self,
        repository: IngestRepository,
        permission_service: PermissionService | None = None,
    ) -> None:
        self._repository = repository
        self._permission_service = permission_service

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

    def ingest_metrics(
        self,
        *,
        context: ApiKeyVerification,
        batch: IngestMetricsCreate,
    ) -> IngestAccepted:
        records = self._repository.create_records(
            [
                (
                    context.project_id,
                    context.api_key_id,
                    IngestKind.metric,
                    metric.name,
                    metric.source,
                    {
                        "name": metric.name,
                        "value": metric.value,
                        "unit": metric.unit,
                        "type": metric.type,
                        "tags": metric.tags or {},
                        "payload": metric.payload or {},
                    },
                    metric.timestamp,
                )
                for metric in batch.metrics
            ]
        )
        return IngestAccepted(records=records)

    def ingest_logs(
        self,
        *,
        context: ApiKeyVerification,
        batch: IngestLogsCreate,
    ) -> IngestAccepted:
        records = self._repository.create_records(
            [
                (
                    context.project_id,
                    context.api_key_id,
                    IngestKind.log,
                    log.level,
                    log.source,
                    {
                        "level": log.level,
                        "message": log.message,
                        "logger": log.logger,
                        "trace_id": log.trace_id,
                        "span_id": log.span_id,
                        "attributes": log.attributes or {},
                        "payload": log.payload or {},
                    },
                    log.timestamp,
                )
                for log in batch.logs
            ]
        )
        return IngestAccepted(records=records)

    def ingest_traces(
        self,
        *,
        context: ApiKeyVerification,
        batch: IngestTracesCreate,
    ) -> IngestAccepted:
        records = self._repository.create_records(
            [
                (
                    context.project_id,
                    context.api_key_id,
                    IngestKind.trace,
                    span.name,
                    span.source,
                    _trace_span_payload(span),
                    span.start_time,
                )
                for span in batch.spans
            ]
        )
        return IngestAccepted(records=records)

    def list_stats(
        self,
        *,
        user: UserRecord,
        project_id: int | None,
        kind: IngestKind | None,
        limit: int,
    ) -> list[IngestStatRecord]:
        if self._permission_service is None:
            raise RuntimeError("permission_service is required to list ingest stats")

        accessible_project_ids = self._permission_service.list_accessible_project_ids(user)
        if (
            project_id is not None
            and accessible_project_ids is not None
            and project_id not in accessible_project_ids
        ):
            raise ResourceNotFoundError("项目不存在")

        return self._repository.list_stats(
            project_ids=accessible_project_ids,
            project_id=project_id,
            kind=kind,
            limit=limit,
        )

    def record_rejected(
        self,
        *,
        context: ApiKeyVerification,
        kind: IngestKind,
        source: str | None = None,
    ) -> None:
        self._repository.record_rejected(
            project_id=context.project_id,
            api_key_id=context.api_key_id,
            kind=kind,
            source=source,
        )


def _trace_span_payload(span: IngestTraceSpanCreate) -> dict[str, Any]:
    raw_span = span.model_dump(mode="json")
    duration_ms = raw_span["duration_ms"]
    if duration_ms is None and span.end_time is not None:
        duration_ms = (span.end_time - span.start_time).total_seconds() * 1000

    return {
        "trace_id": raw_span["trace_id"],
        "span_id": raw_span["span_id"],
        "parent_span_id": raw_span["parent_span_id"],
        "name": raw_span["name"],
        "start_time": raw_span["start_time"],
        "end_time": raw_span["end_time"],
        "duration_ms": duration_ms,
        "status_code": raw_span["status_code"],
        "source": raw_span["source"],
        "attributes": raw_span["attributes"] or {},
        "payload": raw_span["payload"] or {},
        "raw": raw_span,
    }
