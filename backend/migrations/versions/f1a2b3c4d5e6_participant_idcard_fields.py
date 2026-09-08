"""participant id-card fields (father_name, date_of_birth, student_class)

Revision ID: f1a2b3c4d5e6
Revises: e3f7a9c1d5b2
Create Date: 2026-09-09 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "e3f7a9c1d5b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("father_name", sa.String(length=200), nullable=True))
    op.add_column("participants", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("participants", sa.Column("student_class", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "student_class")
    op.drop_column("participants", "date_of_birth")
    op.drop_column("participants", "father_name")
