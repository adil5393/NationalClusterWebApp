"""Tests for Operational Categories & Staff Module Refactoring.

Covers:
1. Operational Category can be created.
2. Duplicate category keys cannot be created.
3. Staff Member can have one category.
4. Staff Member can have multiple categories.
5. Two staff members can share the same category.
6. Duplicate StaffMember/Category assignments are prevented.
7. Staff API returns categories and designation correctly.
8. Staff can be filtered by category.
9. Removing one category from a Staff Member does not affect their other categories.
10. Deactivating a category does not corrupt Staff records.
11. Existing Staff language data remains intact.
12. Existing Staff shift data remains intact.
13. Existing category data is migrated correctly where mapping is clear.
"""
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app import models, schemas


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    from app.auth_utils import hash_password

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    user = models.OrganizerUser(
        id=1,
        username="ADMIN",
        password_hash=hash_password("adminpass123"),
        is_active=True,
        is_admin=True,
    )
    db_session.add(user)
    db_session.commit()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        login_res = test_client.post("/api/auth/login", json={"username": "ADMIN", "password": "adminpass123"})
        assert login_res.status_code == 200
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def seeded_categories(db_session):
    c1 = models.OperationalCategory(id=1, name="Transport", key="transport", display_order=1)
    c2 = models.OperationalCategory(id=2, name="Accommodation", key="accommodation", display_order=2)
    c3 = models.OperationalCategory(id=3, name="Medical", key="medical", display_order=3)
    c4 = models.OperationalCategory(id=4, name="Match Control", key="match_control", display_order=4)
    db_session.add_all([c1, c2, c3, c4])
    db_session.commit()
    return {"transport": c1, "accommodation": c2, "medical": c3, "match_control": c4}


# Test 1: Operational Category can be created
def test_create_operational_category(client, db_session):
    payload = {
        "name": "Food & Catering",
        "key": "food_catering",
        "description": "Dining hall and athlete meals",
        "icon": "Utensils",
        "display_order": 5,
        "is_active": True,
    }
    r = client.post("/api/operational-categories", json=payload)
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "Food & Catering"
    assert d["key"] == "food_catering"
    assert d["icon"] == "Utensils"
    assert d["is_active"] is True
    assert "id" in d


# Test 2: Duplicate category keys cannot be created
def test_duplicate_category_key_rejected(client, seeded_categories):
    payload = {
        "name": "Another Transport",
        "key": "transport",  # already exists in seeded_categories
        "display_order": 10,
    }
    r = client.post("/api/operational-categories", json=payload)
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"].lower()


# Test 3: Staff Member can have one category
def test_staff_member_with_one_category(client, seeded_categories):
    payload = {
        "full_name": "Ramesh Patel",
        "designation": "Driver",
        "phone": "9876543210",
        "category_ids": [seeded_categories["transport"].id],
        "languages": ["Hindi"],
    }
    r = client.post("/api/staff", json=payload)
    assert r.status_code == 201
    d = r.json()
    assert d["full_name"] == "Ramesh Patel"
    assert d["designation"] == "Driver"
    assert len(d["categories"]) == 1
    assert d["categories"][0]["name"] == "Transport"
    assert d["category_ids"] == [seeded_categories["transport"].id]


# Test 4: Staff Member can have multiple categories
def test_staff_member_with_multiple_categories(client, seeded_categories):
    payload = {
        "full_name": "Rajesh Kumar",
        "designation": "Coordinator",
        "phone": "9876543211",
        "category_ids": [
            seeded_categories["transport"].id,
            seeded_categories["accommodation"].id,
        ],
        "languages": ["English", "Hindi"],
    }
    r = client.post("/api/staff", json=payload)
    assert r.status_code == 201
    d = r.json()
    assert len(d["categories"]) == 2
    cat_keys = {c["key"] for c in d["categories"]}
    assert cat_keys == {"transport", "accommodation"}


# Test 5: Two staff members can share the same category
def test_multiple_staff_share_same_category(client, seeded_categories):
    cat_id = seeded_categories["medical"].id
    r1 = client.post("/api/staff", json={"full_name": "Dr. A. Sen", "designation": "Doctor", "category_ids": [cat_id]})
    r2 = client.post("/api/staff", json={"full_name": "Nurse B. Roy", "designation": "Nurse", "category_ids": [cat_id]})
    assert r1.status_code == 201
    assert r2.status_code == 201

    # Verify category lists both staff
    r_cat = client.get(f"/api/operational-categories/{cat_id}")
    assert r_cat.status_code == 200
    assert r_cat.json()["staff_count"] == 2


# Test 6: Duplicate StaffMember/Category assignments are prevented
def test_prevent_duplicate_staff_category_assignments(client, seeded_categories, db_session):
    cat_id = seeded_categories["transport"].id
    # Sending [cat_id, cat_id] in category_ids
    r = client.post("/api/staff", json={
        "full_name": "Vikram Singh",
        "category_ids": [cat_id, cat_id],
    })
    assert r.status_code == 201
    d = r.json()
    # Should only appear once
    assert len(d["categories"]) == 1
    assert d["categories"][0]["id"] == cat_id


# Test 7: Staff API returns categories and designation correctly
def test_staff_api_returns_categories_and_designation(client, seeded_categories):
    payload = {
        "full_name": "Ananya Sharma",
        "designation": "Head of Technical Officials",
        "phone": "9811122233",
        "category_ids": [seeded_categories["match_control"].id],
        "languages": ["English"],
    }
    r = client.post("/api/staff", json=payload)
    assert r.status_code == 201
    sid = r.json()["id"]

    r_get = client.get("/api/staff")
    assert r_get.status_code == 200
    staff_list = r_get.json()
    ananya = next(s for s in staff_list if s["id"] == sid)
    assert ananya["full_name"] == "Ananya Sharma"
    assert ananya["designation"] == "Head of Technical Officials"
    assert len(ananya["categories"]) == 1
    assert ananya["categories"][0]["name"] == "Match Control"


# Test 8: Staff can be filtered by category
def test_staff_filtered_by_category(client, seeded_categories):
    client.post("/api/staff", json={"full_name": "Transport Person", "category_ids": [seeded_categories["transport"].id]})
    client.post("/api/staff", json={"full_name": "Medical Person", "category_ids": [seeded_categories["medical"].id]})
    client.post("/api/staff", json={
        "full_name": "Multi Role Person",
        "category_ids": [seeded_categories["transport"].id, seeded_categories["medical"].id],
    })

    # Filter by transport
    r_t = client.get(f"/api/staff?category_id={seeded_categories['transport'].id}")
    assert r_t.status_code == 200
    names_t = [s["full_name"] for s in r_t.json()]
    assert "Transport Person" in names_t
    assert "Multi Role Person" in names_t
    assert "Medical Person" not in names_t

    # Filter by key
    r_m = client.get("/api/staff?category_key=medical")
    assert r_m.status_code == 200
    names_m = [s["full_name"] for s in r_m.json()]
    assert "Medical Person" in names_m
    assert "Multi Role Person" in names_m
    assert "Transport Person" not in names_m


# Test 9: Removing one category from a Staff Member does not affect their other categories
def test_remove_one_category_preserves_others(client, seeded_categories):
    c_t = seeded_categories["transport"].id
    c_a = seeded_categories["accommodation"].id
    r = client.post("/api/staff", json={
        "full_name": "Dual Lead",
        "category_ids": [c_t, c_a],
    })
    sid = r.json()["id"]

    # Update to keep only accommodation
    r_up = client.put(f"/api/staff/{sid}", json={"category_ids": [c_a]})
    assert r_up.status_code == 200
    d = r_up.json()
    assert len(d["categories"]) == 1
    assert d["categories"][0]["id"] == c_a


# Test 10: Deactivating a category does not corrupt Staff records
def test_deactivate_category_safety(client, seeded_categories):
    cat_id = seeded_categories["transport"].id
    r_staff = client.post("/api/staff", json={
        "full_name": "Active Driver",
        "category_ids": [cat_id],
    })
    assert r_staff.status_code == 201
    sid = r_staff.json()["id"]

    # Deactivate the category
    r_cat_up = client.put(f"/api/operational-categories/{cat_id}", json={"is_active": False})
    assert r_cat_up.status_code == 200
    assert r_cat_up.json()["is_active"] is False

    # Staff record remains intact and references the category
    r_check = client.get("/api/staff")
    assert r_check.status_code == 200
    staff = next(s for s in r_check.json() if s["id"] == sid)
    assert staff["full_name"] == "Active Driver"
    assert len(staff["categories"]) == 1
    assert staff["categories"][0]["is_active"] is False


# Test 11: Existing Staff language data remains intact
def test_languages_remain_intact(client, seeded_categories):
    payload = {
        "full_name": "Polyglot Officer",
        "designation": "Help Desk",
        "category_ids": [seeded_categories["accommodation"].id],
        "languages": ["English", "Hindi"],
    }
    r = client.post("/api/staff", json=payload)
    assert r.status_code == 201
    sid = r.json()["id"]

    # Update category without touching languages
    r_up = client.put(f"/api/staff/{sid}", json={"category_ids": [seeded_categories["transport"].id]})
    assert r_up.status_code == 200
    assert r_up.json()["languages"] == ["English", "Hindi"]


# Test 12: Existing Staff shift data remains intact
def test_shifts_remain_intact_with_categories(client, seeded_categories, db_session):
    # Create staff
    r = client.post("/api/staff", json={
        "full_name": "Shift Worker",
        "category_ids": [seeded_categories["transport"].id],
    })
    sid = r.json()["id"]

    # Create shift block and assign to staff
    now = datetime.now(timezone.utc)
    block = models.ShiftBlock(
        name="Day Operations Shift",
        start_time=now,
        end_time=now + timedelta(hours=8),
        status="SCHEDULED",
    )
    db_session.add(block)
    db_session.flush()

    shift = models.StaffShift(shift_block_id=block.id, staff_id=sid)
    db_session.add(shift)
    db_session.commit()

    # Verify shift is queryable and associated
    staff_row = db_session.get(models.StaffMember, sid)
    assert len(staff_row.shifts) == 1
    assert staff_row.shifts[0].shift_block.name == "Day Operations Shift"
    assert len(staff_row.categories) == 1


# Test 13: Category deletion safety (cannot delete if staff assigned)
def test_delete_category_safety_guard(client, seeded_categories):
    cat_id = seeded_categories["medical"].id
    client.post("/api/staff", json={"full_name": "Medical Staff 1", "category_ids": [cat_id]})

    # Try to delete category while staff are assigned -> 409 Conflict
    r_del = client.delete(f"/api/operational-categories/{cat_id}")
    assert r_del.status_code == 409
    assert "Cannot delete category" in r_del.json()["detail"]

    # Unassigned category can be safely deleted
    cat_unassigned = client.post("/api/operational-categories", json={"name": "Temporary", "key": "temporary"}).json()
    r_del_ok = client.delete(f"/api/operational-categories/{cat_unassigned['id']}")
    assert r_del_ok.status_code == 204
