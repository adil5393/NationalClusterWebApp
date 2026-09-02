"""tournaments.bracket_mode + pools.manual_qualifier_ids + matches.forfeited_team_id

Three small additive columns shipped together (routers/matches.py, buckets.py,
pools.py):

- tournaments.bracket_mode: "AUTO" | "MANUAL" | NULL, set by generate_bracket,
  used to hide/block the Bucket flow for whole-season auto-generated
  tournaments and to colour-code the tournament list in the UI.
- pools.manual_qualifier_ids: JSON list of team ids, set by the new
  POST /api/pools/{id}/resolve-tiebreak when an organizer resolves a
  standings tie directly instead of through the Bucket tie-picker.
- matches.forfeited_team_id: set by the new POST /api/matches/{id}/forfeit —
  the team that forfeited (winner_team_id is the other team, same as any
  other completed match).

Revision ID: a4d9e2f1c6b3
Revises: f3c8a1d6e9b4
Create Date: 2026-09-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a4d9e2f1c6b3"
down_revision = "f3c8a1d6e9b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tournaments", sa.Column("bracket_mode", sa.String(length=10), nullable=True))
    op.add_column("pools", sa.Column("manual_qualifier_ids", sa.JSON(), nullable=True))
    op.add_column(
        "matches",
        sa.Column("forfeited_team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("matches", "forfeited_team_id")
    op.drop_column("pools", "manual_qualifier_ids")
    op.drop_column("tournaments", "bracket_mode")
