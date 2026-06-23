from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.management import ID_COLUMN, utc_now


class DashboardModel(Base):
    __tablename__ = "dashboards"
    __table_args__ = (
        Index("ix_dashboards_project_updated_at_id", "project_id", "updated_at", "id"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_dashboards_project_id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    layout: Mapped[dict[str, Any] | list[Any]] = mapped_column(JSON, nullable=False)
    config: Mapped[dict[str, Any] | list[Any]] = mapped_column(JSON, nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("auth_users.id", name="fk_dashboards_created_by_user_id"),
        nullable=False,
        index=True,
    )
    updated_by_user_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("auth_users.id", name="fk_dashboards_updated_by_user_id"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=func.current_timestamp(),
    )
