from math import isfinite
from typing import Any

from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.db.session import create_database_engine, create_session_factory
from app.services.rate_limit import InMemoryFixedWindowRateLimiter


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


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    db_engine = create_database_engine(resolved_settings.database_url)
    db_session_factory = create_session_factory(db_engine)
    app = FastAPI(
        title=resolved_settings.app_name,
        version=resolved_settings.app_version,
        root_path=resolved_settings.root_path,
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
    app.state.ingest_rate_limiter = InMemoryFixedWindowRateLimiter(
        enabled=resolved_settings.ingest_rate_limit_enabled,
        limit=resolved_settings.ingest_rate_limit_per_minute,
        window_seconds=60,
    )

    @app.exception_handler(RequestValidationError)
    async def request_validation_exception_handler(
        _request: object,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder({"detail": _json_safe_value(exc.errors())}),
        )

    app.include_router(api_router)
    return app
