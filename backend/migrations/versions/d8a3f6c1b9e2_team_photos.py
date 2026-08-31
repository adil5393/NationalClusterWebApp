"""team_photos: a team can have more than one photo

Replaces the single teams.photo_url column — the school registration form's
photo column can list more than one Drive link (comma-separated, same as its
coach-name column), and the public team page rotates through all of them.
Migrates any existing teams.photo_url value into one team_photos row before
dropping the column.

Revision ID: d8a3f6c1b9e2
Revises: c4e8b2a6f1d3
Create Date: 2026-09-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d8a3f6c1b9e2"
down_revision = "c4e8b2a6f1d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(length=600), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute(
        "INSERT INTO team_photos (team_id, url, created_at, updated_at) "
        "SELECT id, photo_url, now(), now() FROM teams "
        "WHERE photo_url IS NOT NULL AND photo_url <> ''"
    )
    op.drop_column("teams", "photo_url")


def downgrade() -> None:
    op.add_column("teams", sa.Column("photo_url", sa.String(length=600), nullable=True))
    op.execute(
        "UPDATE teams SET photo_url = sub.url FROM ("
        "  SELECT DISTINCT ON (team_id) team_id, url FROM team_photos ORDER BY team_id, id"
        ") sub WHERE teams.id = sub.team_id"
    )
    op.drop_table("team_photos")
