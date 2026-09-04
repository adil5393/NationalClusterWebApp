"""restore organizer_user_staff

Recreates the join table (originally added in c9e3b7a2f6d4) — a follow-up
migration briefly dropped it while a since-abandoned "remove staff linking
entirely" change was in progress, before landing on keeping the auto-
provisioning link but removing only the manual editing UI on Accounts.

Revision ID: f2a6d8c3b5e1
Revises: d9a3e5c7f1b8
Create Date: 2026-09-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f2a6d8c3b5e1"
down_revision = "d9a3e5c7f1b8"
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
