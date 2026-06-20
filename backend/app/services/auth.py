from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import Settings
from app.repositories.auth import AuthRepository, UserRecord

MIN_AUTH_SECRET_KEY_BYTES = 32
DUMMY_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$FlahiO4qQ59xlw40aA3AmA"
    "$cHvXRvzEgrETnOY2gb3uMpPEBmIDXA81oquvtpIpq68"
)


class AuthenticationError(Exception):
    """登录凭据或 token 无法通过认证。"""


class InactiveUserError(AuthenticationError):
    """用户存在但已停用。"""


class AuthConfigurationError(Exception):
    """认证配置缺失或不安全。"""


password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


class AuthService:
    def __init__(self, repository: AuthRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    def authenticate(self, *, username: str, password: str) -> UserRecord:
        user = self._repository.get_user_by_username(username)
        password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
        password_matches = verify_password(password, password_hash)
        if user is None or not password_matches or not user.is_active:
            raise AuthenticationError("用户名或密码错误")
        return user

    def create_access_token(self, user: UserRecord) -> tuple[str, int]:
        expires_delta = timedelta(minutes=self._settings.auth_access_token_expire_minutes)
        expires_at = datetime.now(UTC) + expires_delta
        payload = {
            "sub": str(user.id),
            "iat": datetime.now(UTC),
            "exp": expires_at,
        }
        token = jwt.encode(
            payload,
            self._secret_key(),
            algorithm=self._settings.auth_token_algorithm,
        )
        return token, int(expires_delta.total_seconds())

    def get_user_from_token(self, token: str) -> UserRecord:
        try:
            payload = jwt.decode(
                token,
                self._secret_key(),
                algorithms=[self._settings.auth_token_algorithm],
            )
        except InvalidTokenError as error:
            raise AuthenticationError("无效或已过期的访问令牌") from error

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject.isdigit():
            raise AuthenticationError("访问令牌缺少有效用户标识")

        user = self._repository.get_user_by_id(int(subject))
        if user is None:
            raise AuthenticationError("访问令牌对应用户不存在")
        if not user.is_active:
            raise InactiveUserError("用户已停用")
        return user

    def _secret_key(self) -> str:
        secret = self._settings.auth_secret_key
        if secret is None or not secret.get_secret_value():
            raise AuthConfigurationError("AUTH_SECRET_KEY 未配置")
        secret_value = secret.get_secret_value()
        if len(secret_value.encode("utf-8")) < MIN_AUTH_SECRET_KEY_BYTES:
            raise AuthConfigurationError(
                f"AUTH_SECRET_KEY 至少需要 {MIN_AUTH_SECRET_KEY_BYTES} 字节"
            )
        return secret_value
