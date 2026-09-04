"""teams.stay

Fooding/lodging arrangement from the registration form's "Stay" column.
Organizer Portal only — never exposed on any /api/public/* endpoint.

Revision ID: d9a3e5c7f1b8
Revises: c6e1a4f8b2d5
Create Date: 2026-09-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d9a3e5c7f1b8"
down_revision = "c6e1a4f8b2d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("stay", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("teams", "stay")
