from hashlib import sha256
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.dependencies import get_auth_login_rate_limiter, get_auth_service, get_current_user
from app.repositories.auth import UserRecord
from app.schemas.auth import CurrentUserResponse, LoginRequest, LoginResponse, LogoutResponse
from app.services.auth import AuthConfigurationError, AuthenticationError, AuthService
from app.services.rate_limit import RateLimiter, RateLimiterUnavailableError, RateLimitExceededError
from app.services.session_cookies import clear_auth_cookies, generate_csrf_token, set_auth_cookies

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _client_rate_limit_host(request: Request) -> str:
    if request.client is None:
        return "unknown"
    return request.client.host


def _login_rate_limit_subject(username: str) -> str:
    return sha256(username.strip().lower().encode("utf-8")).hexdigest()[:16]


@router.post("/login", response_model=LoginResponse, summary="用户登录")
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    rate_limiter: Annotated[RateLimiter, Depends(get_auth_login_rate_limiter)],
) -> LoginResponse:
    try:
        rate_limiter.check(
            key=(
                "rate_limit:auth_login:"
                f"{_client_rate_limit_host(request)}:{_login_rate_limit_subject(payload.username)}"
            ),
            now=getattr(request.state, "rate_limit_now", None),
        )
    except RateLimitExceededError as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录尝试过于频繁",
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error
    except RateLimiterUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="认证限流服务不可用",
        ) from error

    try:
        user = auth_service.authenticate(
            username=payload.username,
            password=payload.password.get_secret_value(),
        )
        access_token, expires_in = auth_service.create_access_token(user)
        set_auth_cookies(
            response,
            settings=request.app.state.settings,
            session_token=access_token,
            csrf_token=generate_csrf_token(),
            max_age_seconds=expires_in,
        )
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

    return LoginResponse(
        expires_in=expires_in,
        csrf_header_name=request.app.state.settings.auth_csrf_header_name,
        user=CurrentUserResponse.model_validate(user),
    )


@router.post("/logout", response_model=LogoutResponse, summary="退出登录")
def logout(
    request: Request,
    response: Response,
    _current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> LogoutResponse:
    clear_auth_cookies(response, settings=request.app.state.settings)
    return LogoutResponse()


@router.get("/me", response_model=CurrentUserResponse, summary="读取当前用户")
def read_current_user(
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> CurrentUserResponse:
    return CurrentUserResponse.model_validate(current_user)
