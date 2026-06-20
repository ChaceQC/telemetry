from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.api_keys import ApiKeyModel
from app.repositories.unit_of_work import flush_or_commit
from app.schemas.api_keys import ApiKeyStatus
from app.services.errors import ResourceIntegrityError, ResourceNotFoundError


@dataclass(frozen=True)
class ApiKeyRecord:
    id: int
    project_id: int
    name: str
    key_prefix: str
    key_hash: str
    status: ApiKeyStatus
    created_by_user_id: int
    created_at: datetime
    revoked_at: datetime | None
    last_used_at: datetime | None


class ApiKeyRepository(Protocol):
    def list_project_api_keys(self, project_id: int) -> list[ApiKeyRecord]: ...

    def get_project_api_key(self, *, project_id: int, api_key_id: int) -> ApiKeyRecord | None: ...

    def get_active_api_key_by_hash(self, key_hash: str) -> ApiKeyRecord | None: ...

    def create_api_key(
        self,
        *,
        project_id: int,
        name: str,
        key_prefix: str,
        key_hash: str,
        created_by_user_id: int,
    ) -> ApiKeyRecord: ...

    def revoke_api_key(self, *, project_id: int, api_key_id: int) -> ApiKeyRecord: ...

    def mark_last_used(self, api_key_id: int, used_at: datetime) -> ApiKeyRecord | None: ...


def _api_key_record(model: ApiKeyModel) -> ApiKeyRecord:
    return ApiKeyRecord(
        id=model.id,
        project_id=model.project_id,
        name=model.name,
        key_prefix=model.key_prefix,
        key_hash=model.key_hash,
        status=ApiKeyStatus(model.status),
        created_by_user_id=model.created_by_user_id,
        created_at=model.created_at,
        revoked_at=model.revoked_at,
        last_used_at=model.last_used_at,
    )


class SqlAlchemyApiKeyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_project_api_keys(self, project_id: int) -> list[ApiKeyRecord]:
        statement = (
            select(ApiKeyModel).where(ApiKeyModel.project_id == project_id).order_by(ApiKeyModel.id)
        )
        api_keys = self._session.scalars(statement).all()
        return [_api_key_record(api_key) for api_key in api_keys]

    def get_project_api_key(self, *, project_id: int, api_key_id: int) -> ApiKeyRecord | None:
        api_key = self._session.scalar(
            select(ApiKeyModel).where(
                ApiKeyModel.id == api_key_id,
                ApiKeyModel.project_id == project_id,
            )
        )
        if api_key is None:
            return None
        return _api_key_record(api_key)

    def get_active_api_key_by_hash(self, key_hash: str) -> ApiKeyRecord | None:
        api_key = self._session.scalar(
            select(ApiKeyModel).where(
                ApiKeyModel.key_hash == key_hash,
                ApiKeyModel.status == ApiKeyStatus.active.value,
                ApiKeyModel.revoked_at.is_(None),
            )
        )
        if api_key is None:
            return None
        return _api_key_record(api_key)

    def create_api_key(
        self,
        *,
        project_id: int,
        name: str,
        key_prefix: str,
        key_hash: str,
        created_by_user_id: int,
    ) -> ApiKeyRecord:
        api_key = ApiKeyModel(
            project_id=project_id,
            name=name,
            key_prefix=key_prefix,
            key_hash=key_hash,
            status=ApiKeyStatus.active.value,
            created_by_user_id=created_by_user_id,
        )
        self._session.add(api_key)
        try:
            flush_or_commit(self._session)
        except IntegrityError as error:
            self._session.rollback()
            raise ResourceIntegrityError("API Key 完整性约束错误") from error
        self._session.refresh(api_key)
        return _api_key_record(api_key)

    def revoke_api_key(self, *, project_id: int, api_key_id: int) -> ApiKeyRecord:
        api_key = self._session.scalar(
            select(ApiKeyModel).where(
                ApiKeyModel.id == api_key_id,
                ApiKeyModel.project_id == project_id,
            )
        )
        if api_key is None:
            raise ResourceNotFoundError("API Key 不存在")
        if api_key.status != ApiKeyStatus.revoked.value:
            api_key.status = ApiKeyStatus.revoked.value
            api_key.revoked_at = datetime.now(UTC)
        flush_or_commit(self._session)
        self._session.refresh(api_key)
        return _api_key_record(api_key)

    def mark_last_used(self, api_key_id: int, used_at: datetime) -> ApiKeyRecord | None:
        api_key = self._session.get(ApiKeyModel, api_key_id)
        if api_key is None:
            return None
        api_key.last_used_at = used_at
        flush_or_commit(self._session)
        self._session.refresh(api_key)
        return _api_key_record(api_key)
