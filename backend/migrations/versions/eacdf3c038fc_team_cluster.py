"""add teams.cluster

Revision ID: eacdf3c038fc
Revises: e7f8a9b0c1d2
Create Date: 2026-09-23 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "eacdf3c038fc"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("cluster", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("teams", "cluster")
