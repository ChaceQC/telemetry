"""create management tables

Revision ID: 20260620_0001
Revises:
Create Date: 2026-06-20 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260620_0001"
down_revision = None
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "management_projects",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.UniqueConstraint("key", name="uq_management_projects_key"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_table(
        "management_environments",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["management_projects.id"],
            name="fk_management_environments_project_id",
        ),
        sa.UniqueConstraint(
            "id",
            "project_id",
            name="uq_management_environments_id_project_id",
        ),
        sa.UniqueConstraint(
            "project_id",
            "key",
            name="uq_management_environments_project_key",
        ),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(
        "ix_management_environments_project_id",
        "management_environments",
        ["project_id"],
    )
    op.create_table(
        "management_services",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("environment_id", ID_COLUMN, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.ForeignKeyConstraint(
            ["environment_id"],
            ["management_environments.id"],
            name="fk_management_services_environment_id",
        ),
        sa.ForeignKeyConstraint(
            ["environment_id", "project_id"],
            ["management_environments.id", "management_environments.project_id"],
            name="fk_management_services_environment_project",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["management_projects.id"],
            name="fk_management_services_project_id",
        ),
        sa.UniqueConstraint(
            "environment_id",
            "key",
            name="uq_management_services_environment_key",
        ),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(
        "ix_management_services_environment_id",
        "management_services",
        ["environment_id"],
    )
    op.create_index(
        "ix_management_services_project_id",
        "management_services",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_management_services_project_id", table_name="management_services")
    op.drop_index("ix_management_services_environment_id", table_name="management_services")
    op.drop_table("management_services")
    op.drop_index("ix_management_environments_project_id", table_name="management_environments")
    op.drop_table("management_environments")
    op.drop_table("management_projects")
