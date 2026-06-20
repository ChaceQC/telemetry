from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.management import ID_COLUMN, utc_now


class IngestRecordModel(Base):
    __tablename__ = "ingest_records"
    __table_args__ = {
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_unicode_ci",
    }

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_ingest_records_project_id"),
        nullable=False,
        index=True,
    )
    api_key_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("api_keys.id", name="fk_ingest_records_api_key_id"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(128))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.current_timestamp(),
        index=True,
    )
