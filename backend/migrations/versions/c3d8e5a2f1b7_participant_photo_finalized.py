"""participant photo finalized flag

Adds Participant.photo_finalized — true only once a photo has gone through
the manual crop-confirm dialog (see face_crop.py / TeamPortal.tsx), so the
roster can tell a deliberately-framed photo apart from a legacy upload from
before that step existed. Defaults false so every existing photo starts as
not-yet-finalized.

Revision ID: c3d8e5a2f1b7
Revises: af31d129efe8
Create Date: 2026-09-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c3d8e5a2f1b7"
down_revision = "af31d129efe8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("photo_finalized", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("participants", "photo_finalized")
