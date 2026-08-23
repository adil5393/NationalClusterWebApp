"""team school_code + participant registration_no

Revision ID: 8a2d6f0b1c3e
Revises: 3f6b1d9c4e2a
Create Date: 2026-08-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "8a2d6f0b1c3e"
down_revision = "3f6b1d9c4e2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("school_code", sa.String(length=40), nullable=True))
    op.create_index("ix_teams_school_code", "teams", ["school_code"], unique=True)

    op.add_column("participants", sa.Column("registration_no", sa.String(length=60), nullable=True))
    op.create_index("ix_participants_registration_no", "participants", ["registration_no"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_participants_registration_no", table_name="participants")
    op.drop_column("participants", "registration_no")

    op.drop_index("ix_teams_school_code", table_name="teams")
    op.drop_column("teams", "school_code")
