from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.auth import UserModel
from app.services.errors import DuplicateResourceError


@dataclass(frozen=True)
class UserRecord:
    id: int
    username: str
    email: str | None
    password_hash: str
    display_name: str | None
    is_active: bool
    is_superuser: bool
    created_at: datetime


class AuthRepository(Protocol):
    def get_user_by_id(self, user_id: int) -> UserRecord | None: ...

    def get_user_by_username(self, username: str) -> UserRecord | None: ...

    def create_user(
        self,
        *,
        username: str,
        email: str | None,
        password_hash: str,
        display_name: str | None,
        is_active: bool = True,
        is_superuser: bool = False,
    ) -> UserRecord: ...


def _user_record(model: UserModel) -> UserRecord:
    return UserRecord(
        id=model.id,
        username=model.username,
        email=model.email,
        password_hash=model.password_hash,
        display_name=model.display_name,
        is_active=model.is_active,
        is_superuser=model.is_superuser,
        created_at=model.created_at,
    )


class SqlAlchemyAuthRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_user_by_id(self, user_id: int) -> UserRecord | None:
        user = self._session.get(UserModel, user_id)
        if user is None:
            return None
        return _user_record(user)

    def get_user_by_username(self, username: str) -> UserRecord | None:
        user = self._session.scalar(select(UserModel).where(UserModel.username == username))
        if user is None:
            return None
        return _user_record(user)

    def create_user(
        self,
        *,
        username: str,
        email: str | None,
        password_hash: str,
        display_name: str | None,
        is_active: bool = True,
        is_superuser: bool = False,
    ) -> UserRecord:
        user = UserModel(
            username=username,
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            is_active=is_active,
            is_superuser=is_superuser,
        )
        self._session.add(user)
        try:
            self._session.commit()
        except IntegrityError as error:
            self._session.rollback()
            raise DuplicateResourceError("用户 username 或 email 已存在") from error
        self._session.refresh(user)
        return _user_record(user)
