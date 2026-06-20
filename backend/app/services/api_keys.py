from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from app.repositories.api_keys import ApiKeyRecord, ApiKeyRepository
from app.repositories.auth import UserRecord
from app.repositories.management import ManagementRepository
from app.schemas.api_keys import ApiKeyCreate
from app.schemas.permissions import ProjectRole, role_includes
from app.services.errors import ResourceForbiddenError, ResourceNotFoundError
from app.services.permissions import PermissionService

API_KEY_PREFIX_LENGTH = 12


@dataclass(frozen=True)
class CreatedApiKey:
    record: ApiKeyRecord
    raw_key: str


@dataclass(frozen=True)
class ApiKeyVerification:
    api_key_id: int
    project_id: int
    key_prefix: str


class ApiKeyService:
    def __init__(
        self,
        repository: ApiKeyRepository,
        management_repository: ManagementRepository,
        permission_service: PermissionService,
    ) -> None:
        self._repository = repository
        self._management_repository = management_repository
        self._permission_service = permission_service

    def list_project_api_keys(self, *, project_id: int, user: UserRecord) -> list[ApiKeyRecord]:
        self._ensure_project_admin(project_id=project_id, user=user)
        return self._repository.list_project_api_keys(project_id)

    def create_project_api_key(
        self,
        *,
        project_id: int,
        payload: ApiKeyCreate,
        user: UserRecord,
    ) -> CreatedApiKey:
        self._ensure_project_admin(project_id=project_id, user=user)
        raw_key = generate_api_key()
        record = self._repository.create_api_key(
            project_id=project_id,
            name=payload.name,
            key_prefix=api_key_prefix(raw_key),
            key_hash=hash_api_key(raw_key),
            created_by_user_id=user.id,
        )
        return CreatedApiKey(record=record, raw_key=raw_key)

    def revoke_project_api_key(
        self,
        *,
        project_id: int,
        api_key_id: int,
        user: UserRecord,
    ) -> ApiKeyRecord:
        self._ensure_project_admin(project_id=project_id, user=user)
        return self._repository.revoke_api_key(project_id=project_id, api_key_id=api_key_id)

    def verify_key(self, raw_key: str) -> ApiKeyVerification | None:
        key_hash = hash_api_key(raw_key)
        record = self._repository.get_active_api_key_by_hash(key_hash)
        if record is None:
            return None
        self._repository.mark_last_used(record.id, datetime.now(UTC))
        return ApiKeyVerification(
            api_key_id=record.id,
            project_id=record.project_id,
            key_prefix=record.key_prefix,
        )

    def _ensure_project_admin(self, *, project_id: int, user: UserRecord) -> None:
        if user.is_superuser:
            if self._management_repository.get_project(project_id) is None:
                raise ResourceNotFoundError("项目不存在")
            return

        role = self._permission_service.get_project_role(user=user, project_id=project_id)
        if role is None:
            raise ResourceNotFoundError("项目不存在")
        if self._management_repository.get_project(project_id) is None:
            raise ResourceNotFoundError("项目不存在")
        if not role_includes(role, ProjectRole.admin):
            raise ResourceForbiddenError("无项目权限")


def generate_api_key() -> str:
    return f"tlm_{secrets.token_urlsafe(32)}"


def api_key_prefix(raw_key: str) -> str:
    return raw_key[:API_KEY_PREFIX_LENGTH]


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
