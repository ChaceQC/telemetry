"""create ingest records table

Revision ID: 20260621_0005
Revises: 20260621_0004
Create Date: 2026-06-21 01:40:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260621_0005"
down_revision = "20260621_0004"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "ingest_records",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("api_key_id", ID_COLUMN, nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("source", sa.String(length=128), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["management_projects.id"],
            name="fk_ingest_records_project_id",
        ),
        sa.ForeignKeyConstraint(
            ["api_key_id"],
            ["api_keys.id"],
            name="fk_ingest_records_api_key_id",
        ),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_ingest_records_project_id", "ingest_records", ["project_id"])
    op.create_index("ix_ingest_records_api_key_id", "ingest_records", ["api_key_id"])
    op.create_index("ix_ingest_records_kind", "ingest_records", ["kind"])
    op.create_index("ix_ingest_records_event_type", "ingest_records", ["event_type"])
    op.create_index("ix_ingest_records_received_at", "ingest_records", ["received_at"])


def downgrade() -> None:
    op.drop_table("ingest_records")
