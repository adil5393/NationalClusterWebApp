"""backfill teams/venues view permission onto existing volunteer logins

schemas.VOLUNTEER_BASE_PERMISSIONS now grants "teams":"view" and
"venues":"view" (previously {}) so a volunteer assigned to referee/manage a
match (models.Match.assigned_users — independent of the "matches" permission
itself, see security.require_match_access) can actually load the Matches &
Fixtures page, which fetches team and venue names unconditionally. That
default is only applied at credential-creation time (routers/volunteers.py
create_volunteer_credential), so any volunteer login already provisioned
before this change is stuck with its old {} permissions until backfilled
here.

Revision ID: d2a6c9f4b1e7
Revises: c8f3b2d6a4e1
Create Date: 2026-09-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import column, select, table

# revision identifiers, used by Alembic.
revision = "d2a6c9f4b1e7"
down_revision = "c8f3b2d6a4e1"
branch_labels = None
depends_on = None

organizer_users = table("organizer_users", column("id", sa.Integer), column("permissions", sa.JSON))
organizer_user_volunteer = table("organizer_user_volunteer", column("organizer_user_id", sa.Integer))


def upgrade() -> None:
    conn = op.get_bind()
    volunteer_login_ids = [
        row[0] for row in conn.execute(select(organizer_user_volunteer.c.organizer_user_id)).fetchall()
    ]
    for user_id in volunteer_login_ids:
        row = conn.execute(
            select(organizer_users.c.permissions).where(organizer_users.c.id == user_id)
        ).fetchone()
        permissions = dict(row[0] or {})
        changed = False
        for module_key in ("teams", "venues"):
            if module_key not in permissions:
                permissions[module_key] = "view"
                changed = True
        if changed:
            conn.execute(
                organizer_users.update().where(organizer_users.c.id == user_id).values(permissions=permissions)
            )


def downgrade() -> None:
    # Not reversible: there's no way to tell "teams"/"venues" this backfill
    # added apart from ones an admin deliberately granted afterward.
    pass
