"""Phase 4 tests: Beds, Schedule, Bulk Import."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://cluster-event.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def seed_room_id(s):
    rooms = s.get(f"{API}/accommodation/rooms").json()
    assert rooms, "No rooms seeded"
    # pick a room with capacity>=2, ideally low id
    r = next((r for r in rooms if (r.get("capacity") or 0) >= 2), rooms[0])
    return r["id"]


# ---------- BEDS ----------
class TestBeds:
    def test_generate_beds_up_to_capacity(self, s, seed_room_id):
        rid = seed_room_id
        # Clean pre-existing beds first (for isolation): delete any existing beds
        beds = s.get(f"{API}/accommodation/rooms/{rid}/beds").json()
        for b in beds:
            if not b.get("occupied"):
                s.delete(f"{API}/accommodation/beds/{b['id']}")
        r = s.post(f"{API}/accommodation/rooms/{rid}/beds/generate")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "created" in data and "total" in data
        # room capacity for id=rid
        room = next(x for x in s.get(f"{API}/accommodation/rooms").json() if x["id"] == rid)
        assert data["total"] == room["capacity"]

    def test_list_beds(self, s, seed_room_id):
        r = s.get(f"{API}/accommodation/rooms/{seed_room_id}/beds")
        assert r.status_code == 200
        beds = r.json()
        assert isinstance(beds, list) and len(beds) > 0
        assert "label" in beds[0] and "occupied" in beds[0]

    def test_create_custom_bed_and_delete(self, s, seed_room_id):
        r = s.post(f"{API}/accommodation/rooms/{seed_room_id}/beds", json={"label": "TEST-Bed-X"})
        assert r.status_code == 201, r.text
        bid = r.json()["id"]
        # delete
        d = s.delete(f"{API}/accommodation/beds/{bid}")
        assert d.status_code == 204

    def test_generate_creates_zero_if_full(self, s, seed_room_id):
        r = s.post(f"{API}/accommodation/rooms/{seed_room_id}/beds/generate")
        assert r.status_code == 200
        assert r.json()["created"] == 0


# ---------- BED ASSIGNMENT ----------
class TestBedAssignment:
    def test_assign_participant_to_bed_flow(self, s, seed_room_id):
        # Use team 1
        team_id = 1
        parts = s.get(f"{API}/participants", params={"team_id": team_id}).json()
        assert parts, "team 1 has no participants"
        pid = parts[0]["id"]

        # Get beds of the room
        beds = s.get(f"{API}/accommodation/rooms/{seed_room_id}/beds").json()
        free_beds = [b for b in beds if not b["occupied"]]
        assert len(free_beds) >= 1
        bed = free_beds[0]

        # Bed in different room -> 400
        other_rooms = [r for r in s.get(f"{API}/accommodation/rooms").json() if r["id"] != seed_room_id]
        other_room_id = other_rooms[0]["id"]
        r_bad = s.post(f"{API}/accommodation/assignments", json={
            "room_id": other_room_id, "team_id": team_id, "participant_id": pid, "bed_id": bed["id"],
        })
        assert r_bad.status_code == 400, r_bad.text

        # Correct assignment
        r_ok = s.post(f"{API}/accommodation/assignments", json={
            "room_id": seed_room_id, "team_id": team_id, "participant_id": pid, "bed_id": bed["id"],
        })
        assert r_ok.status_code == 201, r_ok.text
        aid = r_ok.json()["id"]

        # Duplicate bed -> 409  (use another participant)
        pid2 = parts[1]["id"] if len(parts) > 1 else None
        if pid2:
            r_dupe = s.post(f"{API}/accommodation/assignments", json={
                "room_id": seed_room_id, "team_id": team_id, "participant_id": pid2, "bed_id": bed["id"],
            })
            assert r_dupe.status_code == 409, r_dupe.text

        # assignments list has bed_label
        alist = s.get(f"{API}/accommodation/assignments").json()
        row = next(a for a in alist if a["id"] == aid)
        assert row["bed_label"] == bed["label"]
        assert row["participant_id"] == pid

        # Cleanup
        s.delete(f"{API}/accommodation/assignments/{aid}")


# ---------- SCHEDULE ----------
class TestSchedule:
    created_ids: list = []

    def test_crud_and_public_portal(self, s):
        # Create with team_id=1
        r = s.post(f"{API}/schedule", json={"title": "TEST-Opening", "team_id": 1, "description": "hello"})
        assert r.status_code == 201, r.text
        ev = r.json()
        assert ev["team_id"] == 1 and ev["title"] == "TEST-Opening"
        eid = ev["id"]
        TestSchedule.created_ids.append(eid)

        # List
        listing = s.get(f"{API}/schedule").json()
        assert any(e["id"] == eid for e in listing)
        listing_team = s.get(f"{API}/schedule", params={"team_id": 1}).json()
        assert any(e["id"] == eid for e in listing_team)

        # Update
        u = s.put(f"{API}/schedule/{eid}", json={"title": "TEST-Opening-2"})
        assert u.status_code == 200
        assert u.json()["title"] == "TEST-Opening-2"

        # Public portal
        pub = s.get(f"{API}/public/teams/1").json()
        sched = pub.get("schedule") or []
        titles = [e.get("title") for e in sched]
        assert "TEST-Opening-2" in titles, f"schedule missing: {titles}"

        # Delete
        d = s.delete(f"{API}/schedule/{eid}")
        assert d.status_code == 204
        TestSchedule.created_ids.remove(eid)


# ---------- BULK IMPORT ----------
class TestImport:
    def test_import_teams(self, s):
        csv = "name,school,region,country,member_count\nTEST-Import Team A,Test School,North,India,5\n[DEV] ABC School,dup,dup,India,1\n,,,,\n"
        files = {"file": ("teams.csv", io.BytesIO(csv.encode()), "text/csv")}
        r = s.post(f"{API}/import/teams", files=files)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created"] >= 1
        assert data["skipped"] >= 1  # dup
        assert any("missing 'name'" in e for e in data["errors"])
        # Verify team exists
        teams = s.get(f"{API}/teams").json()
        new_team = next((t for t in teams if t["name"] == "TEST-Import Team A"), None)
        assert new_team is not None
        # Cleanup
        s.delete(f"{API}/teams/{new_team['id']}")

    def test_import_participants(self, s):
        # Create a temp team then import participants
        r = s.post(f"{API}/teams", json={"name": "TEST-ImpTeam P", "school": "X", "country": "India"})
        assert r.status_code == 201, r.text
        tid = r.json()["id"]
        try:
            csv = "team,full_name,role,gender,age\nTEST-ImpTeam P,Alice Test,player,F,20\nNoSuchTeam,Bob Test,coach,M,30\n"
            files = {"file": ("p.csv", io.BytesIO(csv.encode()), "text/csv")}
            rr = s.post(f"{API}/import/participants", files=files)
            assert rr.status_code == 200, rr.text
            data = rr.json()
            assert data["created"] == 1
            assert any("not found" in e for e in data["errors"])
            parts = s.get(f"{API}/participants", params={"team_id": tid}).json()
            assert any(p["full_name"] == "Alice Test" for p in parts)
        finally:
            s.delete(f"{API}/teams/{tid}")
