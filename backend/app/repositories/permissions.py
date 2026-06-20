from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.permissions import ProjectMemberModel, TeamMemberModel, TeamModel
from app.repositories.unit_of_work import flush_or_commit
from app.schemas.permissions import ProjectRole
from app.services.errors import DuplicateResourceError, ResourceIntegrityError


@dataclass(frozen=True)
class TeamRecord:
    id: int
    name: str
    key: str
    description: str | None
    created_at: datetime


@dataclass(frozen=True)
class TeamMemberRecord:
    id: int
    team_id: int
    user_id: int
    created_at: datetime


@dataclass(frozen=True)
class ProjectMemberRecord:
    id: int
    project_id: int
    user_id: int
    role: ProjectRole
    created_at: datetime


class PermissionRepository(Protocol):
    def get_user_project_role(self, *, user_id: int, project_id: int) -> ProjectRole | None: ...

    def list_user_project_ids(self, user_id: int) -> list[int]: ...

    def add_project_member(
        self,
        *,
        project_id: int,
        user_id: int,
        role: ProjectRole,
    ) -> ProjectMemberRecord: ...


def _project_member_record(model: ProjectMemberModel) -> ProjectMemberRecord:
    return ProjectMemberRecord(
        id=model.id,
        project_id=model.project_id,
        user_id=model.user_id,
        role=ProjectRole(model.role),
        created_at=model.created_at,
    )


def _team_record(model: TeamModel) -> TeamRecord:
    return TeamRecord(
        id=model.id,
        name=model.name,
        key=model.key,
        description=model.description,
        created_at=model.created_at,
    )


def _team_member_record(model: TeamMemberModel) -> TeamMemberRecord:
    return TeamMemberRecord(
        id=model.id,
        team_id=model.team_id,
        user_id=model.user_id,
        created_at=model.created_at,
    )


class SqlAlchemyPermissionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_user_project_role(self, *, user_id: int, project_id: int) -> ProjectRole | None:
        role = self._session.scalar(
            select(ProjectMemberModel.role).where(
                ProjectMemberModel.user_id == user_id,
                ProjectMemberModel.project_id == project_id,
            )
        )
        if role is None:
            return None
        return ProjectRole(role)

    def list_user_project_ids(self, user_id: int) -> list[int]:
        return list(
            self._session.scalars(
                select(ProjectMemberModel.project_id)
                .where(ProjectMemberModel.user_id == user_id)
                .order_by(ProjectMemberModel.project_id)
            )
        )

    def add_project_member(
        self,
        *,
        project_id: int,
        user_id: int,
        role: ProjectRole,
    ) -> ProjectMemberRecord:
        project_member = ProjectMemberModel(
            project_id=project_id,
            user_id=user_id,
            role=role.value,
        )
        self._session.add(project_member)
        try:
            flush_or_commit(self._session)
        except IntegrityError as error:
            self._session.rollback()
            message = str(error).lower()
            if (
                "uq_rbac_project_members_project_user" in message
                or "rbac_project_members.project_id, rbac_project_members.user_id" in message
                or "duplicate" in message
            ):
                raise DuplicateResourceError("项目成员已存在") from error
            raise ResourceIntegrityError("项目权限完整性约束错误") from error
        self._session.refresh(project_member)
        return _project_member_record(project_member)
