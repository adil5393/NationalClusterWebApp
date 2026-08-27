"""team last_year_winner: text -> boolean

Revision ID: f7b3d9e5c2a1
Revises: e2a9c4f8b1d6
Create Date: 2026-08-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f7b3d9e5c2a1"
down_revision = "e2a9c4f8b1d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("teams", "last_year_winner")
    op.add_column("teams", sa.Column("last_year_winner", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("teams", "last_year_winner")
    op.add_column("teams", sa.Column("last_year_winner", sa.String(length=160), nullable=True))
