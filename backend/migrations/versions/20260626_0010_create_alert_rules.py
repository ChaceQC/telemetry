"""create alert rules table

Revision ID: 20260626_0010
Revises: 20260623_0009
Create Date: 2026-06-26 12:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260626_0010"
down_revision = "20260623_0009"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "alert_rules",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("signal", sa.String(length=32), nullable=False),
        sa.Column("condition", sa.JSON(), nullable=False),
        sa.Column("evaluation", sa.JSON(), nullable=False),
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
            name="fk_alert_rules_project_id",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["auth_users.id"],
            name="fk_alert_rules_created_by_user_id",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["auth_users.id"],
            name="fk_alert_rules_updated_by_user_id",
        ),
        sa.UniqueConstraint("project_id", "name", name="uq_alert_rules_project_name"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_alert_rules_project_id", "alert_rules", ["project_id"])
    op.create_index(
        "ix_alert_rules_project_updated_at_id",
        "alert_rules",
        ["project_id", "updated_at", "id"],
    )
    op.create_index(
        "ix_alert_rules_created_by_user_id",
        "alert_rules",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_alert_rules_updated_by_user_id",
        "alert_rules",
        ["updated_by_user_id"],
    )


def downgrade() -> None:
    op.drop_table("alert_rules")
