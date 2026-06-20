"""create ingest stats table

Revision ID: 20260621_0006
Revises: 20260621_0005
Create Date: 2026-06-21 04:18:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260621_0006"
down_revision = "20260621_0005"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "ingest_stats",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("api_key_id", ID_COLUMN, nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("accepted_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("rejected_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("bytes_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["management_projects.id"],
            name="fk_ingest_stats_project_id",
        ),
        sa.ForeignKeyConstraint(
            ["api_key_id"],
            ["api_keys.id"],
            name="fk_ingest_stats_api_key_id",
        ),
        sa.UniqueConstraint(
            "bucket_start",
            "project_id",
            "api_key_id",
            "kind",
            "source",
            name="uq_ingest_stats_bucket_project_key_kind_source",
        ),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_ingest_stats_bucket_start", "ingest_stats", ["bucket_start"])
    op.create_index("ix_ingest_stats_project_id", "ingest_stats", ["project_id"])
    op.create_index("ix_ingest_stats_api_key_id", "ingest_stats", ["api_key_id"])
    op.create_index("ix_ingest_stats_kind", "ingest_stats", ["kind"])


def downgrade() -> None:
    op.drop_table("ingest_stats")
