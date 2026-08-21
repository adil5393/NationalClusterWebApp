"""Phase 5: Room Map, Venues CRUD, Schedule venue linkage, CSV exports."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://cluster-event.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Room Map ----------
class TestRoomMap:
    def test_map_structure(self, s):
        r = s.get(f"{API}/accommodation/map")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        b = data[0]
        for k in ("id", "name", "floors"):
            assert k in b
        assert isinstance(b["floors"], list)
        f0 = b["floors"][0]
        for k in ("id", "name", "rooms"):
            assert k in f0
        r0 = f0["rooms"][0]
        for k in ("id", "name", "capacity", "beds", "loose"):
            assert k in r0
        assert isinstance(r0["beds"], list)
        assert isinstance(r0["loose"], list)

    def test_team1_in_room_001_loose(self, s):
        r = s.get(f"{API}/accommodation/map")
        data = r.json()
        found = False
        for b in data:
            for f in b["floors"]:
                for room in f["rooms"]:
                    if room["name"] == "001":
                        for n in room["loose"]:
                            if "ABC School" in n and "whole team" in n:
                                found = True
        assert found, "Team 1 ([DEV] ABC School) should be in room 001 loose list as '(whole team)'"


# ---------- Venues CRUD ----------
class TestVenues:
    created_id = None

    def test_list(self, s):
        r = s.get(f"{API}/venues")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create(self, s):
        r = s.post(f"{API}/venues", json={
            "name": "TEST_Venue_Phase5",
            "venue_type": "Arena",
            "capacity": 50,
            "location": "Block C",
        })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["name"] == "TEST_Venue_Phase5"
        assert data["venue_type"] == "Arena"
        assert data["capacity"] == 50
        assert "id" in data
        TestVenues.created_id = data["id"]

    def test_update(self, s):
        assert TestVenues.created_id
        r = s.put(f"{API}/venues/{TestVenues.created_id}", json={"location": "Block D"})
        assert r.status_code == 200
        assert r.json()["location"] == "Block D"
        # Persistence check
        got = s.get(f"{API}/venues").json()
        found = [v for v in got if v["id"] == TestVenues.created_id]
        assert found and found[0]["location"] == "Block D"

    def test_delete(self, s):
        assert TestVenues.created_id
        r = s.delete(f"{API}/venues/{TestVenues.created_id}")
        assert r.status_code == 204
        got = s.get(f"{API}/venues").json()
        assert not any(v["id"] == TestVenues.created_id for v in got)


# ---------- Schedule w/ venue ----------
class TestScheduleWithVenue:
    venue_id = None
    event_id = None

    def test_setup_venue(self, s):
        r = s.post(f"{API}/venues", json={"name": "TEST_Venue_Sched", "venue_type": "Field"})
        assert r.status_code == 201
        TestScheduleWithVenue.venue_id = r.json()["id"]

    def test_create_event_with_venue(self, s):
        assert TestScheduleWithVenue.venue_id
        r = s.post(f"{API}/schedule", json={
            "title": "TEST_Event_Phase5",
            "team_id": 1,
            "venue_id": TestScheduleWithVenue.venue_id,
        })
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["title"] == "TEST_Event_Phase5"
        assert data["venue_id"] == TestScheduleWithVenue.venue_id
        assert data["venue_name"] == "TEST_Venue_Sched"
        TestScheduleWithVenue.event_id = data["id"]

    def test_public_team_shows_venue(self, s):
        r = s.get(f"{API}/public/teams/1")
        assert r.status_code == 200
        data = r.json()
        assert "schedule" in data
        match = [e for e in data["schedule"] if e.get("title") == "TEST_Event_Phase5"]
        assert match, "Event should appear on public team page"
        assert match[0].get("venue") == "TEST_Venue_Sched"

    def test_cleanup(self, s):
        if TestScheduleWithVenue.event_id:
            s.delete(f"{API}/schedule/{TestScheduleWithVenue.event_id}")
        if TestScheduleWithVenue.venue_id:
            s.delete(f"{API}/venues/{TestScheduleWithVenue.venue_id}")


# ---------- CSV Exports ----------
class TestExports:
    def test_participants_csv(self, s):
        r = s.get(f"{API}/export/participants.csv")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        first_line = r.text.splitlines()[0]
        assert first_line == "Full Name,Team,Role,Gender,Age"

    def test_rooms_csv(self, s):
        r = s.get(f"{API}/export/rooms.csv")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        first_line = r.text.splitlines()[0]
        assert first_line == "Building,Floor,Room,Bed,Occupant,Team"
