"""teams.affiliation_number

A school's own affiliation number (e.g. CBSE-issued) — distinct from
school_code, which this organizer assigns internally. Populated by the
attendance list import when the sheet has it; used by the registration-form
import as a fallback lookup when a row's "School Code" cell doesn't match
any school_code.

Revision ID: c6e1a4f8b2d5
Revises: b3f7d2a9c5e1
Create Date: 2026-09-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c6e1a4f8b2d5"
down_revision = "b3f7d2a9c5e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("affiliation_number", sa.String(length=60), nullable=True))
    op.create_index("ix_teams_affiliation_number", "teams", ["affiliation_number"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_teams_affiliation_number", table_name="teams")
    op.drop_column("teams", "affiliation_number")
