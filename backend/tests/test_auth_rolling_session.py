"""GET /auth/me keeps an active session alive (rolling cookie) without touching anonymous callers."""
from test_photo_lock_levels import client, db_session  # noqa: F401  (fixtures)


def test_me_reissues_cookie_when_authenticated(client):
    r = client.get("/api/auth/me")
    assert r.json()["authenticated"] is True
    cookie = r.headers.get("set-cookie", "")
    assert "cn_session=" in cookie and "Max-Age=604800" in cookie


def test_me_does_not_set_cookie_when_anonymous(client):
    client.post("/api/auth/logout")
    r = client.get("/api/auth/me")
    assert r.json()["authenticated"] is False
    assert "set-cookie" not in r.headers or "cn_session=null" in r.headers["set-cookie"] or "cn_session" not in r.headers["set-cookie"]


def test_me_after_deactivation_is_unauthenticated(client, db_session):
    from app import models
    db_session.query(models.OrganizerUser).update({"is_active": False})
    db_session.commit()
    assert client.get("/api/auth/me").json()["authenticated"] is False
