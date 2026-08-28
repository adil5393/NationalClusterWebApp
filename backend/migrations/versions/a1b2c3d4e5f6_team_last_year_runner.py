"""team last_year_runner

Revision ID: a1b2c3d4e5f6
Revises: f7b3d9e5c2a1
Create Date: 2026-08-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "f7b3d9e5c2a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("last_year_runner", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("teams", "last_year_runner")
