from collections.abc import Iterator
from secrets import compare_digest
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.repositories.alerts import SqlAlchemyAlertRuleRepository
from app.repositories.api_keys import SqlAlchemyApiKeyRepository
from app.repositories.auth import SqlAlchemyAuthRepository, UserRecord
from app.repositories.dashboard import SqlAlchemyDashboardRepository
from app.repositories.ingest import SqlAlchemyIngestRepository
from app.repositories.management import SqlAlchemyManagementRepository
from app.repositories.permissions import SqlAlchemyPermissionRepository
from app.repositories.query import SqlAlchemyQueryRepository
from app.schemas.ingest import IngestKind
from app.services.alerts import AlertRuleService
from app.services.api_keys import ApiKeyService, ApiKeyVerification
from app.services.auth import AuthConfigurationError, AuthenticationError, AuthService
from app.services.dashboard import DashboardService
from app.services.ingest import IngestService
from app.services.management import ManagementService
from app.services.permissions import PermissionService
from app.services.query import QueryService
from app.services.rate_limit import RateLimiter, RateLimiterUnavailableError, RateLimitExceededError

bearer_scheme = HTTPBearer(auto_error=False)
SAFE_HTTP_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})


def ingest_kind_from_path(path: str) -> IngestKind | None:
    if path.endswith("/api/v1/ingest/events") or path.endswith("/api/v1/ingest/batch"):
        return IngestKind.event
    if path.endswith("/api/v1/ingest/metrics"):
        return IngestKind.metric
    if path.endswith("/api/v1/ingest/logs"):
        return IngestKind.log
    if path.endswith("/api/v1/ingest/traces"):
        return IngestKind.trace
    return None


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


def get_dashboard_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> DashboardService:
    permission_service = PermissionService(SqlAlchemyPermissionRepository(session))
    management_repository = SqlAlchemyManagementRepository(session)
    return DashboardService(
        SqlAlchemyDashboardRepository(session),
        management_repository,
        permission_service,
    )


def get_alert_rule_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> AlertRuleService:
    permission_service = PermissionService(SqlAlchemyPermissionRepository(session))
    management_repository = SqlAlchemyManagementRepository(session)
    return AlertRuleService(
        SqlAlchemyAlertRuleRepository(session),
        SqlAlchemyQueryRepository(session),
        management_repository,
        permission_service,
    )


def get_ingest_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> IngestService:
    permission_service = PermissionService(SqlAlchemyPermissionRepository(session))
    return IngestService(SqlAlchemyIngestRepository(session), permission_service)


def get_query_service(
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
) -> QueryService:
    permission_service = PermissionService(SqlAlchemyPermissionRepository(session))
    management_repository = SqlAlchemyManagementRepository(session)
    return QueryService(
        SqlAlchemyQueryRepository(session),
        permission_service,
        management_repository,
        trace_topology_span_scan_limit=(
            request.app.state.settings.query_trace_topology_span_scan_limit
        ),
    )


def get_ingest_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.ingest_rate_limiter


def get_auth_login_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.auth_login_rate_limiter


def get_ingest_api_key_precheck_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.ingest_api_key_precheck_rate_limiter


def _client_rate_limit_host(request: Request) -> str:
    if request.client is None:
        return "unknown"
    return request.client.host


def get_ingest_api_key_context(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    api_key_service: Annotated[ApiKeyService, Depends(get_api_key_service)],
    rate_limiter: Annotated[RateLimiter, Depends(get_ingest_rate_limiter)],
    precheck_rate_limiter: Annotated[
        RateLimiter,
        Depends(get_ingest_api_key_precheck_rate_limiter),
    ],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> ApiKeyVerification:
    raw_key = credentials.credentials if credentials is not None else x_api_key
    if raw_key is None or raw_key.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 API Key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    normalized_key = raw_key.strip()
    try:
        precheck_rate_limiter.check(
            key=f"rate_limit:ingest_api_key_precheck:{_client_rate_limit_host(request)}",
            now=getattr(request.state, "rate_limit_now", None),
        )
    except RateLimitExceededError as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="摄入认证尝试过于频繁",
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error
    except RateLimiterUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="摄入预验证限流服务不可用",
        ) from error

    context = api_key_service.verify_key(normalized_key)
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key 无效或已撤销",
            headers={"WWW-Authenticate": "Bearer"},
        )
    request.state.ingest_api_key_context = context
    try:
        rate_limiter.check(
            key=f"rate_limit:api_key:{context.api_key_id}",
            now=getattr(request.state, "rate_limit_now", None),
        )
    except RateLimitExceededError as error:
        ingest_kind = ingest_kind_from_path(request.url.path)
        if ingest_kind is not None:
            with request.app.state.db_session_factory() as session:
                ingest_service = IngestService(SqlAlchemyIngestRepository(session))
                ingest_service.record_rejected(context=context, kind=ingest_kind)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="摄入请求过于频繁",
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error
    except RateLimiterUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="摄入限流服务不可用",
        ) from error
    return context


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> UserRecord:
    settings = request.app.state.settings
    cookie_token = request.cookies.get(settings.auth_session_cookie_name)
    if cookie_token is not None and cookie_token.strip():
        token = cookie_token
        token_source = "cookie"
    elif credentials is not None and credentials.credentials.strip():
        token = credentials.credentials
        token_source = "bearer"
    else:
        token = None
        token_source = "missing"

    if token is None or token.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少访问令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token_source == "cookie" and request.method.upper() not in SAFE_HTTP_METHODS:
        _validate_csrf_token(request)

    try:
        return auth_service.get_user_from_token(token.strip())
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


def _validate_csrf_token(request: Request) -> None:
    settings = request.app.state.settings
    cookie_token = request.cookies.get(settings.auth_csrf_cookie_name)
    header_token = request.headers.get(settings.auth_csrf_header_name)
    if (
        cookie_token is None
        or header_token is None
        or not compare_digest(cookie_token, header_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token 无效",
        )
