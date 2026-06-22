from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects import mysql
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.expression import FunctionElement

from app.db.base import Base
from app.models.management import ID_COLUMN, utc_now

MYSQL_DATETIME_US = DateTime(timezone=True).with_variant(
    mysql.DATETIME(fsp=6),
    "mysql",
    "mariadb",
)


class CurrentTimestampMicros(FunctionElement[datetime]):
    type = DateTime(timezone=True)
    inherit_cache = True


@compiles(CurrentTimestampMicros)
def _compile_current_timestamp(
    _element: CurrentTimestampMicros,
    _compiler: Any,
    **_kwargs: Any,
) -> str:
    return "CURRENT_TIMESTAMP"


@compiles(CurrentTimestampMicros, "mysql")
@compiles(CurrentTimestampMicros, "mariadb")
def _compile_current_timestamp_mysql(
    _element: CurrentTimestampMicros,
    _compiler: Any,
    **_kwargs: Any,
) -> str:
    return "CURRENT_TIMESTAMP(6)"


class IngestRecordModel(Base):
    __tablename__ = "ingest_records"
    __table_args__ = (
        Index(
            "ix_ingest_records_project_kind_received_at_id",
            "project_id",
            "kind",
            "received_at",
            "id",
        ),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

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
    occurred_at: Mapped[datetime | None] = mapped_column(MYSQL_DATETIME_US)
    received_at: Mapped[datetime] = mapped_column(
        MYSQL_DATETIME_US,
        nullable=False,
        default=utc_now,
        server_default=CurrentTimestampMicros(),
        index=True,
    )


class IngestStatModel(Base):
    __tablename__ = "ingest_stats"
    __table_args__ = (
        UniqueConstraint(
            "bucket_start",
            "project_id",
            "api_key_id",
            "kind",
            "source",
            name="uq_ingest_stats_bucket_project_key_kind_source",
        ),
        {
            "mysql_charset": "utf8mb4",
            "mysql_collate": "utf8mb4_unicode_ci",
        },
    )

    id: Mapped[int] = mapped_column(ID_COLUMN, primary_key=True, autoincrement=True)
    bucket_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    project_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("management_projects.id", name="fk_ingest_stats_project_id"),
        nullable=False,
        index=True,
    )
    api_key_id: Mapped[int] = mapped_column(
        ID_COLUMN,
        ForeignKey("api_keys.id", name="fk_ingest_stats_api_key_id"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(128), nullable=False, default="", server_default="")
    accepted_count: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )
    rejected_count: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )
    bytes_count: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
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
