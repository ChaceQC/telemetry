from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status

from app.api.dependencies import get_api_key_service, get_current_user
from app.repositories.auth import UserRecord
from app.schemas.api_keys import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyResponse
from app.services.api_keys import ApiKeyService
from app.services.errors import (
    ResourceForbiddenError,
    ResourceIntegrityError,
    ResourceNotFoundError,
)

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/api-keys",
    tags=["api-keys"],
    dependencies=[Depends(get_current_user)],
)


def _map_api_key_error(error: Exception) -> HTTPException:
    if isinstance(error, ResourceNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    if isinstance(error, ResourceForbiddenError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if isinstance(error, ResourceIntegrityError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="API Key 错误")


@router.get("", response_model=list[ApiKeyResponse], summary="列出项目 API Key")
def list_project_api_keys(
    api_key_service: Annotated[ApiKeyService, Depends(get_api_key_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
) -> list[ApiKeyResponse]:
    try:
        api_keys = api_key_service.list_project_api_keys(project_id=project_id, user=current_user)
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_api_key_error(error) from error
    return [ApiKeyResponse.model_validate(api_key) for api_key in api_keys]


@router.post(
    "",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建项目 API Key",
)
def create_project_api_key(
    payload: ApiKeyCreate,
    api_key_service: Annotated[ApiKeyService, Depends(get_api_key_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
) -> ApiKeyCreateResponse:
    try:
        created = api_key_service.create_project_api_key(
            project_id=project_id,
            payload=payload,
            user=current_user,
        )
    except (ResourceForbiddenError, ResourceIntegrityError, ResourceNotFoundError) as error:
        raise _map_api_key_error(error) from error
    return ApiKeyCreateResponse.model_validate(
        {
            **created.record.__dict__,
            "api_key": created.raw_key,
        }
    )


@router.post(
    "/{api_key_id}/revoke",
    response_model=ApiKeyResponse,
    summary="撤销项目 API Key",
)
def revoke_project_api_key(
    api_key_service: Annotated[ApiKeyService, Depends(get_api_key_service)],
    current_user: Annotated[UserRecord, Depends(get_current_user)],
    project_id: Annotated[int, Path(gt=0)],
    api_key_id: Annotated[int, Path(gt=0)],
) -> ApiKeyResponse:
    try:
        api_key = api_key_service.revoke_project_api_key(
            project_id=project_id,
            api_key_id=api_key_id,
            user=current_user,
        )
    except (ResourceForbiddenError, ResourceNotFoundError) as error:
        raise _map_api_key_error(error) from error
    return ApiKeyResponse.model_validate(api_key)
