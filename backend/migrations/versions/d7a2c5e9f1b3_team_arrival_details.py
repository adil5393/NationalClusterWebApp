"""team arrival details

Adds self-reported travel-plan columns to `teams`, populated by the arrival
Google Form sync (see routers/imports.py import_team_arrivals_from_sheet) —
separate from the existing organizer-confirmed has_arrived toggle.

Revision ID: d7a2c5e9f1b3
Revises: c2e6a9f3d7b1
Create Date: 2026-09-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d7a2c5e9f1b3"
down_revision = "c2e6a9f3d7b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("arrival_date", sa.Date(), nullable=True))
    op.add_column("teams", sa.Column("arrival_time", sa.String(length=20), nullable=True))
    op.add_column("teams", sa.Column("arrival_location", sa.String(length=200), nullable=True))
    op.add_column("teams", sa.Column("arrival_reported_email", sa.String(length=200), nullable=True))
    op.add_column("teams", sa.Column("arrival_reported_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("teams", "arrival_reported_at")
    op.drop_column("teams", "arrival_reported_email")
    op.drop_column("teams", "arrival_location")
    op.drop_column("teams", "arrival_time")
    op.drop_column("teams", "arrival_date")
