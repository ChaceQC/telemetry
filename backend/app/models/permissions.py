from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.management import ID_COLUMN, utc_now


class TeamModel(Base):
    __tablename__ = "rbac_teams"
    __table_args__ = (
        UniqueConstraint("key", name="uq_rbac_teams_key"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
    )


class TeamMemberModel(Base):
    __tablename__ = "rbac_team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_rbac_team_members_team_user"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("rbac_teams.id", name="fk_rbac_team_members_team_id"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("auth_users.id", name="fk_rbac_team_members_user_id"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
    )


class ProjectMemberModel(Base):
    __tablename__ = "rbac_project_members"
    __table_args__ = (
        CheckConstraint(
            "role in ('viewer', 'editor', 'admin')",
            name="ck_rbac_project_members_role",
        ),
        UniqueConstraint(
            "project_id",
            "user_id",
            name="uq_rbac_project_members_project_user",
        ),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_rbac_project_members_project_id"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("auth_users.id", name="fk_rbac_project_members_user_id"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
    )
