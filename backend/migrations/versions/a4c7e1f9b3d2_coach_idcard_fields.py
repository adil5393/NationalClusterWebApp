"""coach id-card fields (aadhaar_no, photo_filename)

Revision ID: a4c7e1f9b3d2
Revises: d2a6c9f4b1e7
Create Date: 2026-09-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a4c7e1f9b3d2"
down_revision = "d2a6c9f4b1e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("coaches", sa.Column("aadhaar_no", sa.String(length=20), nullable=True))
    op.add_column("coaches", sa.Column("photo_filename", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("coaches", "photo_filename")
    op.drop_column("coaches", "aadhaar_no")
