"""create auth users table

Revision ID: 20260620_0002
Revises: 20260620_0001
Create Date: 2026-06-20 00:12:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260620_0002"
down_revision = "20260620_0001"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "auth_users",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.false()),
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
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_auth_users_username", "auth_users", ["username"], unique=True)
    op.create_index("ix_auth_users_email", "auth_users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_auth_users_email", table_name="auth_users")
    op.drop_index("ix_auth_users_username", table_name="auth_users")
    op.drop_table("auth_users")
