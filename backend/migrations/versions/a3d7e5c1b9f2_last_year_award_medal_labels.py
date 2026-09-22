"""Renames team_last_year_awards.award to CBSE's own medal labels (gold /
silver / bronze) instead of the tournament-bracket ones (winner / runner /
third / fourth), and relaxes the one-team-per-slot constraint for bronze
only: CBSE's own results never distinguish an order between its two Bronze
finishers, so unlike gold/silver, bronze is no longer limited to one team
per age group. The (team_id, age_group) constraint — a team holds at most
one award per age group — is unaffected.

No existing rows use the old labels (checked before writing this — the
table's still empty in every environment this touched), so this is a schema
change only, not a data migration.

Revision ID: a3d7e5c1b9f2
Revises: eacdf3c038fc
Create Date: 2026-09-23 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a3d7e5c1b9f2"
down_revision = "eacdf3c038fc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_team_last_year_award_group_award", "team_last_year_awards", type_="unique")
    op.create_index(
        "uq_team_last_year_award_group_award",
        "team_last_year_awards",
        ["age_group", "award"],
        unique=True,
        postgresql_where=sa.text("award IN ('gold', 'silver')"),
    )


def downgrade() -> None:
    op.drop_index("uq_team_last_year_award_group_award", table_name="team_last_year_awards")
    op.create_unique_constraint(
        "uq_team_last_year_award_group_award", "team_last_year_awards", ["age_group", "award"]
    )
