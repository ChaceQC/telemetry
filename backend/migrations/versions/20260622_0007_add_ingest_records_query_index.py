"""add ingest records query index

Revision ID: 20260622_0007
Revises: 20260621_0006
Create Date: 2026-06-22 12:00:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "20260622_0007"
down_revision = "20260621_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_ingest_records_project_kind_received_at_id",
        "ingest_records",
        ["project_id", "kind", "received_at", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ingest_records_project_kind_received_at_id",
        table_name="ingest_records",
    )
