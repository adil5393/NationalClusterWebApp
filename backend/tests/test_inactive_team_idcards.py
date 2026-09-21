"""Inactive teams: no ID card downloads for the team, its participants, or its coaches."""
from test_photo_lock_levels import client, db_session  # noqa: F401  (fixtures)
from app import models


def _seed(db):
    t = models.Team(name="T", is_active=True)
    db.add(t)
    db.flush()
    p = models.Participant(team_id=t.id, full_name="P", age_group="Under 14")
    c = models.Coach(team_id=t.id, full_name="C", role="Coach", phone="9876543210")
    db.add_all([p, c])
    db.commit()
    return t, p, c


def _urls(t, p, c):
    return [
        f"/api/export/idcards/team/{t.id}.pdf",
        f"/api/export/idcards/team/{t.id}/sheet-12x18.pdf",
        f"/api/export/idcards/team/{t.id}/individual.zip",
        f"/api/export/idcards/participant/{p.id}.pdf",
        f"/api/export/idcards/coach/{c.id}.pdf",
    ]


def test_inactive_team_blocks_all_idcards(client, db_session):
    t, p, c = _seed(db_session)
    t.is_active = False
    db_session.commit()
    for url in _urls(t, p, c):
        assert client.get(url).status_code == 400, url
    # bulk exports skip the inactive team's members entirely
    assert client.get("/api/export/idcards/all.pdf").status_code == 404
    assert client.get("/api/export/idcards/all/individual.zip").status_code == 404


def test_inactive_team_blocks_arrival_age_active_awards_billing(client, db_session):
    t, p, c = _seed(db_session)
    t.is_active = False
    db_session.commit()
    assert client.put(f"/api/teams/{t.id}", json={"has_arrived": True}).status_code == 400
    assert client.put(f"/api/teams/{t.id}", json={"last_year_awards": []}).status_code == 400
    assert client.put(f"/api/teams/{t.id}/age-groups/Under 14/active", json={"is_active": True}).status_code == 400
    assert client.get(f"/api/teams/{t.id}/billing-summary").status_code == 400
    # reactivating still works, and everything unlocks with it
    assert client.put(f"/api/teams/{t.id}", json={"is_active": True}).status_code == 200
    assert client.put(f"/api/teams/{t.id}", json={"has_arrived": True}).status_code == 200
    assert client.get(f"/api/teams/{t.id}/billing-summary").status_code == 200


def test_inactive_team_blocks_weight_and_presence(client, db_session):
    t, p, c = _seed(db_session)
    assert client.post(f"/api/participants/{p.id}/weight", json={"weight": 40}).status_code == 200
    t.is_active = False
    db_session.commit()
    assert client.post(f"/api/participants/{p.id}/attendance", json={"present": True}).status_code == 400
    assert client.post(f"/api/participants/{p.id}/weight", json={"weight": 41}).status_code == 400


def test_team_active_toggle_needs_admin_or_grant(client, db_session):
    from app.auth_utils import hash_password
    t, p, c = _seed(db_session)
    db_session.add(models.OrganizerUser(username="U", password_hash=hash_password("userpass1234"), is_active=True, is_admin=False, permissions={"teams": "edit"}))
    db_session.commit()
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"username": "U", "password": "userpass1234"}).status_code == 200
    assert client.put(f"/api/teams/{t.id}", json={"notes": "x"}).status_code == 200  # other edits fine
    assert client.put(f"/api/teams/{t.id}", json={"is_active": False, "admin_password": "x"}).status_code == 403
    u = db_session.query(models.OrganizerUser).filter_by(username="U").one()
    u.permissions = {"teams": "edit", "team_activation": "edit"}
    db_session.commit()
    assert client.put(f"/api/teams/{t.id}", json={"is_active": False}).status_code != 403
