"""organizer_user <-> volunteer link (many-to-many)

Revision ID: c8f3b2d6a4e1
Revises: b8d4f1a6c3e9
Create Date: 2026-09-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c8f3b2d6a4e1"
down_revision = "b8d4f1a6c3e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizer_user_volunteer",
        sa.Column("organizer_user_id", sa.Integer(), sa.ForeignKey("organizer_users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("volunteer_id", sa.Integer(), sa.ForeignKey("volunteers.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("organizer_user_volunteer")
