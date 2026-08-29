"""buckets: enforce one bucket per source round at the DB level

get_or_create_bucket's check-then-insert had a race: two near-simultaneous
requests (e.g. React StrictMode double-firing the mount effect in dev, or a
rapid double-click on "Advance to Bucket") could both see no existing bucket
and both insert one, leaving a duplicate. Whichever one the organizer's pulls
actually went into isn't necessarily the lower-id row, so a later
get-or-create call could resolve back to the *other*, empty duplicate and
make already-pulled/pushed pools look unpulled again.

This merges any existing duplicates (keeping the one with the most
bucket_teams entries — i.e. actual pull/push history — as the survivor,
moving over any entries the loser has that the survivor doesn't) and then
adds a unique constraint so a duplicate can never be created again; the
router now catches the resulting IntegrityError on a genuine race and falls
back to the row the other request just committed.

Revision ID: f4a9d2c7e6b1
Revises: e8c4a2f7b3d5
Create Date: 2026-08-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f4a9d2c7e6b1"
down_revision = "e8c4a2f7b3d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    buckets = sa.table("buckets", sa.column("id", sa.Integer), sa.column("source_round_id", sa.Integer))
    bucket_teams = sa.table("bucket_teams", sa.column("bucket_id", sa.Integer), sa.column("team_id", sa.Integer))

    by_round: dict[int, list[int]] = {}
    for bucket_id, source_round_id in conn.execute(sa.select(buckets.c.id, buckets.c.source_round_id)).fetchall():
        by_round.setdefault(source_round_id, []).append(bucket_id)

    for bucket_ids in by_round.values():
        if len(bucket_ids) <= 1:
            continue
        counts = {
            bid: conn.execute(
                sa.select(sa.func.count()).select_from(bucket_teams).where(bucket_teams.c.bucket_id == bid)
            ).scalar()
            for bid in bucket_ids
        }
        survivor = sorted(bucket_ids, key=lambda bid: (-counts[bid], bid))[0]
        for loser in (bid for bid in bucket_ids if bid != survivor):
            survivor_team_ids = {
                tid for (tid,) in conn.execute(sa.select(bucket_teams.c.team_id).where(bucket_teams.c.bucket_id == survivor))
            }
            for (team_id,) in conn.execute(sa.select(bucket_teams.c.team_id).where(bucket_teams.c.bucket_id == loser)).fetchall():
                if team_id in survivor_team_ids:
                    conn.execute(bucket_teams.delete().where(bucket_teams.c.bucket_id == loser, bucket_teams.c.team_id == team_id))
                else:
                    conn.execute(
                        bucket_teams.update()
                        .where(bucket_teams.c.bucket_id == loser, bucket_teams.c.team_id == team_id)
                        .values(bucket_id=survivor)
                    )
            conn.execute(buckets.delete().where(buckets.c.id == loser))

    op.create_unique_constraint("uq_buckets_source_round_id", "buckets", ["source_round_id"])


def downgrade() -> None:
    op.drop_constraint("uq_buckets_source_round_id", "buckets", type_="unique")
