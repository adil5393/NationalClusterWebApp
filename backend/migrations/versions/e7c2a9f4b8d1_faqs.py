"""faqs

Public-facing FAQ content, organizer-managed (routers/faq.py, gated behind
the new "faq" module) and shown on the public /faq page (GET /public/faqs)
in place of the previously hardcoded placeholder list.

Revision ID: e7c2a9f4b8d1
Revises: d4b8f2a6c1e9
Create Date: 2026-09-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e7c2a9f4b8d1"
down_revision = "d4b8f2a6c1e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "faqs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question", sa.String(length=300), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=60), server_default="General"),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_published", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("faqs")
