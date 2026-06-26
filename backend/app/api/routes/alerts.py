from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.api.dependencies import get_alert_rule_service, get_current_user
from app.repositories.auth import UserRecord
from app.schemas.alerts import (
    AlertRuleCreate,
    AlertRuleEvaluationConditionResponse,
    AlertRuleEvaluationObservedResponse,
    AlertRuleEvaluationResponse,
    AlertRuleEvaluationWindowResponse,
    AlertRuleListResponse,
    AlertRuleResponse,
    AlertRuleSeverity,
    AlertRuleSignal,
    AlertRuleUpdate,
)
from app.services.alerts import (
    AlertRuleEvaluationError,
    AlertRuleEvaluationResult,
    AlertRuleService,
)
from app.services.errors import (
    DuplicateResourceError,
    ResourceForbiddenError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)

router = APIRouter(
    prefix="/api/v1",
    tags=["alerts"],
    dependencies=[Depends(get_current_user)],
)


def _map_alert_rule_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, ResourceForbiddenError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if isinstance(error, (DuplicateResourceError, ResourceIntegrityError)):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="告警规则接口错误",
    )


@router.get(
    "/alerts/rules",
    response_model=AlertRuleListResponse,
    summary="列出告警规则",
)
def list_alert_rules(
    alert_rule_service: Annotated[AlertRuleService, Depends(get_alert_rule_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    severity: AlertRuleSeverity | None = None,
    signal: AlertRuleSignal | None = None,
    enabled: bool | None = None,
    limit: Annotated[int, Query(gt=0, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AlertRuleListResponse:
    try:
        page = alert_rule_service.list_alert_rules(
            user=current_user,
            project_id=project_id,
            severity=severity,
            signal=signal,
            enabled=enabled,
            limit=limit,
            offset=offset,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_alert_rule_error(error) from error
    return AlertRuleListResponse(
        items=[AlertRuleResponse.model_validate(rule) for rule in page.items],
        limit=limit,
        offset=offset,
        total=page.total,
    )


@router.post(
    "/alerts/rules",
    response_model=AlertRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建告警规则",
)
def create_alert_rule(
    payload: AlertRuleCreate,
    alert_rule_service: Annotated[AlertRuleService, Depends(get_alert_rule_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> AlertRuleResponse:
    try:
        rule = alert_rule_service.create_alert_rule(payload=payload, user=current_user)
    except (
        DuplicateResourceError,
        ResourceForbiddenError,
        ResourceIntegrityError,
        ResourceNotFoundError,
    ) as error:
        raise _map_alert_rule_error(error) from error
    return AlertRuleResponse.model_validate(rule)


@router.get(
    "/projects/{project_id}/alerts/rules/{rule_id}",
    response_model=AlertRuleResponse,
    summary="读取告警规则",
)
def get_project_alert_rule(
    alert_rule_service: Annotated[AlertRuleService, Depends(get_alert_rule_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    rule_id: Annotated[int, Path(gt=0)],
) -> AlertRuleResponse:
    try:
        rule = alert_rule_service.get_alert_rule(
            user=current_user,
            project_id=project_id,
            rule_id=rule_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_alert_rule_error(error) from error
    return AlertRuleResponse.model_validate(rule)


@router.patch(
    "/projects/{project_id}/alerts/rules/{rule_id}",
    response_model=AlertRuleResponse,
    summary="更新告警规则",
)
def update_project_alert_rule(
    payload: AlertRuleUpdate,
    alert_rule_service: Annotated[AlertRuleService, Depends(get_alert_rule_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    rule_id: Annotated[int, Path(gt=0)],
) -> AlertRuleResponse:
    try:
        rule = alert_rule_service.update_alert_rule(
            user=current_user,
            project_id=project_id,
            rule_id=rule_id,
            payload=payload,
        )
    except (
        DuplicateResourceError,
        ResourceForbiddenError,
        ResourceIntegrityError,
        ResourceNotFoundError,
    ) as error:
        raise _map_alert_rule_error(error) from error
    return AlertRuleResponse.model_validate(rule)


@router.delete(
    "/projects/{project_id}/alerts/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除告警规则",
)
def delete_project_alert_rule(
    alert_rule_service: Annotated[AlertRuleService, Depends(get_alert_rule_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    rule_id: Annotated[int, Path(gt=0)],
) -> None:
    try:
        alert_rule_service.delete_alert_rule(
            user=current_user,
            project_id=project_id,
            rule_id=rule_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_alert_rule_error(error) from error


@router.post(
    "/projects/{project_id}/alerts/rules/{rule_id}/evaluate",
    response_model=AlertRuleEvaluationResponse,
    summary="手动评估指标阈值告警规则",
)
def evaluate_project_alert_rule(
    alert_rule_service: Annotated[AlertRuleService, Depends(get_alert_rule_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    rule_id: Annotated[int, Path(gt=0)],
) -> AlertRuleEvaluationResponse:
    try:
        result = alert_rule_service.evaluate_alert_rule(
            user=current_user,
            project_id=project_id,
            rule_id=rule_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_alert_rule_error(error) from error
    except AlertRuleEvaluationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return _evaluation_response(result)


def _evaluation_response(result: AlertRuleEvaluationResult) -> AlertRuleEvaluationResponse:
    observed = None
    if result.observed is not None:
        observed = AlertRuleEvaluationObservedResponse(
            value=result.observed.value,
            sample_count=result.observed.sample_count,
            aggregation=result.observed.aggregation,
            unit=result.observed.unit,
        )
    return AlertRuleEvaluationResponse(
        project_id=result.project_id,
        rule_id=result.rule_id,
        status=result.status,
        signal=result.signal,
        severity=result.severity,
        checked_at=result.checked_at,
        window=AlertRuleEvaluationWindowResponse(
            from_=result.window.start,
            to=result.window.end,
            window_seconds=result.window.window_seconds,
            interval_seconds=result.window.interval_seconds,
        ),
        condition=AlertRuleEvaluationConditionResponse(
            metric=result.condition.metric,
            source=result.condition.source,
            operator=result.condition.operator,
            threshold=result.condition.threshold,
            aggregation=result.condition.aggregation,
        ),
        observed=observed,
        message=result.message,
    )
