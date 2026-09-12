"""match staff assignments

Many-to-many between matches and organizer_users (see models.Match.
assigned_users / OrganizerUser.assigned_matches) — an independent access
path from the "matches" module permission: an assigned account can view
every match and fully control (except delete/reset) its own assigned
matches, even with no "matches" entry in permissions at all (see
security.require_match_access).

Revision ID: af31d129efe8
Revises: 6b2f81fc1c87
Create Date: 2026-09-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "af31d129efe8"
down_revision = "6b2f81fc1c87"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "match_staff_assignments",
        sa.Column("match_id", sa.Integer(), nullable=False),
        sa.Column("organizer_user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organizer_user_id"], ["organizer_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("match_id", "organizer_user_id"),
    )


def downgrade() -> None:
    op.drop_table("match_staff_assignments")
