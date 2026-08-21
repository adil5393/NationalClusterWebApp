"""Phase 2 backend tests: Accommodation assignments, Public Team Portal, Knowledge attachments."""
import io
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://cluster-event.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------------- Accommodation ----------------
class TestAccommodation:
    def test_rooms_list(self, s):
        r = s.get(f"{API}/accommodation/rooms")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        room = data[0]
        for k in ("id", "name", "label", "capacity", "occupied", "floor", "building"):
            assert k in room
        assert " · " in room["label"]

    def test_occupancy_matches_and_increments(self, s):
        # Baseline
        occ0 = s.get(f"{API}/accommodation/occupancy").json()
        assert isinstance(occ0, list) and len(occ0) > 0
        b0 = occ0[0]
        for k in ("id", "name", "rooms", "capacity", "occupied_rooms", "assigned", "room_rows"):
            assert k in b0

        rooms = s.get(f"{API}/accommodation/rooms").json()
        teams = s.get(f"{API}/teams").json()
        assert rooms and teams

        # Find a room that is currently unoccupied to make occupied_rooms delta clean
        target_room = next((r for r in rooms if r["occupied"] == 0), rooms[0])
        # Find team not already assigned to that room
        team = teams[0]

        # snapshot building occ
        # Determine building id for target room
        rooms_full = s.get(f"{API}/accommodation/rooms").json()
        target = next(r for r in rooms_full if r["id"] == target_room["id"])
        building_name = target["building"]
        b_before = next(b for b in occ0 if b["name"] == building_name)
        pre_occ_rooms = b_before["occupied_rooms"]
        pre_assigned = b_before["assigned"]

        # Create assignment
        r = s.post(
            f"{API}/accommodation/assignments",
            json={"room_id": target_room["id"], "team_id": team["id"], "notes": "TEST_phase2"},
        )
        assert r.status_code == 201, r.text
        assignment_id = r.json()["id"]

        try:
            # Verify shows in assignments list
            alist = s.get(f"{API}/accommodation/assignments").json()
            found = next((a for a in alist if a["id"] == assignment_id), None)
            assert found is not None
            assert found["team_id"] == team["id"]

            # Verify occupancy increments
            occ1 = s.get(f"{API}/accommodation/occupancy").json()
            b_after = next(b for b in occ1 if b["name"] == building_name)
            assert b_after["assigned"] == pre_assigned + 1
            # occupied_rooms should increment only if room was 0 before
            if target_room["occupied"] == 0:
                assert b_after["occupied_rooms"] == pre_occ_rooms + 1
        finally:
            d = s.delete(f"{API}/accommodation/assignments/{assignment_id}")
            assert d.status_code == 204

        # After delete: occupancy decrements back
        occ2 = s.get(f"{API}/accommodation/occupancy").json()
        b_final = next(b for b in occ2 if b["name"] == building_name)
        assert b_final["assigned"] == pre_assigned
        assert b_final["occupied_rooms"] == pre_occ_rooms

    def test_assignment_missing_room_404(self, s):
        r = s.post(f"{API}/accommodation/assignments", json={"room_id": 999999, "team_id": 1})
        assert r.status_code == 404

    def test_assignment_requires_team_or_participant(self, s):
        rooms = s.get(f"{API}/accommodation/rooms").json()
        r = s.post(f"{API}/accommodation/assignments", json={"room_id": rooms[0]["id"]})
        assert r.status_code == 400


# ---------------- Public Team Portal ----------------
class TestTeamPortal:
    def test_team_detail_ok(self, s):
        r = s.get(f"{API}/public/teams/1")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("id", "name", "coaches", "participants", "accommodation", "transport", "schedule"):
            assert k in d
        assert d["id"] == 1
        # No internal-only fields leaked
        assert "contact_email" not in d
        assert "contact_phone" not in d
        assert "notes" not in d
        # participants should not expose age/gender
        if d["participants"]:
            p = d["participants"][0]
            assert set(p.keys()) <= {"full_name", "role"}
        # Team 1 has an accommodation with Room 001
        assert any(a.get("room") == "001" for a in d["accommodation"])

    def test_team_detail_404(self, s):
        r = s.get(f"{API}/public/teams/999999")
        assert r.status_code == 404


# ---------------- Knowledge Comments ----------------
class TestComments:
    def test_create_list_delete(self, s):
        # Create
        r = s.post(f"{API}/knowledge/1/comments", json={"body": "TEST_comment body", "author": "TEST_author"})
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        assert r.json()["body"] == "TEST_comment body"

        # List (ordered)
        lst = s.get(f"{API}/knowledge/1/comments").json()
        assert any(c["id"] == cid for c in lst)
        ts = [c["created_at"] for c in lst if c["created_at"]]
        assert ts == sorted(ts)

        # Delete
        d = s.delete(f"{API}/comments/{cid}")
        assert d.status_code == 204

        lst2 = s.get(f"{API}/knowledge/1/comments").json()
        assert not any(c["id"] == cid for c in lst2)

    def test_comment_on_missing_knowledge_404(self, s):
        r = s.post(f"{API}/knowledge/999999/comments", json={"body": "x"})
        assert r.status_code == 404


# ---------------- Documents (link) ----------------
class TestDocumentsLink:
    def test_link_document_lifecycle(self, s):
        r = s.post(
            f"{API}/documents",
            data={
                "title": "TEST_link_doc",
                "external_url": "https://example.com/spec.pdf",
                "knowledge_item_id": "1",
            },
        )
        assert r.status_code == 201, r.text
        doc = r.json()
        assert doc["is_upload"] is False
        assert doc["external_url"] == "https://example.com/spec.pdf"
        did = doc["id"]

        lst = s.get(f"{API}/knowledge/1/documents").json()
        assert any(d["id"] == did for d in lst)

        # Downloading a link doc should 404 (not a file)
        r2 = s.get(f"{API}/documents/{did}/download")
        assert r2.status_code == 404

        d = s.delete(f"{API}/documents/{did}")
        assert d.status_code == 204

    def test_missing_file_and_url_400(self, s):
        r = s.post(f"{API}/documents", data={"title": "TEST_bad"})
        assert r.status_code == 400


# ---------------- Documents (file upload) ----------------
class TestDocumentsUpload:
    def test_file_upload_download_delete(self, s):
        content = b"Hello, Cluster Nationals!\nThis is a TEST file."
        files = {"file": ("TEST_upload.txt", io.BytesIO(content), "text/plain")}
        data = {"title": "TEST_upload_doc", "knowledge_item_id": "1"}
        r = s.post(f"{API}/documents", data=data, files=files)
        assert r.status_code == 201, r.text
        doc = r.json()
        assert doc["is_upload"] is True
        assert doc["file_name"] == "TEST_upload.txt"
        assert doc["content_type"] == "text/plain"
        assert doc["size_bytes"] == len(content)
        did = doc["id"]

        # Appears in listing
        lst = s.get(f"{API}/knowledge/1/documents").json()
        assert any(d["id"] == did for d in lst)

        # Download returns original bytes
        r2 = s.get(f"{API}/documents/{did}/download")
        assert r2.status_code == 200
        assert r2.content == content
        cd = r2.headers.get("content-disposition", "")
        assert "TEST_upload.txt" in cd

        # Delete
        d = s.delete(f"{API}/documents/{did}")
        assert d.status_code == 204

        # Download now 404
        r3 = s.get(f"{API}/documents/{did}/download")
        assert r3.status_code == 404
