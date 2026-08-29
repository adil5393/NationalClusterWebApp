from types import SimpleNamespace
from app.routers.pools import _repair_last_year_conflicts, _awards_conflict

def team(id_, name, awards=()):
    return SimpleNamespace(id=id_, name=name, last_year_awards=[SimpleNamespace(age_group=ag, award=aw) for ag, aw in awards])

W = team(1, "Winner FC", [("U14", "winner")])
R = team(2, "Runner FC", [("U14", "runner")])
C = team(3, "Neutral C")
D = team(4, "Neutral D")
E = team(5, "Neutral E")

teams_by_id = {t.id: t for t in [W, R, C, D, E]}

# Case 1: winner + runner forced into the same pool by naive chunking.
breakdown = [
    {"name": "Pool A", "team_ids": [W.id, R.id, C.id], "teams": []},
    {"name": "Pool B", "team_ids": [D.id, E.id], "teams": []},
]
_repair_last_year_conflicts(breakdown, teams_by_id)
poolA_ids = breakdown[0]["team_ids"]
poolB_ids = breakdown[1]["team_ids"]
print("Pool A after repair:", poolA_ids)
print("Pool B after repair:", poolB_ids)
assert not (W.id in poolA_ids and R.id in poolA_ids), "winner/runner still together!"
# no new conflict should have been created (trivially true here, only one conflicting pair exists)
for pool_ids in (poolA_ids, poolB_ids):
    for i, x in enumerate(pool_ids):
        for y in pool_ids[i+1:]:
            assert not _awards_conflict(teams_by_id[x], teams_by_id[y]), f"new conflict introduced: {x},{y}"
assert set(poolA_ids) | set(poolB_ids) == {W.id, R.id, C.id, D.id, E.id}
assert len(poolA_ids) == 3 and len(poolB_ids) == 2
print("CASE 1 PASSED: conflict resolved via swap, team counts preserved")

# Case 2: only one pool exists -- no valid swap target, should NOT crash, leaves conflict in place
# (the commit-time _check_last_year_conflict is the safety net for this case).
breakdown2 = [{"name": "Pool A", "team_ids": [W.id, R.id], "teams": []}]
_repair_last_year_conflicts(breakdown2, teams_by_id)
print("Single-pool case (unresolvable) left as:", breakdown2[0]["team_ids"])
assert breakdown2[0]["team_ids"] == [W.id, R.id]
print("CASE 2 PASSED: no crash when unresolvable, left for commit-time check to catch")

# Case 3: no conflict at all -- breakdown untouched.
breakdown3 = [
    {"name": "Pool A", "team_ids": [C.id, D.id], "teams": []},
    {"name": "Pool B", "team_ids": [W.id, E.id], "teams": []},
]
import copy
before = copy.deepcopy(breakdown3)
_repair_last_year_conflicts(breakdown3, teams_by_id)
assert breakdown3 == before
print("CASE 3 PASSED: no-conflict breakdown left untouched")
