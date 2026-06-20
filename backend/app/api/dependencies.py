from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.repositories.api_keys import SqlAlchemyApiKeyRepository
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.ingest import SqlAlchemyIngestRepository
from app.repositories.management import SqlAlchemyManagementRepository
from app.repositories.permissions import SqlAlchemyPermissionRepository
from app.services.api_keys import ApiKeyService, ApiKeyVerification
from app.services.auth import AuthConfigurationError, AuthenticationError, AuthService
from app.services.ingest import IngestService
from app.services.management import ManagementService
from app.services.permissions import PermissionService
from app.services.rate_limit import RateLimiter, RateLimitExceededError

bearer_scheme = HTTPBearer(auto_error=False)


def get_db_session(request: Request) -> Iterator[Session]:
    session_factory = request.app.state.db_session_factory
    with session_factory() as session:
        yield session


def get_management_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ManagementService:
    permission_service = PermissionService(SqlAlchemyPermissionRepository(session))
    return ManagementService(SqlAlchemyManagementRepository(session), permission_service)


def get_auth_service(
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
) -> AuthService:
    return AuthService(SqlAlchemyAuthRepository(session), request.app.state.settings)


def get_api_key_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> ApiKeyService:
    permission_service = PermissionService(SqlAlchemyPermissionRepository(session))
    management_repository = SqlAlchemyManagementRepository(session)
    return ApiKeyService(
        SqlAlchemyApiKeyRepository(session),
        management_repository,
        permission_service,
    )


def get_ingest_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> IngestService:
    return IngestService(SqlAlchemyIngestRepository(session))


def get_ingest_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.ingest_rate_limiter


def get_ingest_api_key_context(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    api_key_service: Annotated[ApiKeyService, Depends(get_api_key_service)],
    rate_limiter: Annotated[RateLimiter, Depends(get_ingest_rate_limiter)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> ApiKeyVerification:
    raw_key = credentials.credentials if credentials is not None else x_api_key
    if raw_key is None or raw_key.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 API Key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    context = api_key_service.verify_key(raw_key.strip())
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key 无效或已撤销",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        rate_limiter.check(
            key=f"rate_limit:api_key:{context.api_key_id}",
            now=getattr(request.state, "rate_limit_now", None),
        )
    except RateLimitExceededError as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="摄入请求过于频繁",
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error
    return context


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserRecord:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少访问令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return auth_service.get_user_from_token(credentials.credentials)
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
