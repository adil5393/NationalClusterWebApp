"""payments

Registration-fee billing/refund ledger, one row per transaction against a
team (see models.Payment). Append-only — rows are never edited or deleted
by the app, only inserted — so a team's financial history is always exactly
the sum of its BILL and REFUND rows.

Revision ID: 889b41d64328
Revises: f1a2b3c4d5e6
Create Date: 2026-09-12 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "889b41d64328"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("payment_mode", sa.String(length=10), nullable=False),
        sa.Column("transaction_id", sa.String(length=100), nullable=True),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("members", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_payments_team_id", "payments", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_team_id", table_name="payments")
    op.drop_table("payments")
