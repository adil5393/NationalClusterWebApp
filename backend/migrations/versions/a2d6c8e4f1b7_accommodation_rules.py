"""accommodation_rules

Organizer-managed hostel rules/curfew policy list, shown on the public
/accommodation page in place of the previously hardcoded rules list.

Revision ID: a2d6c8e4f1b7
Revises: f5a8c3e1d9b6
Create Date: 2026-09-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a2d6c8e4f1b7"
down_revision = "f5a8c3e1d9b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accommodation_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_published", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("accommodation_rules")
