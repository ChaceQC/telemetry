from __future__ import annotations

from enum import StrEnum


class ProjectRole(StrEnum):
    viewer = "viewer"
    editor = "editor"
    admin = "admin"


ROLE_RANK: dict[ProjectRole, int] = {
    ProjectRole.viewer: 10,
    ProjectRole.editor: 20,
    ProjectRole.admin: 30,
}


def role_includes(actual: ProjectRole, required: ProjectRole) -> bool:
    return ROLE_RANK[actual] >= ROLE_RANK[required]
