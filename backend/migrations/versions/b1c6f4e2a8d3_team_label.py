"""Adds teams.label — a free-text organizer grouping (e.g. sister schools).
Null means "no label" and never conflicts with anything. Two teams sharing
the same non-null label can never be placed in the same pool (enforced in
routers/pools.py, not at the DB level — same shape as the existing
last-year-award pool conflict, no schema-level constraint needed since the
rule only applies within a pool, not tournament-wide).

Revision ID: b1c6f4e2a8d3
Revises: a3d7e5c1b9f2
Create Date: 2026-09-23 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b1c6f4e2a8d3"
down_revision = "a3d7e5c1b9f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("label", sa.String(length=60), nullable=True))


def downgrade() -> None:
    op.drop_column("teams", "label")
