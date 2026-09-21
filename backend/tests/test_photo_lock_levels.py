"""Photo-upload locks at every level: global, per team, per participant, per coach."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth_utils import hash_password
from app.database import Base, get_db
from app.main import app
from app import models


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    s = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    Base.metadata.create_all(bind=engine)
    try:
        yield s
    finally:
        s.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    db_session.add(models.OrganizerUser(id=1, username="ADMIN", password_hash=hash_password("adminpass123"), is_active=True, is_admin=True))
    db_session.commit()

    def override():
        yield db_session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        assert c.post("/api/auth/login", json={"username": "ADMIN", "password": "adminpass123"}).status_code == 200
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def ids(db_session):
    t1, t2 = models.Team(name="T1"), models.Team(name="T2")
    db_session.add_all([t1, t2])
    db_session.flush()
    rows = [
        models.Participant(team_id=t1.id, full_name="P1"),
        models.Participant(team_id=t1.id, full_name="P2"),
        models.Participant(team_id=t2.id, full_name="P3"),
        models.Coach(team_id=t1.id, full_name="C1", role="Coach", phone="9876543210"),
        models.Coach(team_id=t1.id, full_name="C2", role="Manager", phone="9876543211"),
    ]
    db_session.add_all(rows)
    db_session.commit()
    return {"t1": t1.id, "t2": t2.id, "p1": rows[0].id, "p2": rows[1].id, "p3": rows[2].id, "c1": rows[3].id, "c2": rows[4].id}


def _up(client, kind, id_):
    return client.post(
        f"/api/public/{kind}/{id_}/photo",
        data={"dob": "01/01/2010", "phone": "9876543210"},
        files={"file": ("a.jpg", b"x", "image/jpeg")},
    ).status_code


def test_individual_participant_lock(client, ids):
    assert client.put(f"/api/participants/{ids['p1']}", json={"photo_uploads_locked": True}).json()["photo_uploads_locked"] is True
    assert _up(client, "participants", ids["p1"]) == 423
    assert _up(client, "participants", ids["p2"]) != 423  # sibling unaffected
    assert client.put(f"/api/participants/{ids['p1']}", json={"photo_uploads_locked": False}).json()["photo_uploads_locked"] is False
    assert _up(client, "participants", ids["p1"]) != 423


def test_individual_coach_lock(client, ids):
    assert client.put(f"/api/coaches/{ids['c1']}", json={"photo_uploads_locked": True}).json()["photo_uploads_locked"] is True
    assert _up(client, "coaches", ids["c1"]) == 423
    assert _up(client, "coaches", ids["c2"]) != 423  # the other manager unaffected
    client.put(f"/api/coaches/{ids['c1']}", json={"photo_uploads_locked": False})
    assert _up(client, "coaches", ids["c1"]) != 423


def test_team_lock_covers_only_that_team(client, ids):
    assert client.put(f"/api/teams/{ids['t1']}", json={"photo_uploads_locked": True}).json()["photo_uploads_locked"] is True
    assert _up(client, "participants", ids["p1"]) == 423
    assert _up(client, "coaches", ids["c2"]) == 423
    assert _up(client, "participants", ids["p3"]) != 423  # other team unaffected
    client.put(f"/api/teams/{ids['t1']}", json={"photo_uploads_locked": False})
    assert _up(client, "participants", ids["p1"]) != 423


def test_global_lock_still_covers_everyone(client, ids):
    client.put("/api/teams/photo-uploads-lock", json={"locked": True})
    assert _up(client, "participants", ids["p3"]) == 423
    assert _up(client, "coaches", ids["c1"]) == 423


def test_portal_payload_exposes_individual_flags(client, ids):
    client.put(f"/api/participants/{ids['p2']}", json={"photo_uploads_locked": True})
    client.put(f"/api/coaches/{ids['c2']}", json={"photo_uploads_locked": True})
    d = client.get(f"/api/public/teams/{ids['t1']}").json()
    assert {p["full_name"]: p["photo_uploads_locked"] for p in d["participants"]} == {"P1": False, "P2": True}
    assert {c["full_name"]: c["photo_uploads_locked"] for c in d["coaches"]} == {"C1": False, "C2": True}


def test_individual_unlock_overrides_global_and_team_lock(client, ids):
    client.put("/api/teams/photo-uploads-lock", json={"locked": True})
    client.put(f"/api/teams/{ids['t1']}", json={"photo_uploads_locked": True})
    assert client.put(f"/api/participants/{ids['p1']}", json={"photo_uploads_locked": False}).json()["photo_uploads_locked_effective"] is False
    assert client.put(f"/api/coaches/{ids['c1']}", json={"photo_uploads_locked": False}).json()["photo_uploads_locked_effective"] is False
    assert _up(client, "participants", ids["p1"]) != 423
    assert _up(client, "coaches", ids["c1"]) != 423
    assert _up(client, "participants", ids["p2"]) == 423  # others still locked
    # team-level unlock overrides the global lock for its whole roster
    client.put(f"/api/teams/{ids['t1']}", json={"photo_uploads_locked": False})
    assert _up(client, "participants", ids["p2"]) != 423
    assert _up(client, "participants", ids["p3"]) == 423  # other team still globally locked


def test_wider_toggle_resets_individual_overrides(client, ids):
    client.put(f"/api/participants/{ids['p1']}", json={"photo_uploads_locked": True})
    client.put(f"/api/teams/{ids['t1']}", json={"photo_uploads_locked": False})  # team unlock clears p1
    assert client.put(f"/api/participants/{ids['p1']}", json={"notes": "x"}).json()["photo_uploads_locked_effective"] is False
    client.put(f"/api/coaches/{ids['c1']}", json={"photo_uploads_locked": False})
    client.put("/api/teams/photo-uploads-lock", json={"locked": True})  # global clears everything
    assert client.get(f"/api/teams/{ids['t1']}").json()["photo_uploads_locked_effective"] is True
    assert _up(client, "coaches", ids["c1"]) == 423
