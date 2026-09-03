"""teams.has_arrived + team_inactive_age_groups

Two independent additions bundled together (routers/teams.py, matches.py):

- teams.has_arrived: whether the school's delegation has physically arrived
  at the venue — purely informational, no eligibility effect.
- team_inactive_age_groups: per-age-group companion to the existing
  teams.is_active — that column still benches a school across every age
  group at once; this new table lets an organizer deactivate just one age
  group's squad instead. Row existence = inactive for that age group; no row
  = active, so no backfill is needed. Same shape as team_last_year_awards
  (see e8c4a2f7b3d5), the precedent for a per-team-per-age-group child table.

Revision ID: b7f2c9d4a1e6
Revises: a4d9e2f1c6b3
Create Date: 2026-09-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b7f2c9d4a1e6"
down_revision = "a4d9e2f1c6b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("has_arrived", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("teams", "has_arrived", server_default=None)

    op.create_table(
        "team_inactive_age_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("age_group", sa.String(length=40), nullable=False),
        sa.UniqueConstraint("team_id", "age_group", name="uq_team_inactive_age_group"),
    )


def downgrade() -> None:
    op.drop_table("team_inactive_age_groups")
    op.drop_column("teams", "has_arrived")
