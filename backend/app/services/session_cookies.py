from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from starlette.responses import Response

from app.core.config import Settings

CSRF_TOKEN_BYTES = 32
CookieSameSite = Literal["lax", "strict", "none"]


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(CSRF_TOKEN_BYTES)


def set_auth_cookies(
    response: Response,
    *,
    settings: Settings,
    session_token: str,
    csrf_token: str,
    max_age_seconds: int,
) -> None:
    expires_at = datetime.now(UTC) + timedelta(seconds=max_age_seconds)
    samesite = _cookie_samesite(settings)
    response.set_cookie(
        key=settings.auth_session_cookie_name,
        value=session_token,
        max_age=max_age_seconds,
        expires=expires_at,
        path=settings.auth_cookie_path,
        secure=settings.auth_cookie_secure_value,
        httponly=True,
        samesite=samesite,
    )
    response.set_cookie(
        key=settings.auth_csrf_cookie_name,
        value=csrf_token,
        max_age=max_age_seconds,
        expires=expires_at,
        path=settings.auth_cookie_path,
        secure=settings.auth_cookie_secure_value,
        httponly=False,
        samesite=samesite,
    )


def clear_auth_cookies(response: Response, *, settings: Settings) -> None:
    samesite = _cookie_samesite(settings)
    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        path=settings.auth_cookie_path,
        secure=settings.auth_cookie_secure_value,
        httponly=True,
        samesite=samesite,
    )
    response.delete_cookie(
        key=settings.auth_csrf_cookie_name,
        path=settings.auth_cookie_path,
        secure=settings.auth_cookie_secure_value,
        httponly=False,
        samesite=samesite,
    )


def _cookie_samesite(settings: Settings) -> CookieSameSite:
    return cast(CookieSameSite, settings.auth_cookie_samesite)
