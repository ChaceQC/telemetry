from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.dependencies import get_ingest_api_key_context, get_ingest_service
from app.repositories.ingest import IngestRecord
from app.schemas.ingest import (
    IngestBatchCreate,
    IngestBatchResponse,
    IngestEventCreate,
    IngestLogsCreate,
    IngestMetricsCreate,
    IngestReceiptResponse,
)
from app.services.api_keys import ApiKeyVerification
from app.services.ingest import IngestService

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])


def _receipt_response(record: IngestRecord) -> IngestReceiptResponse:
    return IngestReceiptResponse.model_validate(
        {
            "id": record.id,
            "project_id": record.project_id,
            "kind": record.kind,
            "type": record.event_type,
            "received_at": record.received_at,
        }
    )


@router.post(
    "/events",
    response_model=IngestReceiptResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="摄入单条事件",
)
def ingest_event(
    payload: IngestEventCreate,
    context: Annotated[ApiKeyVerification, Depends(get_ingest_api_key_context)],
    ingest_service: Annotated[IngestService, Depends(get_ingest_service)],
) -> IngestReceiptResponse:
    record = ingest_service.ingest_event(context=context, event=payload)
    return _receipt_response(record)


@router.post(
    "/batch",
    response_model=IngestBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="批量摄入事件",
)
def ingest_batch(
    payload: IngestBatchCreate,
    context: Annotated[ApiKeyVerification, Depends(get_ingest_api_key_context)],
    ingest_service: Annotated[IngestService, Depends(get_ingest_service)],
) -> IngestBatchResponse:
    accepted = ingest_service.ingest_batch(context=context, batch=payload)
    receipts = [_receipt_response(record) for record in accepted.records]
    return IngestBatchResponse(accepted_count=len(receipts), receipts=receipts)


@router.post(
    "/metrics",
    response_model=IngestBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="批量摄入指标数据点",
)
def ingest_metrics(
    payload: IngestMetricsCreate,
    context: Annotated[ApiKeyVerification, Depends(get_ingest_api_key_context)],
    ingest_service: Annotated[IngestService, Depends(get_ingest_service)],
) -> IngestBatchResponse:
    accepted = ingest_service.ingest_metrics(context=context, batch=payload)
    receipts = [_receipt_response(record) for record in accepted.records]
    return IngestBatchResponse(accepted_count=len(receipts), receipts=receipts)


@router.post(
    "/logs",
    response_model=IngestBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="批量摄入日志记录",
)
def ingest_logs(
    payload: IngestLogsCreate,
    context: Annotated[ApiKeyVerification, Depends(get_ingest_api_key_context)],
    ingest_service: Annotated[IngestService, Depends(get_ingest_service)],
) -> IngestBatchResponse:
    accepted = ingest_service.ingest_logs(context=context, batch=payload)
    receipts = [_receipt_response(record) for record in accepted.records]
    return IngestBatchResponse(accepted_count=len(receipts), receipts=receipts)
