from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.management import ID_COLUMN, utc_now


class AlertRuleModel(Base):
    __tablename__ = "alert_rules"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_alert_rules_project_name"),
        Index("ix_alert_rules_project_updated_at_id", "project_id", "updated_at", "id"),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_alert_rules_project_id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    signal: Mapped[str] = mapped_column(String(32), nullable=False)
    condition: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    evaluation: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("auth_users.id", name="fk_alert_rules_created_by_user_id"),
        nullable=False,
        index=True,
    )
    updated_by_user_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("auth_users.id", name="fk_alert_rules_updated_by_user_id"),
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


class AlertEvaluationStateModel(Base):
    __tablename__ = "alert_evaluation_states"
    __table_args__ = (
        UniqueConstraint("rule_id", name="uq_alert_evaluation_states_rule_id"),
        Index(
            "ix_alert_evaluation_states_project_next_at",
            "project_id",
            "next_evaluate_at",
            "rule_id",
        ),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey(
            "alert_rules.id",
            name="fk_alert_evaluation_states_rule_id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_alert_evaluation_states_project_id"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    last_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_evaluate_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    last_error: Mapped[str | None] = mapped_column(String(1000))
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
