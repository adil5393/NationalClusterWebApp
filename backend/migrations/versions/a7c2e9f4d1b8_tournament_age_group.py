"""tournament age_group

Revision ID: a7c2e9f4d1b8
Revises: f1a4c8e2b9d6
Create Date: 2026-08-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a7c2e9f4d1b8"
down_revision = "f1a4c8e2b9d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tournaments", sa.Column("age_group", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("tournaments", "age_group")
