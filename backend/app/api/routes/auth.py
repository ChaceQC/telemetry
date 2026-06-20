from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_auth_service, get_current_user
from app.repositories.auth import UserRecord
from app.schemas.auth import CurrentUserResponse, LoginRequest, TokenResponse
from app.services.auth import AuthConfigurationError, AuthenticationError, AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse, summary="用户登录")
def login(
    payload: LoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    try:
        user = auth_service.authenticate(
            username=payload.username,
            password=payload.password.get_secret_value(),
        )
        access_token, expires_in = auth_service.create_access_token(user)
    except AuthConfigurationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="认证服务未配置",
        ) from error
    except AuthenticationError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    return TokenResponse(access_token=access_token, expires_in=expires_in)


@router.get("/me", response_model=CurrentUserResponse, summary="读取当前用户")
def read_current_user(
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> CurrentUserResponse:
    return CurrentUserResponse.model_validate(current_user)
