"""Sets Team.last_year_awards (gold/silver/bronze per age group — CBSE's own
medal labels; the two Bronze finishers both just get "bronze", since CBSE
itself never distinguishes an order between them) from CBSE's live
National-level Kabaddi Rank 1-4 standings — see export_cbse_national_ranks.py,
whose output the AWARDS table below was transcribed from (Male, 2025-26
season, scraped from academic.cbseit.in). Only affiliation number + school
name are kept, no per-student data.

"Last year's award" here means the most recently concluded Nationals result
(this run's Year=2025 pull) — the label TeamLastYearAward itself uses,
tracked to keep last year's top-4 finishers in an age group apart when this
year's pools get drawn (see routers/pools.py _check_last_year_conflict).
Confirm that's still the right season to seed before running this against a
live DB — if this website's own event IS this year's Nationals (rather than
a later one drawing on it), these are this year's results, not last year's.

Idempotent (safe to re-run): for each of the 12 (age group, award) rows,
clears every row currently sitting under that same (age_group, award) —
which for "bronze" means both of an age group's previous bronze holders,
not just one — and whatever award the intended team already holds in that
age group, before inserting fresh. Mirrors routers/teams.py's
_replace_last_year_awards delete-then-insert shape (just scoped per-row
here instead of per-team); unlike that endpoint this script does NOT
re-check the "last year's top 4 can't share a pool" rule or the "inactive
teams can't have awards changed" rule — both are pool/activation-state
concerns that don't yet exist at fresh-seed time, same precedent as
seed_cluster_winners_active.py skipping the admin-password gate. It DOES
warn if a matched team is currently inactive, since that combination isn't
normally reachable through the API and is worth checking by hand.

Run:
    python -m app.seed_national_award_winners
    docker compose exec backend python -m app.seed_national_award_winners
"""
from .database import SessionLocal, engine, Base
from . import models

# (age group, award, CBSE affiliation number, school name — for reference only)
AWARDS = [
    ("Under 14", "gold", "531058", "New Kashi Public School, Behbalpur, Hisar, HR"),
    ("Under 14", "silver", "532233", "Cosmonaut International School, Jamal Chopta Road"),
    ("Under 14", "bronze", "2131689", "Dehradoon Pub Sch, Domri Parao, Sadar, Varanasi, UP"),
    ("Under 14", "bronze", "430569", "Sat Dham Viyamandir, Kamrej, Bardoli Road, Surat, GT"),
    ("Under 17", "gold", "531702", "Srishti Int'l Sports School, Moth, Hissar, HR"),
    ("Under 17", "silver", "130637", "Veritas Sainik School, C. Ramapuram, Chittoor, AP"),
    ("Under 17", "bronze", "531594", "KVM Global Secondary School, Kaithal, Haryana"),
    ("Under 17", "bronze", "430569", "Sat Dham Viyamandir, Kamrej, Bardoli Road, Surat, GT"),
    ("Under 19", "gold", "2132078", "Saraswati Public School, Partapur, Meerut, UP"),
    ("Under 19", "silver", "1930225", "Velammal Vidyalaya, Mel Ayanambakkam, Chennai, TN"),
    ("Under 19", "bronze", "630237", "N G D Public School, Rakh Ghansot, Solan, HP"),
    ("Under 19", "bronze", "330735", "Foundation Acad, IIT Res Complex, Bihta, Patna, BR"),
]


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        teams = (
            db.query(models.Team)
            .filter(models.Team.school_code.isnot(None), models.Team.school_code != "123123")
            .all()
        )
        by_aff = {t.affiliation_number: t for t in teams if t.affiliation_number}

        unmatched = []
        inactive_matches = []
        to_set = []  # (team, age_group, award, name)
        for age_group, award, aff, name in AWARDS:
            team = by_aff.get(aff)
            if team is None:
                unmatched.append((age_group, award, aff, name))
                continue
            if not team.is_active:
                inactive_matches.append((age_group, award, team))
            to_set.append((team, age_group, award, name))

        for team, age_group, award, _ in to_set:
            db.query(models.TeamLastYearAward).filter(
                models.TeamLastYearAward.age_group == age_group,
                models.TeamLastYearAward.award == award,
            ).delete()
            db.query(models.TeamLastYearAward).filter(
                models.TeamLastYearAward.team_id == team.id,
                models.TeamLastYearAward.age_group == age_group,
            ).delete()
        db.flush()

        for team, age_group, award, _ in to_set:
            db.add(models.TeamLastYearAward(team_id=team.id, age_group=age_group, award=award))

        db.commit()

        print(f"Real teams considered: {len(teams)}")
        print(f"Award slots set: {len(to_set)} of {len(AWARDS)}")
        if unmatched:
            print(f"  AWARDS rows that matched no team by affiliation number ({len(unmatched)}):")
            for age_group, award, aff, name in unmatched:
                print(f"    {age_group} {award}: {name} (aff {aff})")
        if inactive_matches:
            print(f"  Matched team(s) currently inactive — award set anyway, check by hand ({len(inactive_matches)}):")
            for age_group, award, team in inactive_matches:
                print(f"    {age_group} {award}: {team.name} (team id {team.id})")
    finally:
        db.close()


if __name__ == "__main__":
    run()
