"""round-by-round advance flow: rounds.format, rounds.source_round_id, round_entrants

Revision ID: b7d1f4a9c3e8
Revises: a1b2c3d4e5f6
Create Date: 2026-08-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b7d1f4a9c3e8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rounds", sa.Column("format", sa.String(length=20), nullable=True))
    op.add_column("rounds", sa.Column("source_round_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_rounds_source_round_id", "rounds", "rounds",
        ["source_round_id"], ["id"], ondelete="SET NULL",
    )
    op.create_table(
        "round_entrants",
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("round_entrants")
    op.drop_constraint("fk_rounds_source_round_id", "rounds", type_="foreignkey")
    op.drop_column("rounds", "source_round_id")
    op.drop_column("rounds", "format")
