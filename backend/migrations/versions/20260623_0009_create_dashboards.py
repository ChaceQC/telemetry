"""create dashboards table

Revision ID: 20260623_0009
Revises: 20260622_0008
Create Date: 2026-06-23 10:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260623_0009"
down_revision = "20260622_0008"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "dashboards",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("layout", sa.JSON(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_by_user_id", ID_COLUMN, nullable=False),
        sa.Column("updated_by_user_id", ID_COLUMN, nullable=False),
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
            name="fk_dashboards_project_id",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["auth_users.id"],
            name="fk_dashboards_created_by_user_id",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["auth_users.id"],
            name="fk_dashboards_updated_by_user_id",
        ),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_dashboards_project_id", "dashboards", ["project_id"])
    op.create_index(
        "ix_dashboards_project_updated_at_id",
        "dashboards",
        ["project_id", "updated_at", "id"],
    )
    op.create_index("ix_dashboards_created_by_user_id", "dashboards", ["created_by_user_id"])
    op.create_index("ix_dashboards_updated_by_user_id", "dashboards", ["updated_by_user_id"])


def downgrade() -> None:
    op.drop_table("dashboards")
