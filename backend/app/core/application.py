from math import isfinite
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.db.session import create_database_engine, create_session_factory
from app.repositories.ingest import SqlAlchemyIngestRepository
from app.schemas.ingest import IngestKind
from app.services.ingest import IngestService
from app.services.rate_limit import create_fixed_window_rate_limiter, create_ingest_rate_limiter


def _json_safe_value(value: Any) -> Any:
    if isinstance(value, float) and not isfinite(value):
        if value != value:
            return "NaN"
        if value > 0:
            return "Infinity"
        return "-Infinity"
    if isinstance(value, dict):
        return {key: _json_safe_value(nested_value) for key, nested_value in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe_value(nested_value) for nested_value in value]
    return value


def _ingest_kind_from_path(path: str) -> IngestKind | None:
    if path.endswith("/api/v1/ingest/events") or path.endswith("/api/v1/ingest/batch"):
        return IngestKind.event
    if path.endswith("/api/v1/ingest/metrics"):
        return IngestKind.metric
    if path.endswith("/api/v1/ingest/logs"):
        return IngestKind.log
    if path.endswith("/api/v1/ingest/traces"):
        return IngestKind.trace
    return None


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    db_engine = create_database_engine(resolved_settings.database_url)
    db_session_factory = create_session_factory(db_engine)
    openapi_url = resolved_settings.openapi_url
    app = FastAPI(
        title=resolved_settings.app_name,
        version=resolved_settings.app_version,
        root_path=resolved_settings.root_path,
        openapi_url=openapi_url,
        docs_url=resolved_settings.docs_url if openapi_url is not None else None,
        redoc_url=resolved_settings.redoc_url if openapi_url is not None else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_allowed_origin_list,
        allow_credentials=resolved_settings.cors_allow_credentials,
        allow_methods=resolved_settings.cors_allowed_method_list,
        allow_headers=resolved_settings.cors_allowed_header_list,
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=resolved_settings.trusted_host_list,
    )
    app.state.settings = resolved_settings
    app.state.db_engine = db_engine
    app.state.db_session_factory = db_session_factory
    app.state.auth_login_rate_limiter = create_fixed_window_rate_limiter(
        enabled=resolved_settings.auth_login_rate_limit_enabled,
        limit=resolved_settings.auth_login_rate_limit_per_minute,
        window_seconds=60,
        backend=resolved_settings.auth_login_rate_limit_backend,
        redis_url=resolved_settings.redis_url,
        key_prefix=resolved_settings.ingest_rate_limit_key_prefix,
        unavailable_message="认证限流服务不可用",
    )
    app.state.ingest_rate_limiter = create_ingest_rate_limiter(
        enabled=resolved_settings.ingest_rate_limit_enabled,
        limit=resolved_settings.ingest_rate_limit_per_minute,
        window_seconds=60,
        backend=resolved_settings.ingest_rate_limit_backend,
        redis_url=resolved_settings.redis_url,
        key_prefix=resolved_settings.ingest_rate_limit_key_prefix,
    )
    app.state.ingest_api_key_precheck_rate_limiter = create_fixed_window_rate_limiter(
        enabled=resolved_settings.ingest_api_key_precheck_rate_limit_enabled,
        limit=resolved_settings.ingest_api_key_precheck_rate_limit_per_minute,
        window_seconds=60,
        backend=resolved_settings.ingest_api_key_precheck_rate_limit_backend,
        redis_url=resolved_settings.redis_url,
        key_prefix=resolved_settings.ingest_rate_limit_key_prefix,
        unavailable_message="摄入预验证限流服务不可用",
    )

    @app.middleware("http")
    async def security_headers_middleware(request: Request, call_next: Any) -> Response:
        response: Response = await call_next(request)
        if not resolved_settings.security_headers_enabled:
            return response
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        if resolved_settings.security_headers_csp:
            response.headers.setdefault(
                "Content-Security-Policy",
                resolved_settings.security_headers_csp,
            )
        return response

    @app.exception_handler(RequestValidationError)
    async def request_validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        ingest_context = getattr(request.state, "ingest_api_key_context", None)
        ingest_kind = _ingest_kind_from_path(request.url.path)
        if ingest_context is not None and ingest_kind is not None:
            with request.app.state.db_session_factory() as session:
                IngestService(SqlAlchemyIngestRepository(session)).record_rejected(
                    context=ingest_context,
                    kind=ingest_kind,
                )
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder({"detail": _json_safe_value(exc.errors())}),
        )

    app.include_router(api_router)
    return app
