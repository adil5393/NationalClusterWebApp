"""organizer_user <-> staff_member link (many-to-many)

Revision ID: c9e3b7a2f6d4
Revises: b4d8f1a6c3e9
Create Date: 2026-08-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c9e3b7a2f6d4"
down_revision = "b4d8f1a6c3e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizer_user_staff",
        sa.Column("organizer_user_id", sa.Integer(), sa.ForeignKey("organizer_users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("staff_member_id", sa.Integer(), sa.ForeignKey("staff_members.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("organizer_user_staff")
