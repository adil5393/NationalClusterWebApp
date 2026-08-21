"""Phase 3 tests: Participants, Transport, QR (public reflect), Accommodation participant beds."""
import os
import time
import pytest
import requests

def _load_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")


BASE_URL = _load_frontend_env().rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def team_id():
    return 1


# ---------- Participants ----------
class TestParticipants:
    created = []

    def test_list_all(self, client):
        r = client.get(f"{API}/participants")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_filter_by_team(self, client, team_id):
        r = client.get(f"{API}/participants", params={"team_id": team_id})
        assert r.status_code == 200
        for p in r.json():
            assert p["team_id"] == team_id

    def test_create_invalid_team(self, client):
        r = client.post(f"{API}/participants", json={"team_id": 999999, "full_name": "TEST_X", "role": "Member"})
        assert r.status_code == 404

    def test_create_and_persist(self, client, team_id):
        payload = {"team_id": team_id, "full_name": "TEST_P3_Alice", "role": "Member", "age": 15}
        r = client.post(f"{API}/participants", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["full_name"] == "TEST_P3_Alice"
        assert data["team_id"] == team_id
        pid = data["id"]
        TestParticipants.created.append(pid)
        # verify via list
        r2 = client.get(f"{API}/participants", params={"team_id": team_id})
        assert any(x["id"] == pid for x in r2.json())

    def test_update(self, client):
        pid = TestParticipants.created[0]
        r = client.put(f"{API}/participants/{pid}", json={"full_name": "TEST_P3_Alice_Updated"})
        assert r.status_code == 200
        assert r.json()["full_name"] == "TEST_P3_Alice_Updated"

    def test_delete(self, client):
        pid = TestParticipants.created.pop()
        r = client.delete(f"{API}/participants/{pid}")
        assert r.status_code == 204


# ---------- Accommodation participant beds ----------
class TestAccommodationBeds:
    created_pid = None
    created_aid = None
    room_id = None

    def test_setup_participant(self, client, team_id):
        r = client.post(f"{API}/participants", json={"team_id": team_id, "full_name": "TEST_P3_Bed", "role": "Member"})
        assert r.status_code == 201
        TestAccommodationBeds.created_pid = r.json()["id"]

    def test_find_room_with_capacity(self, client):
        rooms = client.get(f"{API}/accommodation/rooms").json()
        # pick a room with capacity > occupied
        for r in rooms:
            if r["capacity"] and r["occupied"] < r["capacity"]:
                TestAccommodationBeds.room_id = r["id"]
                break
        assert TestAccommodationBeds.room_id is not None

    def test_create_participant_assignment(self, client, team_id):
        payload = {"room_id": self.room_id, "team_id": team_id, "participant_id": self.created_pid}
        r = client.post(f"{API}/accommodation/assignments", json=payload)
        assert r.status_code == 201, r.text
        TestAccommodationBeds.created_aid = r.json()["id"]

    def test_assignments_include_participant_name(self, client):
        rows = client.get(f"{API}/accommodation/assignments").json()
        row = next(x for x in rows if x["id"] == self.created_aid)
        assert row["participant_name"] == "TEST_P3_Bed"

    def test_duplicate_participant_same_room_409(self, client, team_id):
        payload = {"room_id": self.room_id, "team_id": team_id, "participant_id": self.created_pid}
        r = client.post(f"{API}/accommodation/assignments", json=payload)
        assert r.status_code == 409

    def test_duplicate_team_null_participant_409(self, client, team_id):
        # team 1 is seeded to room 001 - find that room and try duplicate
        rows = client.get(f"{API}/accommodation/assignments").json()
        team_row = next((x for x in rows if x["team_id"] == team_id and x["participant_id"] is None), None)
        if not team_row:
            pytest.skip("no seeded team-only assignment")
        r = client.post(f"{API}/accommodation/assignments",
                        json={"room_id": team_row["room_id"], "team_id": team_id})
        assert r.status_code == 409

    def test_over_capacity_409(self, client, team_id):
        # find a full room by filling one
        rooms = client.get(f"{API}/accommodation/rooms").json()
        target = None
        for r in rooms:
            if r["capacity"] and r["occupied"] >= r["capacity"]:
                target = r
                break
        if not target:
            # try filling smallest capacity room
            small = min((r for r in rooms if r["capacity"]), key=lambda r: r["capacity"] - r["occupied"])
            # create participants to fill
            fills = []
            while small["occupied"] < small["capacity"]:
                pr = client.post(f"{API}/participants", json={"team_id": team_id, "full_name": f"TEST_FILL_{time.time_ns()}", "role": "M"})
                pid = pr.json()["id"]
                fills.append(pid)
                ar = client.post(f"{API}/accommodation/assignments",
                                 json={"room_id": small["id"], "team_id": team_id, "participant_id": pid})
                if ar.status_code != 201:
                    break
                small["occupied"] += 1
            target = small
            # try one more -> should fail 409
            pr = client.post(f"{API}/participants", json={"team_id": team_id, "full_name": f"TEST_OVER_{time.time_ns()}", "role": "M"})
            pid = pr.json()["id"]
            over = client.post(f"{API}/accommodation/assignments",
                               json={"room_id": target["id"], "team_id": team_id, "participant_id": pid})
            assert over.status_code == 409
            # cleanup: delete participants (also removes assignments? no) — delete assignments first
            rows = client.get(f"{API}/accommodation/assignments").json()
            for row in rows:
                if row["participant_id"] in fills:
                    client.delete(f"{API}/accommodation/assignments/{row['id']}")
            for pid_ in fills + [pid]:
                client.delete(f"{API}/participants/{pid_}")

    def test_cleanup(self, client):
        if self.created_aid:
            r = client.delete(f"{API}/accommodation/assignments/{self.created_aid}")
            assert r.status_code == 204
        if self.created_pid:
            r = client.delete(f"{API}/participants/{self.created_pid}")
            assert r.status_code == 204


# ---------- Transport ----------
class TestTransport:
    driver_id = None
    vehicle_id = None
    assignment_id = None

    def test_create_driver(self, client):
        r = client.post(f"{API}/transport/drivers", json={"name": "TEST_P3_Driver", "phone": "9999"})
        assert r.status_code == 201
        TestTransport.driver_id = r.json()["id"]

    def test_list_drivers(self, client):
        r = client.get(f"{API}/transport/drivers")
        assert r.status_code == 200
        assert any(d["id"] == self.driver_id for d in r.json())

    def test_create_vehicle_invalid_driver(self, client):
        r = client.post(f"{API}/transport/vehicles", json={"label": "TEST_X_BUS", "driver_id": 999999})
        assert r.status_code == 404

    def test_create_vehicle_with_driver(self, client):
        r = client.post(f"{API}/transport/vehicles",
                        json={"label": "TEST_P3_BUS", "vehicle_type": "bus", "capacity": 40, "driver_id": self.driver_id})
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["driver_name"] == "TEST_P3_Driver"
        TestTransport.vehicle_id = data["id"]

    def test_list_vehicles(self, client):
        r = client.get(f"{API}/transport/vehicles")
        assert r.status_code == 200

    def test_create_assignment_invalid_vehicle(self, client, team_id):
        r = client.post(f"{API}/transport/assignments",
                        json={"vehicle_id": 999999, "team_id": team_id, "pickup_location": "X", "route": "R"})
        assert r.status_code == 404

    def test_create_assignment_invalid_team(self, client):
        r = client.post(f"{API}/transport/assignments",
                        json={"vehicle_id": self.vehicle_id, "team_id": 999999, "pickup_location": "X"})
        assert r.status_code == 404

    def test_create_assignment(self, client, team_id):
        r = client.post(f"{API}/transport/assignments",
                        json={"vehicle_id": self.vehicle_id, "team_id": team_id,
                              "pickup_location": "TEST_Airport", "drop_location": "TEST_Hostel",
                              "route": "TEST_Route_A"})
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["vehicle_label"] == "TEST_P3_BUS"
        TestTransport.assignment_id = data["id"]

    def test_public_team_shows_transport(self, client, team_id):
        r = client.get(f"{API}/public/teams/{team_id}")
        assert r.status_code == 200
        transport = r.json()["transport"]
        match = next((t for t in transport if t["vehicle"] == "TEST_P3_BUS"), None)
        assert match is not None
        assert match["pickup_location"] == "TEST_Airport"
        assert match["route"] == "TEST_Route_A"

    def test_cleanup(self, client):
        if self.assignment_id:
            assert client.delete(f"{API}/transport/assignments/{self.assignment_id}").status_code == 204
        if self.vehicle_id:
            assert client.delete(f"{API}/transport/vehicles/{self.vehicle_id}").status_code == 204
        if self.driver_id:
            assert client.delete(f"{API}/transport/drivers/{self.driver_id}").status_code == 204
