"""officials

Adds the `officials` table — CBSE officials who monitor the championship (see
models.Official), a flat roster independent of any Team, with its own ID card
(name + designation, see id_card.py's render_official_id_card).

Revision ID: a1b2c3d4e5f7
Revises: d2f6b9c3a8e1
Create Date: 2026-09-19 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f7"
down_revision = "d2f6b9c3a8e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "officials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("designation", sa.String(length=120), nullable=True),
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column("phone", sa.String(length=60), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_filename", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("officials")
