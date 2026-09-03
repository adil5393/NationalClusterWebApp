"""faq_questions

Visitor-submitted "Ask a question" inbox for the public FAQ page. Organizers
review submissions from the FAQ admin page and either promote one into a
published Faq entry (see routers/faq.py promote_question) or dismiss it.

Revision ID: f5a8c3e1d9b6
Revises: e7c2a9f4b8d1
Create Date: 2026-09-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f5a8c3e1d9b6"
down_revision = "e7c2a9f4b8d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "faq_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("promoted_faq_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["promoted_faq_id"], ["faqs.id"], ondelete="SET NULL"),
    )


def downgrade() -> None:
    op.drop_table("faq_questions")
