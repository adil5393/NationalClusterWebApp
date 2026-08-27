"""team last_year_winner

Revision ID: e2a9c4f8b1d6
Revises: d5f8a3c1e7b9
Create Date: 2026-08-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e2a9c4f8b1d6"
down_revision = "d5f8a3c1e7b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("last_year_winner", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("teams", "last_year_winner")
