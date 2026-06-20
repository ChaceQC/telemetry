from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, SecretStr


class AuthSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class LoginRequest(AuthSchema):
    username: str = Field(min_length=1, max_length=64)
    password: SecretStr = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class CurrentUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None
    display_name: str | None
    is_active: bool
    is_superuser: bool
    created_at: datetime
