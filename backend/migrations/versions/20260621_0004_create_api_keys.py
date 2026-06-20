"""create api key table

Revision ID: 20260621_0004
Revises: 20260620_0003
Create Date: 2026-06-21 00:40:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260621_0004"
down_revision = "20260620_0003"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("key_prefix", sa.String(length=16), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_by_user_id", ID_COLUMN, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["management_projects.id"],
            name="fk_api_keys_project_id",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["auth_users.id"],
            name="fk_api_keys_created_by_user_id",
        ),
        sa.UniqueConstraint("key_hash", name="uq_api_keys_key_hash"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_api_keys_project_id", "api_keys", ["project_id"])
    op.create_index("ix_api_keys_key_prefix", "api_keys", ["key_prefix"])
    op.create_index("ix_api_keys_created_by_user_id", "api_keys", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_table("api_keys")
