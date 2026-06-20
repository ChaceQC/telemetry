from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.schemas.management import ResourceStatus

ID_COLUMN = BigInteger().with_variant(Integer, "sqlite")


def utc_now() -> datetime:
    return datetime.now(UTC)


class ProjectModel(Base):
    __tablename__ = "management_projects"
    __table_args__ = (
        UniqueConstraint("key", name="uq_management_projects_key"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ResourceStatus.active.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
    )


class EnvironmentModel(Base):
    __tablename__ = "management_environments"
    __table_args__ = (
        UniqueConstraint("id", "project_id", name="uq_management_environments_id_project_id"),
        UniqueConstraint("project_id", "key", name="uq_management_environments_project_key"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_management_environments_project_id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ResourceStatus.active.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
    )


class ServiceModel(Base):
    __tablename__ = "management_services"
    __table_args__ = (
        ForeignKeyConstraint(
            ["environment_id", "project_id"],
            ["management_environments.id", "management_environments.project_id"],
            name="fk_management_services_environment_project",
        ),
        UniqueConstraint("environment_id", "key", name="uq_management_services_environment_key"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_management_services_project_id"),
        nullable=False,
        index=True,
    )
    environment_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_environments.id", name="fk_management_services_environment_id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ResourceStatus.active.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
    )
