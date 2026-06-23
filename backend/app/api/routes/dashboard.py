from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.api.dependencies import get_current_user, get_dashboard_service
from app.repositories.auth import UserRecord
from app.schemas.dashboard import (
    DashboardCreate,
    DashboardListResponse,
    DashboardResponse,
    DashboardUpdate,
)
from app.services.dashboard import DashboardService
from app.services.errors import (
    ResourceForbiddenError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)

router = APIRouter(
    prefix="/api/v1",
    tags=["dashboards"],
    dependencies=[Depends(get_current_user)],
)


def _map_dashboard_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, ResourceForbiddenError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if isinstance(error, ResourceIntegrityError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="仪表盘接口错误")


@router.get(
    "/dashboards",
    response_model=DashboardListResponse,
    summary="列出仪表盘",
)
def list_dashboards(
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(gt=0, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> DashboardListResponse:
    try:
        page = dashboard_service.list_dashboards(
            user=current_user,
            project_id=project_id,
            limit=limit,
            offset=offset,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardListResponse(
        items=[DashboardResponse.model_validate(dashboard) for dashboard in page.items],
        limit=limit,
        offset=offset,
        total=page.total,
    )


@router.post(
    "/dashboards",
    response_model=DashboardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建仪表盘",
)
def create_dashboard(
    payload: DashboardCreate,
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> DashboardResponse:
    try:
        dashboard = dashboard_service.create_dashboard(payload=payload, user=current_user)
    except (ResourceForbiddenError, ResourceIntegrityError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardResponse.model_validate(dashboard)


@router.get(
    "/projects/{project_id}/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="读取仪表盘",
)
def get_project_dashboard(
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    dashboard_id: Annotated[int, Path(gt=0)],
) -> DashboardResponse:
    try:
        dashboard = dashboard_service.get_dashboard(
            user=current_user,
            project_id=project_id,
            dashboard_id=dashboard_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardResponse.model_validate(dashboard)


@router.patch(
    "/projects/{project_id}/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="更新仪表盘",
)
def update_project_dashboard(
    payload: DashboardUpdate,
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    dashboard_id: Annotated[int, Path(gt=0)],
) -> DashboardResponse:
    try:
        dashboard = dashboard_service.update_dashboard(
            user=current_user,
            project_id=project_id,
            dashboard_id=dashboard_id,
            payload=payload,
        )
    except (ResourceForbiddenError, ResourceIntegrityError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
    return DashboardResponse.model_validate(dashboard)


@router.delete(
    "/projects/{project_id}/dashboards/{dashboard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除仪表盘",
)
def delete_project_dashboard(
    dashboard_service: Annotated[DashboardService, Depends(get_dashboard_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    dashboard_id: Annotated[int, Path(gt=0)],
) -> None:
    try:
        dashboard_service.delete_dashboard(
            user=current_user,
            project_id=project_id,
            dashboard_id=dashboard_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_dashboard_error(error) from error
