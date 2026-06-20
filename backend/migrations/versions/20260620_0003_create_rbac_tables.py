"""create rbac tables

Revision ID: 20260620_0003
Revises: 20260620_0002
Create Date: 2026-06-20 12:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260620_0003"
down_revision = "20260620_0002"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "rbac_teams",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.UniqueConstraint("key", name="uq_rbac_teams_key"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_table(
        "rbac_team_members",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("team_id", ID_COLUMN, nullable=False),
        sa.Column("user_id", ID_COLUMN, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.ForeignKeyConstraint(
            ["team_id"],
            ["rbac_teams.id"],
            name="fk_rbac_team_members_team_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth_users.id"],
            name="fk_rbac_team_members_user_id",
        ),
        sa.UniqueConstraint("team_id", "user_id", name="uq_rbac_team_members_team_user"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_rbac_team_members_team_id", "rbac_team_members", ["team_id"])
    op.create_index("ix_rbac_team_members_user_id", "rbac_team_members", ["user_id"])
    op.create_table(
        "rbac_project_members",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("user_id", ID_COLUMN, nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["management_projects.id"],
            name="fk_rbac_project_members_project_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["auth_users.id"],
            name="fk_rbac_project_members_user_id",
        ),
        sa.CheckConstraint(
            "role in ('viewer', 'editor', 'admin')",
            name="ck_rbac_project_members_role",
        ),
        sa.UniqueConstraint(
            "project_id",
            "user_id",
            name="uq_rbac_project_members_project_user",
        ),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_rbac_project_members_project_id", "rbac_project_members", ["project_id"])
    op.create_index("ix_rbac_project_members_user_id", "rbac_project_members", ["user_id"])


def downgrade() -> None:
    op.drop_table("rbac_project_members")
    op.drop_table("rbac_team_members")
    op.drop_table("rbac_teams")
