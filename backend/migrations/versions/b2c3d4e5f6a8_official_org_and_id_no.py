"""official organization and official ID no.

Adds `organization` and `official_id_no` to `officials`, for the Officials ID
card's Organization / Official ID No. rows.

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-09-19 22:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b2c3d4e5f6a8"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("officials", sa.Column("organization", sa.String(length=200), nullable=True))
    op.add_column("officials", sa.Column("official_id_no", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("officials", "official_id_no")
    op.drop_column("officials", "organization")
