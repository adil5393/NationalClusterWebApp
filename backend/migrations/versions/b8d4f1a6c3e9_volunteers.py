"""volunteers

Adds the `volunteers` table — the host school's own event volunteer roster
(see models.Volunteer), a flat list independent of any participating Team,
with its own simpler ID card (name + class only, see id_card.py's
render_volunteer_id_card).

Revision ID: b8d4f1a6c3e9
Revises: d7a2c5e9f1b3
Create Date: 2026-09-16 20:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b8d4f1a6c3e9"
down_revision = "d7a2c5e9f1b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "volunteers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("student_class", sa.String(length=40), nullable=True),
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column("phone", sa.String(length=60), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("photo_filename", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("volunteers")
