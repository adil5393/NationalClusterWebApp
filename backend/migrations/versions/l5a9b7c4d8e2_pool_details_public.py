"""Per-tournament toggle for public access to pool fixtures/scores/standings

Revision ID: l5a9b7c4d8e2
Revises: k4f8a6b3c7d1
Create Date: 2026-10-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "l5a9b7c4d8e2"
down_revision = "k4f8a6b3c7d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tournaments",
        sa.Column("pool_details_public", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("tournaments", "pool_details_public")
