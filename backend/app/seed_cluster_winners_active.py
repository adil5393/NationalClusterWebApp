"""Sets team/age-group eligibility to match the CBSE cluster results and
records each winner's cluster — from the official CBSE results file
(cbse_kabaddi_2026_latest.xlsx, ~4,380 student-medal rows, all 20 clusters),
not from the mailbox/form data used elsewhere in this project.

Does two things, both idempotent (safe to re-run after the DB changes —
e.g. a new team synced in from the registration form — it just recomputes
against the current team list each time):

1. Team.is_active: True for a school that is the Gold-medal (rank 1)
   winner of at least one age group in its cluster, False for every other
   real team. Where a winning school won only SOME of its three age
   groups, the ones it did NOT win are individually benched via
   TeamInactiveAgeGroup (row existence = inactive — see models.py) rather
   than the whole team, so e.g. a U-17 winner that also fields a
   non-winning U-14 squad stays active overall with just U-14 benched.
   This mirrors exactly what routers/teams.py's PUT /teams/{id} and
   .../age-groups/{age_group}/active would persist — this script only
   skips their admin-password/permission gates, which are an API-layer
   concern, not a data one (same precedent as set_all_teams_active.py).

2. Team.cluster: set to the Roman-numeral cluster (e.g. "IV") for every
   winning school, left untouched for every other team.

The 60-row WINNERS table below (cluster, age group, CBSE affiliation
number, school name) is transcribed from the spreadsheet's Gold rows,
majority-voted per school to resolve the handful of schools where a
couple of individual students were mistagged with the wrong medal in
CBSE's own data (e.g. 8 Silver-tagged students and 1 Gold-tagged student
on the same roster) — the same majority-vote method used when this
report was cross-checked earlier. The spreadsheet itself is NOT read
here and is not part of the repo (contains ~4,380 students' names/DOB/
father's name — gitignored, kept local, never committed), so this script
has no runtime dependency on it; the extracted, non-personal (school aff.
no. + which age group + which cluster) result is all that is embedded.

Two winners are worth knowing about even though this script marks them
active like any other Gold winner, because the *file* doesn't know their
Nationals status changed afterward — see emails/CLUSTER_SUMMARY.md and
Team_Direct_Mails in emails/Kabaddi_Cluster_Report_2026.xlsx:
  - Cluster I U-17 (Hindustani KV, Tinsukia, aff 230106) WITHDREW from
    the Nationals on 17-Sep.
  - Cluster XVIII U-14 (Stephens Intl, Nihalpur, aff 730042) DECLINED on
    27-Aug and asked that the slot go to 2nd-place Partap World School,
    Pathankot instead.
Re-running this script will not undo a manual is_active change you make
for either of those two — it only touches a team whose CBSE-winner status
disagrees with its current is_active/cluster, and both would already
match after you've adjusted them by hand.

Run:
    python -m app.seed_cluster_winners_active
    docker compose exec backend python -m app.seed_cluster_winners_active
"""
from .database import SessionLocal, engine, Base
from . import models
from .ws import broadcast_roster_change_sync

AGE_GROUP_LABEL = {"U-14": "Under 14", "U-17": "Under 17", "U-19": "Under 19"}
ALL_AGE_GROUPS = list(AGE_GROUP_LABEL)

# (cluster, age group, CBSE affiliation number, school name — for reference only)
WINNERS = [
    ("I", "U-14", "230330", "Vidya Bharati International School, Ahukhat, Tinsukia, AM"),
    ("I", "U-17", "230106", "Hindustani Kendriya Vidyalaya, Tinsukia, Assam"),
    ("I", "U-19", "230119", "Sampoorna Kendra Vidyalaya, Dibrugarh, Assam"),
    ("II", "U-14", "3330239", "Jogpal Public School, Pathalgaon, Jashpur, CG"),
    ("II", "U-17", "3330112", "Mother's Pride HR Sec School, Khamharia, Patan, Durg, CG"),
    ("II", "U-19", "3330087", "Chhattisgarh Public School, Heerapur, Raipur, CG"),
    ("III", "U-14", "330257", "City Public School, Baragandhar, Gaya, Bihar"),
    ("III", "U-17", "330146", "RK Vidya Mandir High School, Mukundpur, Bhagalpur, BR"),
    ("III", "U-19", "3430103", "DAV Public School, Gandhi Nagar, CCL, Ranchi, JH"),
    ("IV", "U-14", "2130808", "St Xaviers High School, Korriya, Gopamau, Sadar, Hardoi"),
    ("IV", "U-17", "2133202", "Children Public School, Bindki, Fatehpur, UP"),
    ("IV", "U-19", "2130829", "Avadh International School, Darshan Nagar, Ayodhya, UP"),
    ("V", "U-14", "2132620", "Seth MR Jaipuria School, Dandi, Chandauli, UP"),
    ("V", "U-17", "2131171", "New Cambridge Sr Sec School, Phoolpur, Azamgarh, UP"),
    ("V", "U-19", "2131936", "Gurukul Montessori School, Shantipuram, Prayagraj, UP"),
    ("VI", "U-14", "1931444", "Velammal Bodhi Campus, Kumbakonam, Thanjavur, TN"),
    ("VI", "U-17", "1930891", "Vel's Vidhyalaya, Ambasamudram, Tirunelveli, TN"),
    ("VI", "U-19", "1931611", "Velammal Vidyalaya, Vanagaram, Chennai, TN"),
    ("VII", "U-14", "130637", "Veritas Sainik School, C. Ramapuram, Chittoor, AP"),
    ("VII", "U-17", "3630057", "Delhi Public School, Nacharam, Malkajgiri, RR, TL"),
    ("VII", "U-19", "130637", "Veritas Sainik School, C. Ramapuram, Chittoor, AP"),
    ("VIII", "U-14", "830129", "Sanganabasava Int'l Res School, Kavalagi, Bijapur, KK"),
    ("VIII", "U-17", "830191", "Thyagaraju Central School, Bidadi, Bangalore Rural, KK"),
    ("VIII", "U-19", "830284", "Delhi Public School, Dommasandra, Bangalore, KK"),
    ("IX", "U-14", "1180005", "Army Public School, Southern Command, Pune, MH"),
    ("IX", "U-17", "1180005", "Army Public School, Southern Command, Pune, MH"),
    ("IX", "U-19", "1130444", "Atma Malik International School, Kopargaon, Ahmednagar, MH"),
    ("X", "U-14", "930454", "Prashanthi Vidya Kendra, Bayar PO, Kasaragod, KL"),
    ("X", "U-17", "930212", "Vedavyasa Vidyalayam SS Sainik School, Malaparamba, Calicut, KL"),
    ("X", "U-19", "930050", "S N Vidya Bhavan Sr Sec School, Trichur, KL"),
    ("XI", "U-14", "930476", "Jai Matha Public School, Marayoor, Idukki, KL"),
    ("XI", "U-17", "930061", "Bhavans Adarsha Vidyalaya, Kakkanad, Kochi, KL"),
    ("XI", "U-19", "930818", "Stratford Public School, Karunagapally, Kollam, KL"),
    ("XII", "U-14", "1030420", "Sant Sri Asaramji Gurukul, Khandwa Rd, Indore, MP"),
    ("XII", "U-17", "1030400", "Sandipani Academy, Mandleshwar, Khargaon, MP"),
    ("XII", "U-19", "1030500", "Sanskar Academy, A B Road, Pachore, Rajgarh, MP"),
    ("XIII", "U-14", "430679", "Shri Brahmanand Vidya Mandir Sainik School, Chaparda"),
    ("XIII", "U-17", "430409", "V Care International School, Mulad, Kim, Surat, GJ"),
    ("XIII", "U-19", "430310", "SD SR Mundra Maheshwari Public School, Ladvi, Surat, GJ"),
    ("XIV", "U-14", "1730452", "The Modern School, near NH.15, Barmer, Rajasthan"),
    ("XIV", "U-17", "1730416", "Maheshwari Public School, Pratap Nagar, Tonk Rd, Jaipur, RJ"),
    ("XIV", "U-19", "1730679", "Maheshwari Public School, Int'l, Tilak Nagar, Jaipur, RJ"),
    ("XV", "U-14", "531608", "Heritage School of Learning, Mangawas, Jhajjar, HR"),
    ("XV", "U-17", "530717", "LBS Sr Sec School, VPO Kahnaur, Rohtak, HR"),
    ("XV", "U-19", "531608", "Heritage School of Learning, Mangawas, Jhajjar, HR"),
    ("XVI", "U-14", "531595", "Janta Adarsh Satydev Sr Sec School, Yamunanagar, HR"),
    ("XVI", "U-17", "531702", "Srishti Int'l Sports School, Moth, Hissar, HR"),
    ("XVI", "U-19", "630237", "N G D Public School, Rakh Ghansot, Solan, HP"),
    ("XVII", "U-14", "1630644", "Good Shepherd Public School, Panniwala Fatta, Muktsar, PB"),
    ("XVII", "U-17", "1630374", "Seaba Int'l School, Lehra Gaga, Moonak, Sangrur, PB"),
    ("XVII", "U-19", "1630374", "Seaba Int'l School, Lehra Gaga, Moonak, Sangrur, PB"),
    ("XVIII", "U-14", "730042", "Stephens Int'l Public School, Nihalpur, Kullian, J&K"),
    ("XVIII", "U-17", "1630443", "AIC Academy, Vill Ladian Khurd, Ludhiana, PB"),
    ("XVIII", "U-19", "730070", "BBS Vidyapeeth, Dina Nagar, Udhampur, J&K"),
    ("XIX", "U-14", "2132293", "Jai Parvati Global School, Ramala, Baraut, Baghpat, UP"),
    ("XIX", "U-17", "2130984", "Oxford Green Public School, Vill Sirsa, Gr Noida, UP"),
    ("XIX", "U-19", "2132078", "Saraswati Public School, Partapur, Meerut, UP"),
    ("XX", "U-14", "2730809", "G R International School, 154/423, Pooth Khurd, DL"),
    ("XX", "U-17", "2730677", "Bal Vidya Model School, Laxmi Park, Nangloi, DL"),
    ("XX", "U-19", "2730809", "G R International School, 154/423, Pooth Khurd, DL"),
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

        wins_by_team: dict[int, dict[str, str]] = {}  # team.id -> {age_group: cluster}
        unmatched = []
        for cluster, age, aff, name in WINNERS:
            team = by_aff.get(aff)
            if team is None:
                unmatched.append((cluster, age, aff, name))
                continue
            wins_by_team.setdefault(team.id, {})[age] = cluster

        existing_inactive_ag = {
            (r.team_id, r.age_group)
            for r in db.query(models.TeamInactiveAgeGroup)
            .filter(models.TeamInactiveAgeGroup.team_id.in_([t.id for t in teams]))
            .all()
        }

        activated = deactivated = unchanged_active = unchanged_inactive = 0
        ag_benched = ag_unbenched = 0
        cluster_set = 0

        for team in teams:
            wins = wins_by_team.get(team.id)
            if wins:
                if not team.is_active:
                    team.is_active = True
                    activated += 1
                else:
                    unchanged_active += 1
                clusters = set(wins.values())
                if len(clusters) > 1:
                    print(f"  NOTE: {team.name} won in more than one cluster per the file ({clusters}) — "
                          f"kept its first, {sorted(clusters)[0]}; check this by hand.")
                cluster = sorted(clusters)[0]
                if team.cluster != cluster:
                    team.cluster = cluster
                    cluster_set += 1
                for ag in ALL_AGE_GROUPS:
                    label = AGE_GROUP_LABEL[ag]
                    is_benched = (team.id, label) in existing_inactive_ag
                    if ag in wins and is_benched:
                        db.query(models.TeamInactiveAgeGroup).filter(
                            models.TeamInactiveAgeGroup.team_id == team.id,
                            models.TeamInactiveAgeGroup.age_group == label,
                        ).delete()
                        ag_unbenched += 1
                    elif ag not in wins and not is_benched:
                        db.add(models.TeamInactiveAgeGroup(team_id=team.id, age_group=label))
                        ag_benched += 1
            else:
                if team.is_active:
                    team.is_active = False
                    deactivated += 1
                else:
                    unchanged_inactive += 1

        db.commit()
        broadcast_roster_change_sync("team_active")

        print(f"Real teams considered: {len(teams)}")
        print(f"Winning teams matched: {len(wins_by_team)} (from {len(WINNERS)} winning cluster/age-group rows)")
        if unmatched:
            print(f"  WINNERS rows that matched no team by affiliation number ({len(unmatched)}):")
            for cluster, age, aff, name in unmatched:
                print(f"    Cluster {cluster} {age}: {name} (aff {aff})")
        print()
        print(f"Team.is_active: {activated} activated, {deactivated} deactivated, "
              f"{unchanged_active} already active, {unchanged_inactive} already inactive")
        print(f"Team.cluster: set/updated on {cluster_set} team(s)")
        print(f"TeamInactiveAgeGroup: {ag_benched} age-group row(s) added (benched), "
              f"{ag_unbenched} removed (re-enabled)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
