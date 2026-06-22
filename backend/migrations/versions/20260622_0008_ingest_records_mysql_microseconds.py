"""use microsecond precision for MySQL ingest record times

Revision ID: 20260622_0008
Revises: 20260622_0007
Create Date: 2026-06-22 23:35:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "20260622_0008"
down_revision = "20260622_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    dialect_name = op.get_context().dialect.name
    if dialect_name not in {"mysql", "mariadb"}:
        return

    op.alter_column(
        "ingest_records",
        "occurred_at",
        existing_type=mysql.DATETIME(),
        type_=mysql.DATETIME(fsp=6),
        existing_nullable=True,
    )
    op.alter_column(
        "ingest_records",
        "received_at",
        existing_type=mysql.DATETIME(),
        type_=mysql.DATETIME(fsp=6),
        existing_nullable=False,
        existing_server_default=sa.text("CURRENT_TIMESTAMP"),
        server_default=sa.text("CURRENT_TIMESTAMP(6)"),
    )


def downgrade() -> None:
    dialect_name = op.get_context().dialect.name
    if dialect_name not in {"mysql", "mariadb"}:
        return

    op.alter_column(
        "ingest_records",
        "received_at",
        existing_type=mysql.DATETIME(fsp=6),
        type_=mysql.DATETIME(),
        existing_nullable=False,
        existing_server_default=sa.text("CURRENT_TIMESTAMP(6)"),
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )
    op.alter_column(
        "ingest_records",
        "occurred_at",
        existing_type=mysql.DATETIME(fsp=6),
        type_=mysql.DATETIME(),
        existing_nullable=True,
    )
