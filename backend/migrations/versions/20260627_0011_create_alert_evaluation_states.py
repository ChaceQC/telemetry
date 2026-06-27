"""create alert evaluation states table

Revision ID: 20260627_0011
Revises: 20260626_0010
Create Date: 2026-06-27 12:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260627_0011"
down_revision = "20260626_0010"
branch_labels = None
depends_on = None

ID_COLUMN = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "alert_evaluation_states",
        sa.Column("id", ID_COLUMN, primary_key=True, autoincrement=True),
        sa.Column("rule_id", ID_COLUMN, nullable=False),
        sa.Column("project_id", ID_COLUMN, nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_evaluate_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_result", sa.JSON(), nullable=True),
        sa.Column("last_error", sa.String(length=1000), nullable=True),
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
            ["rule_id"],
            ["alert_rules.id"],
            ondelete="CASCADE",
            name="fk_alert_evaluation_states_rule_id",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["management_projects.id"],
            name="fk_alert_evaluation_states_project_id",
        ),
        sa.UniqueConstraint("rule_id", name="uq_alert_evaluation_states_rule_id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index("ix_alert_evaluation_states_rule_id", "alert_evaluation_states", ["rule_id"])
    op.create_index(
        "ix_alert_evaluation_states_project_id",
        "alert_evaluation_states",
        ["project_id"],
    )
    op.create_index(
        "ix_alert_evaluation_states_project_next_at",
        "alert_evaluation_states",
        ["project_id", "next_evaluate_at", "rule_id"],
    )


def downgrade() -> None:
    op.drop_table("alert_evaluation_states")
