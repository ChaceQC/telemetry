from __future__ import annotations

from app.repositories.auth import UserRecord
from app.repositories.permissions import PermissionRepository, ProjectMemberRecord
from app.schemas.permissions import ProjectRole, role_includes
from app.services.errors import ResourceForbiddenError


class PermissionService:
    def __init__(self, repository: PermissionRepository) -> None:
        self._repository = repository

    def list_accessible_project_ids(self, user: UserRecord) -> list[int] | None:
        if user.is_superuser:
            return None
        return self._repository.list_user_project_ids(user.id)

    def get_project_role(self, *, user: UserRecord, project_id: int) -> ProjectRole | None:
        if user.is_superuser:
            return ProjectRole.admin
        return self._repository.get_user_project_role(user_id=user.id, project_id=project_id)

    def has_project_role(
        self,
        *,
        user: UserRecord,
        project_id: int,
        minimum_role: ProjectRole,
    ) -> bool:
        role = self.get_project_role(user=user, project_id=project_id)
        if role is None:
            return False
        return role_includes(role, minimum_role)

    def ensure_project_role(
        self,
        *,
        user: UserRecord,
        project_id: int,
        minimum_role: ProjectRole,
    ) -> None:
        if not self.has_project_role(
            user=user,
            project_id=project_id,
            minimum_role=minimum_role,
        ):
            raise ResourceForbiddenError("无项目权限")

    def grant_project_role(
        self,
        *,
        project_id: int,
        user_id: int,
        role: ProjectRole,
    ) -> ProjectMemberRecord:
        return self._repository.add_project_member(
            project_id=project_id,
            user_id=user_id,
            role=role,
        )
