"""Adds staff_members.phone_public — whether this staff member's phone number
may appear on the public Contacts page (routers/public.py public_contacts).
Defaults to false: staff numbers stay organizer-only until a staff member is
explicitly marked public. External contacts (hospitals, police, ...) are not
affected — they have no staff record.

Revision ID: c4d2e8f1a7b3
Revises: b1c6f4e2a8d3
Create Date: 2026-09-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c4d2e8f1a7b3"
down_revision = "b1c6f4e2a8d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "staff_members",
        sa.Column("phone_public", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("staff_members", "phone_public")
