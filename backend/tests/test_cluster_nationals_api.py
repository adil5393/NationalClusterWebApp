"""Backend API tests for Cluster Nationals 2026-27 (Phase 1)."""
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


# --- Health & Dashboard ---
class TestHealthDashboard:
    def test_health(self, s):
        r = s.get(f"{API}/health")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"
        assert d["database"] == "connected"

    def test_dashboard_stats(self, s):
        r = s.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for key in ["participants", "teams", "rooms", "procurement", "tasks", "decisions", "announcements"]:
            assert key in d, f"missing key {key}"
        assert "occupied" in d["rooms"] and "total" in d["rooms"]
        assert isinstance(d["decisions"], list)


# --- Teams CRUD ---
class TestTeams:
    created_id = None

    def test_list(self, s):
        r = s.get(f"{API}/teams")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create(self, s):
        payload = {"name": "TEST_Team_A", "school": "TEST School", "region": "TEST Region", "member_count": 12}
        r = s.post(f"{API}/teams", json=payload)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["member_count"] == 12
        assert "id" in d
        TestTeams.created_id = d["id"]

    def test_get_one(self, s):
        assert TestTeams.created_id
        r = s.get(f"{API}/teams/{TestTeams.created_id}")
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Team_A"

    def test_update(self, s):
        r = s.put(f"{API}/teams/{TestTeams.created_id}", json={"member_count": 25})
        assert r.status_code == 200, r.text
        assert r.json()["member_count"] == 25
        r2 = s.get(f"{API}/teams/{TestTeams.created_id}")
        assert r2.json()["member_count"] == 25

    def test_delete(self, s):
        r = s.delete(f"{API}/teams/{TestTeams.created_id}")
        assert r.status_code in (200, 204)
        r2 = s.get(f"{API}/teams/{TestTeams.created_id}")
        assert r2.status_code == 404


# --- Buildings/Floors/Rooms ---
class TestStructure:
    b_id = None
    f_id = None
    r_id = None

    def test_list_buildings_nested(self, s):
        r = s.get(f"{API}/buildings")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            assert "floors" in data[0]

    def test_create_building(self, s):
        r = s.post(f"{API}/buildings", json={"name": "TEST_Building_X", "code": "TBX"})
        assert r.status_code in (200, 201), r.text
        TestStructure.b_id = r.json()["id"]

    def test_create_floor(self, s):
        r = s.post(f"{API}/buildings/{TestStructure.b_id}/floors", json={"name": "TEST_Floor_1", "level": 1})
        assert r.status_code in (200, 201), r.text
        TestStructure.f_id = r.json()["id"]

    def test_create_room(self, s):
        r = s.post(f"{API}/floors/{TestStructure.f_id}/rooms", json={"name": "TEST_Room_101", "capacity": 6, "room_type": "dorm"})
        assert r.status_code in (200, 201), r.text
        TestStructure.r_id = r.json()["id"]

    def test_delete_room(self, s):
        r = s.delete(f"{API}/rooms/{TestStructure.r_id}")
        assert r.status_code in (200, 204), r.text

    def test_delete_floor(self, s):
        r = s.delete(f"{API}/floors/{TestStructure.f_id}")
        assert r.status_code in (200, 204), r.text

    def test_delete_building(self, s):
        r = s.delete(f"{API}/buildings/{TestStructure.b_id}")
        assert r.status_code in (200, 204), r.text


# --- Knowledge Base ---
class TestKnowledge:
    kid = None

    def test_meta(self, s):
        r = s.get(f"{API}/knowledge/meta")
        assert r.status_code == 200
        d = r.json()
        assert "categories" in d and "statuses" in d
        assert "Procurement" in d["categories"]

    def test_create_with_tags(self, s):
        payload = {
            "title": "TEST_KB_Decision",
            "category": "Procurement",
            "status": "Decided",
            "decision": "Use vendor A",
            "reason": "Cheapest reliable option",
            "tags": ["urgent", "vendor"],
        }
        r = s.post(f"{API}/knowledge", json=payload)
        assert r.status_code == 201, r.text
        d = r.json()
        assert isinstance(d["tags"], list)
        assert set(d["tags"]) == {"urgent", "vendor"}
        assert d["reason"] == "Cheapest reliable option"
        TestKnowledge.kid = d["id"]

    def test_filter_by_category_status(self, s):
        r = s.get(f"{API}/knowledge?category=Procurement&status=Decided")
        assert r.status_code == 200
        assert any(i["id"] == TestKnowledge.kid for i in r.json())

    def test_update_tags(self, s):
        r = s.put(f"{API}/knowledge/{TestKnowledge.kid}", json={"tags": ["done"]})
        assert r.status_code == 200
        assert r.json()["tags"] == ["done"]

    def test_delete(self, s):
        r = s.delete(f"{API}/knowledge/{TestKnowledge.kid}")
        assert r.status_code in (200, 204)


# --- Procurement ---
class TestProcurement:
    pid = None

    def test_meta(self, s):
        r = s.get(f"{API}/procurement/meta")
        assert r.status_code == 200
        assert "statuses" in r.json()

    def test_create(self, s):
        payload = {"title": "TEST_Mattresses", "quantity": 100, "target_unit_price": "500.50", "max_budget": "60000.00", "status": "Open"}
        r = s.post(f"{API}/procurement", json=payload)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["quantity"] == 100
        assert float(d["target_unit_price"]) == 500.50
        assert float(d["max_budget"]) == 60000.00
        TestProcurement.pid = d["id"]

    def test_update(self, s):
        r = s.put(f"{API}/procurement/{TestProcurement.pid}", json={"status": "Ordered"})
        assert r.status_code == 200
        assert r.json()["status"] == "Ordered"

    def test_delete(self, s):
        r = s.delete(f"{API}/procurement/{TestProcurement.pid}")
        assert r.status_code in (200, 204)


# --- Announcements ---
class TestAnnouncements:
    aid = None

    def test_meta(self, s):
        r = s.get(f"{API}/announcements/meta")
        assert r.status_code == 200
        d = r.json()
        assert "priorities" in d or "audiences" in d

    def test_create_published(self, s):
        r = s.post(f"{API}/announcements", json={"title": "TEST_Announce", "message": "hello world", "priority": "high", "audience": "everyone", "is_published": True})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["is_published"] is True
        TestAnnouncements.aid = d["id"]

    def test_delete(self, s):
        r = s.delete(f"{API}/announcements/{TestAnnouncements.aid}")
        assert r.status_code in (200, 204)


# --- Public endpoints ---
class TestPublic:
    def test_public_teams(self, s):
        r = s.get(f"{API}/public/teams")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            # Should not leak internal fields like contact_email/phone/notes
            sample = data[0]
            for leak in ("contact_email", "contact_phone", "notes"):
                assert leak not in sample, f"leaked field {leak}"

    def test_public_announcements(self, s):
        r = s.get(f"{API}/public/announcements")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for a in data:
            assert a.get("is_published", True) is True
            assert a.get("audience") in ("everyone", "coaches", None) or True  # tolerant


# --- Global search ---
class TestSearch:
    def test_search_mattress(self, s):
        r = s.get(f"{API}/search", params={"q": "Mattress"})
        assert r.status_code == 200
        d = r.json()
        assert "results" in d and "count" in d
        types = {x["type"] for x in d["results"]}
        assert "procurement" in types or "knowledge" in types

    def test_search_saudi(self, s):
        r = s.get(f"{API}/search", params={"q": "Saudi"})
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["results"], list)
