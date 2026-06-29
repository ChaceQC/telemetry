from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr


class AuthSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginRequest(AuthSchema):
    username: str = Field(min_length=1, max_length=64)
    password: SecretStr = Field(min_length=1, max_length=256)


class LogoutResponse(BaseModel):
    status: str = "ok"


class CurrentUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None
    display_name: str | None
    is_active: bool
    is_superuser: bool
    created_at: datetime


class LoginResponse(BaseModel):
    auth_scheme: Literal["cookie"] = "cookie"
    expires_in: int
    csrf_header_name: str
    user: CurrentUserResponse
