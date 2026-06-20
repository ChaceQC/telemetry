from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user, get_management_service
from app.repositories.auth import UserRecord
from app.schemas.management import (
    EnvironmentCreate,
    EnvironmentResponse,
    ProjectCreate,
    ProjectResponse,
    ServiceCreate,
    ServiceResponse,
)
from app.services.errors import (
    DuplicateResourceError,
    ResourceConflictError,
    ResourceForbiddenError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)
from app.services.management import ManagementService

router = APIRouter(
    prefix="/api/v1",
    tags=["management"],
    dependencies=[Depends(get_current_user)],
)


def _map_management_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, DuplicateResourceError | ResourceConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    if isinstance(error, ResourceIntegrityError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    if isinstance(error, ResourceForbiddenError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="管理接口错误")


@router.get("/projects", response_model=list[ProjectResponse], summary="列出项目")
def list_projects(
    management_service: Annotated[ManagementService, Depends(get_management_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> list[ProjectResponse]:
    return [
        ProjectResponse.model_validate(project)
        for project in management_service.list_projects(current_user)
    ]


@router.post(
    "/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建项目",
)
def create_project(
    payload: ProjectCreate,
    management_service: Annotated[ManagementService, Depends(get_management_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> ProjectResponse:
    try:
        project = management_service.create_project(payload, current_user)
    except (
        DuplicateResourceError,
        ResourceConflictError,
        ResourceForbiddenError,
        ResourceIntegrityError,
        ResourceNotFoundError,
    ) as error:
        raise _map_management_error(error) from error
    return ProjectResponse.model_validate(project)


@router.get("/environments", response_model=list[EnvironmentResponse], summary="列出环境")
def list_environments(
    management_service: Annotated[ManagementService, Depends(get_management_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
) -> list[EnvironmentResponse]:
    try:
        environments = management_service.list_environments(current_user, project_id=project_id)
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_management_error(error) from error
    return [EnvironmentResponse.model_validate(environment) for environment in environments]


@router.post(
    "/environments",
    response_model=EnvironmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建环境",
)
def create_environment(
    payload: EnvironmentCreate,
    management_service: Annotated[ManagementService, Depends(get_management_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> EnvironmentResponse:
    try:
        environment = management_service.create_environment(payload, current_user)
    except (
        DuplicateResourceError,
        ResourceConflictError,
        ResourceForbiddenError,
        ResourceIntegrityError,
        ResourceNotFoundError,
    ) as error:
        raise _map_management_error(error) from error
    return EnvironmentResponse.model_validate(environment)


@router.get("/services", response_model=list[ServiceResponse], summary="列出服务")
def list_services(
    management_service: Annotated[ManagementService, Depends(get_management_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int | None, Query(gt=0)] = None,
    environment_id: Annotated[int | None, Query(gt=0)] = None,
) -> list[ServiceResponse]:
    try:
        services = management_service.list_services(
            current_user,
            project_id=project_id,
            environment_id=environment_id,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_management_error(error) from error
    return [ServiceResponse.model_validate(service) for service in services]


@router.post(
    "/services",
    response_model=ServiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建服务",
)
def create_service(
    payload: ServiceCreate,
    management_service: Annotated[ManagementService, Depends(get_management_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> ServiceResponse:
    try:
        service = management_service.create_service(payload, current_user)
    except (
        DuplicateResourceError,
        ResourceConflictError,
        ResourceForbiddenError,
        ResourceIntegrityError,
        ResourceNotFoundError,
    ) as error:
        raise _map_management_error(error) from error
    return ServiceResponse.model_validate(service)
