import requests

s = requests.Session()
BASE = "http://localhost:8001"
s.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": "Adil@1993"}).raise_for_status()


def create_team(name):
    r = s.post(f"{BASE}/api/teams", json={"name": name})
    r.raise_for_status()
    return r.json()["id"]


def setup_tournament(advance_count, prefix):
    r = s.post(f"{BASE}/api/tournaments", json={"name": f"ZZZ {prefix} DELETE ME", "league_advance_count": advance_count})
    r.raise_for_status()
    tid = r.json()["id"]
    assert r.json()["league_advance_count"] == advance_count
    return tid


def build_pools(tid, pool_names_teams):
    r = s.post(f"{BASE}/api/tournaments/{tid}/rounds", json={"name": "League Round", "sequence": 1, "format": "LEAGUE"})
    r.raise_for_status()
    round_id = r.json()["id"]
    pool_ids = []
    for pname, team_ids in pool_names_teams:
        r = s.post(f"{BASE}/api/tournaments/{tid}/rounds/{round_id}/pools", json={"name": pname, "team_ids": team_ids})
        r.raise_for_status()
        pool_id = r.json()["id"]
        r = s.post(f"{BASE}/api/pools/{pool_id}/finalize", json={})
        r.raise_for_status()
        pool_ids.append(pool_id)
    return round_id, pool_ids


def complete_pool(pool_id, winner_first_id, second_id):
    # compute_standings classifies win/draw/loss purely from team_a_score vs
    # team_b_score (not winner_team_id) — a real score lead is needed or every
    # match reads as a 0-0 draw and standings never resolve a clear qualifier.
    matches = s.get(f"{BASE}/api/pools/{pool_id}/matches").json()
    assert len(matches) == 1
    m = matches[0]
    s.post(f"{BASE}/api/matches/{m['id']}/start").raise_for_status()
    side = "a" if m["team_a_id"] == winner_first_id else "b"
    s.post(f"{BASE}/api/matches/{m['id']}/score", json={"team": side, "delta": 5}).raise_for_status()
    s.post(f"{BASE}/api/matches/{m['id']}/complete", json={"winner_team_id": winner_first_id}).raise_for_status()


print("=== CASE 1: advance_count=1, 4 pools, all ready at once ===")
tid = setup_tournament(1, "ADV1")
teams = {}
for i in range(1, 9):
    teams[i] = create_team(f"ZZZ ADV1 T{i} DELETE ME")
pools_spec = [
    ("Pool A", [teams[1], teams[2]]),
    ("Pool B", [teams[3], teams[4]]),
    ("Pool C", [teams[5], teams[6]]),
    ("Pool D", [teams[7], teams[8]]),
]
round_id, pool_ids = build_pools(tid, pools_spec)
complete_pool(pool_ids[0], teams[1], teams[2])
complete_pool(pool_ids[1], teams[3], teams[4])
complete_pool(pool_ids[2], teams[5], teams[6])
complete_pool(pool_ids[3], teams[7], teams[8])

r = s.post(f"{BASE}/api/tournaments/{tid}/rounds/{round_id}/bucket")
r.raise_for_status()
bucket_id = r.json()["id"]
for pool_id in pool_ids:
    b = s.get(f"{BASE}/api/buckets/{bucket_id}").json()
    pool_info = next(p for p in b["pools"] if p["pool_id"] == pool_id)
    qualifier_ids = [q["id"] for q in pool_info["qualifiers"]]
    r = s.post(f"{BASE}/api/buckets/{bucket_id}/pull", json={"pool_id": pool_id, "team_ids": qualifier_ids})
    r.raise_for_status()

r = s.post(f"{BASE}/api/buckets/{bucket_id}/create-round", json={"name": "Knockout Round", "format": "KNOCKOUT"})
r.raise_for_status()
new_round = r.json()
print("matches:", [(m["team_a_name"], m["team_b_name"]) for m in new_round["matches"]])
matchups = {frozenset([m["team_a_id"], m["team_b_id"]]) for m in new_round["matches"]}
expected = {frozenset([teams[1], teams[7]]), frozenset([teams[3], teams[5]])}
assert matchups == expected, f"MISMATCH: got {matchups}, expected {expected}"
print("CASE 1 PASSED: Pool A winner vs Pool D winner, Pool B winner vs Pool C winner")

print("\n=== CASE 2: advance_count=2, 4 pools, all ready at once ===")
tid2 = setup_tournament(2, "ADV2")
teams2 = {}
for i in range(1, 9):
    teams2[i] = create_team(f"ZZZ ADV2 T{i} DELETE ME")
pools_spec2 = [
    ("Pool A", [teams2[1], teams2[2]]),
    ("Pool B", [teams2[3], teams2[4]]),
    ("Pool C", [teams2[5], teams2[6]]),
    ("Pool D", [teams2[7], teams2[8]]),
]
round_id2, pool_ids2 = build_pools(tid2, pools_spec2)
complete_pool(pool_ids2[0], teams2[1], teams2[2])
complete_pool(pool_ids2[1], teams2[3], teams2[4])
complete_pool(pool_ids2[2], teams2[5], teams2[6])
complete_pool(pool_ids2[3], teams2[7], teams2[8])

r = s.post(f"{BASE}/api/tournaments/{tid2}/rounds/{round_id2}/bucket")
r.raise_for_status()
bucket_id2 = r.json()["id"]
for pool_id in pool_ids2:
    b = s.get(f"{BASE}/api/buckets/{bucket_id2}").json()
    pool_info = next(p for p in b["pools"] if p["pool_id"] == pool_id)
    qualifier_ids = [q["id"] for q in pool_info["qualifiers"]]
    assert len(qualifier_ids) == 2, f"expected 2 qualifiers, got {qualifier_ids}"
    r = s.post(f"{BASE}/api/buckets/{bucket_id2}/pull", json={"pool_id": pool_id, "team_ids": qualifier_ids})
    r.raise_for_status()

r = s.post(f"{BASE}/api/buckets/{bucket_id2}/create-round", json={"name": "Knockout Round", "format": "KNOCKOUT"})
r.raise_for_status()
new_round2 = r.json()
print("matches:", [(m["team_a_name"], m["team_b_name"]) for m in new_round2["matches"]])
matchups2 = {frozenset([m["team_a_id"], m["team_b_id"]]) for m in new_round2["matches"]}
expected2 = {
    frozenset([teams2[1], teams2[8]]),
    frozenset([teams2[7], teams2[2]]),
    frozenset([teams2[3], teams2[6]]),
    frozenset([teams2[5], teams2[4]]),
}
assert matchups2 == expected2, f"MISMATCH: got {matchups2}, expected {expected2}"
assert len(new_round2["matches"]) == 4
print("CASE 2 PASSED: 4 correct winner-vs-runnerup crossover matches")

print("\n=== CASE 3: advance_count=2, partial readiness (only pool A + pool D ready) ===")
tid3 = setup_tournament(2, "ADV2PARTIAL")
teams3 = {}
for i in range(1, 9):
    teams3[i] = create_team(f"ZZZ ADV2PARTIAL T{i} DELETE ME")
pools_spec3 = [
    ("Pool A", [teams3[1], teams3[2]]),
    ("Pool B", [teams3[3], teams3[4]]),
    ("Pool C", [teams3[5], teams3[6]]),
    ("Pool D", [teams3[7], teams3[8]]),
]
round_id3, pool_ids3 = build_pools(tid3, pools_spec3)
complete_pool(pool_ids3[0], teams3[1], teams3[2])
complete_pool(pool_ids3[3], teams3[7], teams3[8])

r = s.post(f"{BASE}/api/tournaments/{tid3}/rounds/{round_id3}/bucket")
r.raise_for_status()
bucket_id3 = r.json()["id"]
b = s.get(f"{BASE}/api/buckets/{bucket_id3}").json()
for pname, pid in [("Pool A", pool_ids3[0]), ("Pool D", pool_ids3[3])]:
    pool_info = next(p for p in b["pools"] if p["pool_id"] == pid)
    assert pool_info["ready"], f"{pname} should be ready"
    qualifier_ids = [q["id"] for q in pool_info["qualifiers"]]
    r = s.post(f"{BASE}/api/buckets/{bucket_id3}/pull", json={"pool_id": pid, "team_ids": qualifier_ids})
    r.raise_for_status()

r = s.post(f"{BASE}/api/buckets/{bucket_id3}/create-round", json={"name": "Knockout Round", "format": "KNOCKOUT"})
r.raise_for_status()
new_round3 = r.json()
print("matches (only A/D pair should be present):", [(m["team_a_name"], m["team_b_name"]) for m in new_round3["matches"]])
assert len(new_round3["matches"]) == 2, "expected exactly 2 matches from the ready A/D pair"
matchups3 = {frozenset([m["team_a_id"], m["team_b_id"]]) for m in new_round3["matches"]}
expected3 = {frozenset([teams3[1], teams3[8]]), frozenset([teams3[7], teams3[2]])}
assert matchups3 == expected3, f"MISMATCH: got {matchups3}, expected {expected3}"

b_after = s.get(f"{BASE}/api/buckets/{bucket_id3}").json()
pool_b_info = next(p for p in b_after["pools"] if p["pool_id"] == pool_ids3[1])
assert pool_b_info["pulled"] is False
print("CASE 3 PASSED: only the ready A/D mirror pair produced matches; B/C untouched, still poolable later")

print("\nALL LEAGUE-ADVANCE TESTS PASSED")

for t in (tid, tid2, tid3):
    s.delete(f"{BASE}/api/tournaments/{t}")
for tset in (teams, teams2, teams3):
    for tid_ in tset.values():
        s.delete(f"{BASE}/api/teams/{tid_}")
print("cleaned up")
