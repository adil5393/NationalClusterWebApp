"""teams.photo_url and coaches.role

photo_url holds the raw share link as entered (school registration form) —
routers/public.py converts it to a hotlinkable thumbnail URL on the way out.
coaches.role distinguishes "Coach" from "Manager" — both come from the same
school registration form and share every other field, so they live in one
table rather than a parallel Manager model.

Revision ID: c4e8b2a6f1d3
Revises: b6f2c8a4d9e1
Create Date: 2026-09-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c4e8b2a6f1d3"
down_revision = "b6f2c8a4d9e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("photo_url", sa.String(length=600), nullable=True))
    op.add_column("coaches", sa.Column("role", sa.String(length=20), nullable=False, server_default="Coach"))
    op.alter_column("coaches", "role", server_default=None)


def downgrade() -> None:
    op.drop_column("coaches", "role")
    op.drop_column("teams", "photo_url")
