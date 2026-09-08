"""participant photo (photo_filename)

Revision ID: e3f7a9c1d5b2
Revises: c9d4e2f7a1b6
Create Date: 2026-09-09 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e3f7a9c1d5b2"
down_revision = "c9d4e2f7a1b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("photo_filename", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "photo_filename")
