"""Tests for Contacts ↔ Staff Integration with Incharge Basis & Operational Categories.

Covers all 13 required verification scenarios:
1. Ordinary category members are NOT returned publicly automatically.
2. Current ShiftOperationalIncharge is returned.
3. Head Incharge is returned.
4. Explicit ContactGroupStaff is returned.
5. ExternalContact is returned.
6. Same staff qualifying through multiple paths appears once.
7. Duty Incharge has priority over Head/Additional role.
8. Head has priority over Additional role.
9. Contact Group still works when no active shift/incharge exists.
10. Changing the shift incharge immediately changes public resolution.
11. Updating Staff phone/languages reflects in Contacts without duplication.
12. Disabled Contact Groups remain excluded from public results.
13. Admin can still inspect category membership without exposing it publicly.
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
def base_data(db_session):
    # 1. Operational Categories
    trans_cat = models.OperationalCategory(
        id=1,
        name="Transport",
        key="transport",
        description="Vehicles, shuttles, and driver dispatch",
        display_order=1,
    )
    med_cat = models.OperationalCategory(
        id=2,
        name="Medical",
        key="medical",
        description="Emergency care and health services",
        display_order=2,
    )

    # 2. Operational Areas
    trans_area = models.OperationalArea(
        id=1,
        code="TRANSPORT",
        name="Transport Dispatch Desk",
        description="Station pickups and fleet dispatch",
        is_active=True,
    )
    med_area = models.OperationalArea(
        id=2,
        code="MEDICAL",
        name="Campus Medical Center",
        description="Clinic and ambulances",
        is_active=True,
    )

    # 3. Staff Members
    # Rajesh: Driver / Transport
    rajesh = models.StaffMember(
        id=1,
        full_name="Rajesh Kumar",
        phone="+91 98765 11111",
        email="rajesh@example.com",
        designation="Senior Driver",
        languages=["Hindi", "English"],
    )
    # Amit: Transport Manager
    amit = models.StaffMember(
        id=2,
        full_name="Amit Singh",
        phone="+91 98765 22222",
        email="amit@example.com",
        designation="Transport Head",
        languages=["Hindi", "English"],
    )
    # Imran: Additional Driver
    imran = models.StaffMember(
        id=3,
        full_name="Imran Khan",
        phone="+91 98765 33333",
        email="imran@example.com",
        designation="Fleet Coordinator",
        languages=["Hindi", "English"],
    )
    # 15 ordinary drivers who should NOT be exposed publicly
    ordinary_drivers = [
        models.StaffMember(
            id=10 + i,
            full_name=f"Driver Member {i}",
            phone=f"+91 98700 {10000 + i}",
            designation="Shuttle Driver",
            languages=["Hindi"],
        )
        for i in range(1, 16)
    ]

    db_session.add_all([trans_cat, med_cat, trans_area, med_area, rajesh, amit, imran] + ordinary_drivers)
    db_session.flush()

    # Link all drivers to Transport category (total 18 members in category)
    trans_cat.staff_members.extend([rajesh, amit, imran] + ordinary_drivers)
    db_session.commit()

    return {
        "trans_cat": trans_cat,
        "med_cat": med_cat,
        "trans_area": trans_area,
        "med_area": med_area,
        "rajesh": rajesh,
        "amit": amit,
        "imran": imran,
        "ordinary_drivers": ordinary_drivers,
    }


# =============================================================================
# SCENARIO 1: Ordinary category members are NOT returned publicly automatically
# =============================================================================
def test_ordinary_category_members_not_returned_publicly(client, base_data):
    """Transport category has 18 staff members; public endpoint must NOT expose ordinary category members."""
    # Create Transport group without lead or curated staff yet
    client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "is_active": True,
            "is_public": True,
        },
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    assert pub_res.status_code == 200
    groups = pub_res.json()
    assert len(groups) == 1
    g = groups[0]

    # Contacts list must be EMPTY because no duty incharge, head, or curated staff added yet!
    assert len(g["contacts"]) == 0
    # None of the 15 ordinary drivers should be present
    for d in base_data["ordinary_drivers"]:
        assert not any(c["name"] == d.full_name for c in g["contacts"])


# =============================================================================
# SCENARIO 2: Current ShiftOperationalIncharge is returned
# =============================================================================
def test_current_shift_incharge_returned(client, db_session, base_data):
    """Active ShiftOperationalIncharge is dynamically returned as DUTY INCHARGE."""
    now = datetime.now(timezone.utc)
    block = models.ShiftBlock(
        name="Morning Logistics Shift",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=3),
        status="SCHEDULED",
    )
    db_session.add(block)
    db_session.flush()

    # Rajesh is the incharge of Transport Area for this shift
    incharge = models.ShiftOperationalIncharge(
        shift_block_id=block.id,
        operational_area_id=base_data["trans_area"].id,
        staff_id=base_data["rajesh"].id,
    )
    staff_shift = models.StaffShift(shift_block_id=block.id, staff_id=base_data["rajesh"].id)
    db_session.add_all([incharge, staff_shift])
    db_session.commit()

    # Create Transport Contact Group linked to category and area
    client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "operational_area_id": base_data["trans_area"].id,
            "show_shift_incharges": True,
            "is_active": True,
            "is_public": True,
        },
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    g = pub_res.json()[0]

    assert len(g["contacts"]) == 1
    duty_c = g["contacts"][0]
    assert duty_c["name"] == "Rajesh Kumar"
    assert duty_c["incharge_type"] == "ACTIVE_SHIFT_INCHARGE"
    assert duty_c["is_incharge"] is True
    assert duty_c["is_on_shift"] is True
    assert duty_c["priority"] == 1


# =============================================================================
# SCENARIO 3: Head Incharge is returned
# =============================================================================
def test_head_incharge_returned(client, base_data):
    """ContactGroup.lead_staff_id is returned as DESIGNATED_LEAD."""
    client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "lead_staff_id": base_data["amit"].id,
            "is_active": True,
            "is_public": True,
        },
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    g = pub_res.json()[0]

    assert len(g["contacts"]) == 1
    head_c = g["contacts"][0]
    assert head_c["name"] == "Amit Singh"
    assert head_c["incharge_type"] == "DESIGNATED_LEAD"
    assert head_c["is_incharge"] is True
    assert head_c["priority"] == 2


# =============================================================================
# SCENARIO 4: Explicit ContactGroupStaff is returned
# =============================================================================
def test_explicit_contact_group_staff_returned(client, base_data):
    """Staff added via ContactGroupStaff are returned as ADDITIONAL_STAFF."""
    g_res = client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "is_active": True,
            "is_public": True,
        },
    )
    group_id = g_res.json()["id"]

    # Explicitly add Imran Khan
    client.post(
        f"/api/contacts/groups/{group_id}/staff",
        json={"staff_id": base_data["imran"].id, "role_override": "Intra-Campus Shuttle Lead"},
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    g = pub_res.json()[0]

    assert len(g["contacts"]) == 1
    add_c = g["contacts"][0]
    assert add_c["name"] == "Imran Khan"
    assert add_c["role_label"] == "Intra-Campus Shuttle Lead"
    assert add_c["incharge_type"] == "ADDITIONAL_STAFF"
    assert add_c["is_incharge"] is False
    assert add_c["priority"] == 3


# =============================================================================
# SCENARIO 5: ExternalContact is returned
# =============================================================================
def test_external_contact_returned(client, base_data):
    """External emergency numbers are returned as EXTERNAL."""
    g_res = client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "is_active": True,
            "is_public": True,
        },
    )
    group_id = g_res.json()["id"]

    client.post(
        f"/api/contacts/groups/{group_id}/external",
        json={"name": "City Ambulance Dispatch", "role_label": "Emergency Fleet", "phone": "108"},
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    g = pub_res.json()[0]

    assert len(g["contacts"]) == 1
    ext_c = g["contacts"][0]
    assert ext_c["name"] == "City Ambulance Dispatch"
    assert ext_c["phone"] == "108"
    assert ext_c["is_external"] is True
    assert ext_c["incharge_type"] == "EXTERNAL"
    assert ext_c["priority"] == 4


# =============================================================================
# SCENARIO 6 & 7: Same staff qualifying through multiple paths appears once
# Duty Incharge priority over Head / Additional
# =============================================================================
def test_same_staff_multiple_paths_appears_once_with_duty_incharge_priority(client, db_session, base_data):
    """Rajesh is Duty Incharge + Head Incharge + Additional Staff -> appears ONCE as DUTY INCHARGE."""
    now = datetime.now(timezone.utc)
    block = models.ShiftBlock(
        name="Duty Shift",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=3),
        status="SCHEDULED",
    )
    db_session.add(block)
    db_session.flush()

    # Rajesh is Active Shift Incharge
    incharge = models.ShiftOperationalIncharge(
        shift_block_id=block.id,
        operational_area_id=base_data["trans_area"].id,
        staff_id=base_data["rajesh"].id,
    )
    staff_shift = models.StaffShift(shift_block_id=block.id, staff_id=base_data["rajesh"].id)
    db_session.add_all([incharge, staff_shift])
    db_session.commit()

    # Also set Rajesh as lead_staff_id
    g_res = client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "operational_area_id": base_data["trans_area"].id,
            "lead_staff_id": base_data["rajesh"].id,
            "show_shift_incharges": True,
            "is_active": True,
            "is_public": True,
        },
    )
    group_id = g_res.json()["id"]

    # Also add Rajesh as curated staff
    client.post(
        f"/api/contacts/groups/{group_id}/staff",
        json={"staff_id": base_data["rajesh"].id, "role_override": "Curated Extra Role"},
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    g = pub_res.json()[0]

    # Rajesh must appear EXACTLY ONCE!
    rajesh_matches = [c for c in g["contacts"] if c["id"] == base_data["rajesh"].id]
    assert len(rajesh_matches) == 1

    # Highest priority role wins: ACTIVE_SHIFT_INCHARGE
    c = rajesh_matches[0]
    assert c["incharge_type"] == "ACTIVE_SHIFT_INCHARGE"
    assert c["is_incharge"] is True
    assert c["priority"] == 1


# =============================================================================
# SCENARIO 8: Head Incharge priority over Additional role
# =============================================================================
def test_head_incharge_priority_over_additional(client, base_data):
    """When a staff is Head Incharge and also in ContactGroupStaff, Head Incharge role wins."""
    g_res = client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "lead_staff_id": base_data["amit"].id,
            "is_active": True,
            "is_public": True,
        },
    )
    group_id = g_res.json()["id"]

    # Also add Amit as curated staff
    client.post(
        f"/api/contacts/groups/{group_id}/staff",
        json={"staff_id": base_data["amit"].id, "role_override": "Additional Driver"},
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    g = pub_res.json()[0]

    amit_matches = [c for c in g["contacts"] if c["id"] == base_data["amit"].id]
    assert len(amit_matches) == 1
    assert amit_matches[0]["incharge_type"] == "DESIGNATED_LEAD"
    assert amit_matches[0]["is_incharge"] is True
    assert amit_matches[0]["priority"] == 2


# =============================================================================
# SCENARIO 9: Contact Group works when no active shift/incharge exists
# =============================================================================
def test_group_works_when_no_active_shift_or_incharge(client, base_data):
    """When there is no active shift, the group still resolves Head, Additional, and External contacts."""
    g_res = client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "lead_staff_id": base_data["amit"].id,
            "show_shift_incharges": True,
            "is_active": True,
            "is_public": True,
        },
    )
    group_id = g_res.json()["id"]

    client.post(
        f"/api/contacts/groups/{group_id}/staff",
        json={"staff_id": base_data["imran"].id},
    )
    client.post(
        f"/api/contacts/groups/{group_id}/external",
        json={"name": "Local Taxi Stand", "phone": "+91 98765 99999"},
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    g = pub_res.json()[0]

    assert len(g["contacts"]) == 3
    types = [c["incharge_type"] for c in g["contacts"]]
    assert types == ["DESIGNATED_LEAD", "ADDITIONAL_STAFF", "EXTERNAL"]
    # No duty incharge was invented
    assert not any(c["incharge_type"] == "ACTIVE_SHIFT_INCHARGE" for c in g["contacts"])


# =============================================================================
# SCENARIO 10: Changing shift incharge immediately changes public resolution
# =============================================================================
def test_changing_shift_incharge_immediately_changes_public_resolution(client, db_session, base_data):
    """Shift handoff from Rajesh to Imran dynamically updates public directory without editing group."""
    now = datetime.now(timezone.utc)
    # Shift 1 (now)
    block1 = models.ShiftBlock(
        name="Shift 1",
        start_time=now - timedelta(hours=2),
        end_time=now + timedelta(hours=1),
        status="SCHEDULED",
    )
    db_session.add(block1)
    db_session.flush()

    inc1 = models.ShiftOperationalIncharge(
        shift_block_id=block1.id,
        operational_area_id=base_data["trans_area"].id,
        staff_id=base_data["rajesh"].id,
    )
    s1 = models.StaffShift(shift_block_id=block1.id, staff_id=base_data["rajesh"].id)
    db_session.add_all([inc1, s1])
    db_session.commit()

    # Create Group
    client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "operational_area_id": base_data["trans_area"].id,
            "show_shift_incharges": True,
            "is_active": True,
            "is_public": True,
        },
    )

    unauth_client = TestClient(app)
    pub_res1 = unauth_client.get("/api/public/contacts")
    assert pub_res1.json()[0]["contacts"][0]["name"] == "Rajesh Kumar"

    # Shift 1 ends, Shift 2 starts with Imran
    block1.status = "COMPLETED"
    block2 = models.ShiftBlock(
        name="Shift 2",
        start_time=now - timedelta(minutes=10),
        end_time=now + timedelta(hours=4),
        status="SCHEDULED",
    )
    db_session.add(block2)
    db_session.flush()

    inc2 = models.ShiftOperationalIncharge(
        shift_block_id=block2.id,
        operational_area_id=base_data["trans_area"].id,
        staff_id=base_data["imran"].id,
    )
    s2 = models.StaffShift(shift_block_id=block2.id, staff_id=base_data["imran"].id)
    db_session.add_all([inc2, s2])
    db_session.commit()

    pub_res2 = unauth_client.get("/api/public/contacts")
    assert pub_res2.json()[0]["contacts"][0]["name"] == "Imran Khan"


# =============================================================================
# SCENARIO 11: Updating Staff phone/languages reflects without duplication
# =============================================================================
def test_updating_staff_reflects_in_contacts(client, base_data):
    """Staff updates immediately show in Contacts without duplication."""
    client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "lead_staff_id": base_data["amit"].id,
            "is_active": True,
            "is_public": True,
        },
    )

    # Update Amit's phone
    put_res = client.put(
        f"/api/staff/{base_data['amit'].id}",
        json={
            "full_name": "Amit Singh",
            "phone": "+91 99999 77777",
            "languages": ["Hindi"],
            "designation": "Director of Logistics",
            # Staff numbers are hidden on the public page unless marked public.
            "phone_public": True,
        },
    )
    assert put_res.status_code == 200

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    c = pub_res.json()[0]["contacts"][0]
    assert c["phone"] == "+91 99999 77777"
    assert c["languages"] == ["Hindi"]
    assert c["role_label"] == "Director of Logistics"


# =============================================================================
# SCENARIO 12: Disabled Contact Groups excluded from public results
# =============================================================================
def test_disabled_groups_excluded_from_public(client, base_data):
    """Inactive or non-public groups are excluded from /api/public/contacts."""
    client.post(
        "/api/contacts/groups",
        json={"title": "Public Active Group", "is_active": True, "is_public": True},
    )
    client.post(
        "/api/contacts/groups",
        json={"title": "Internal Private Group", "is_active": True, "is_public": False},
    )
    client.post(
        "/api/contacts/groups",
        json={"title": "Disabled Group", "is_active": False, "is_public": True},
    )

    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    titles = [g["title"] for g in pub_res.json()]
    assert "Public Active Group" in titles
    assert "Internal Private Group" not in titles
    assert "Disabled Group" not in titles


# =============================================================================
# SCENARIO 13: Admin can inspect category membership without exposing publicly
# =============================================================================
def test_admin_can_inspect_category_membership_without_exposing_publicly(client, base_data):
    """Admin GET /api/contacts includes category_staff; public GET /api/public/contacts does NOT."""
    client.post(
        "/api/contacts/groups",
        json={
            "title": "Transport Assistance",
            "operational_category_id": base_data["trans_cat"].id,
            "lead_staff_id": base_data["amit"].id,
            "is_active": True,
            "is_public": True,
        },
    )

    # 1. Admin GET
    admin_res = client.get("/api/contacts")
    assert admin_res.status_code == 200
    admin_group = admin_res.json()[0]

    # Public contacts contains ONLY Amit (Head)
    assert len(admin_group["contacts"]) == 1
    assert admin_group["contacts"][0]["name"] == "Amit Singh"

    # Category staff contains all 18 members for internal admin reference!
    assert len(admin_group["category_staff"]) == 18
    cat_staff_names = [s["name"] for s in admin_group["category_staff"]]
    assert "Rajesh Kumar" in cat_staff_names
    assert "Driver Member 1" in cat_staff_names

    # 2. Public GET
    unauth_client = TestClient(app)
    pub_res = unauth_client.get("/api/public/contacts")
    pub_group = pub_res.json()[0]

    # Public contacts has only Amit
    assert len(pub_group["contacts"]) == 1
    assert pub_group["contacts"][0]["name"] == "Amit Singh"
    # category_staff is empty in public response
    assert len(pub_group.get("category_staff", [])) == 0


# =============================================================================
# SCENARIO 14: Simplified Primary & Backup Staff Contacts (Live Resolution)
# =============================================================================
def test_simplified_contacts_primary_and_backup_staff(client, base_data, db_session):
    """Primary & Backup contacts point to StaffMember; updates to staff details reflect immediately."""
    res = client.post(
        "/api/contacts",
        json={
            "title": "Accommodation Help",
            "description": "Hostel room allocation and bedding assistance",
            "category_name": "Accommodation",
            "primary_type": "staff",
            "primary_staff_id": base_data["amit"].id,
            "secondary_type": "staff",
            "secondary_staff_id": base_data["rajesh"].id,
            "is_public": True,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Accommodation Help"
    assert data["category_name"] == "Accommodation"
    assert data["primary_contact"]["name"] == "Amit Singh"
    assert data["primary_contact"]["phone"] == base_data["amit"].phone
    assert data["primary_contact"]["is_staff"] is True
    assert data["secondary_contact"]["name"] == "Rajesh Kumar"
    assert data["secondary_contact"]["phone"] == base_data["rajesh"].phone
    assert data["secondary_contact"]["is_staff"] is True

    # Live update test: Change Amit's phone number directly in Staff
    amit = db_session.get(models.StaffMember, base_data["amit"].id)
    amit.phone = "9999999999"
    db_session.commit()

    # Refetch from contacts endpoint
    get_res = client.get(f"/api/contacts/{data['id']}")
    assert get_res.status_code == 200
    updated_data = get_res.json()
    assert updated_data["primary_contact"]["phone"] == "9999999999"


# =============================================================================
# SCENARIO 15: Simplified External Primary & Backup Contacts
# =============================================================================
def test_simplified_contacts_external_contacts(client, db_session):
    """External contacts (e.g. Hospital, Ambulance, Police) are stored directly without fake StaffMember rows."""
    initial_staff_count = db_session.query(models.StaffMember).count()

    res = client.post(
        "/api/contacts",
        json={
            "title": "Emergency Medical Response",
            "description": "24/7 on-campus ambulance and city trauma center",
            "category_name": "Medical Emergency",
            "primary_type": "external",
            "primary_name": "City General Hospital",
            "primary_phone": "108",
            "primary_email": "emergency@cityhospital.org",
            "primary_role": "Trauma Center",
            "secondary_type": "external",
            "secondary_name": "On-Campus Ambulance Service",
            "secondary_phone": "9876500000",
            "secondary_role": "Fleet Driver",
            "is_public": True,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["primary_contact"]["name"] == "City General Hospital"
    assert data["primary_contact"]["phone"] == "108"
    assert data["primary_contact"]["is_external"] is True
    assert data["primary_contact"]["is_staff"] is False
    assert data["secondary_contact"]["name"] == "On-Campus Ambulance Service"
    assert data["secondary_contact"]["phone"] == "9876500000"
    assert data["secondary_contact"]["is_external"] is True

    # Confirm NO fake StaffMember records were created
    new_staff_count = db_session.query(models.StaffMember).count()
    assert new_staff_count == initial_staff_count


# =============================================================================
# SCENARIO 16: Dynamic Shift Incharge Convenience Routing & Deduplication
# =============================================================================
def test_simplified_contacts_dynamic_incharge(client, base_data, db_session):
    """When enabled, active shift incharge appears first. If already Primary, sets is_on_duty without duplicating."""
    now = datetime.now(timezone.utc)
    block = models.ShiftBlock(
        id=99,
        name="Night Emergency Shift",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=3),
        status="ACTIVE",
    )
    db_session.add(block)
    db_session.commit()

    # Create Transport Incharge row for Rajesh
    incharge_row = models.ShiftOperationalIncharge(
        shift_block_id=99,
        staff_id=base_data["rajesh"].id,
        operational_area_id=base_data["trans_area"].id,
    )
    db_session.add(incharge_row)
    db_session.commit()

    # Case A: Contact topic where Rajesh (the incharge) is NOT the primary contact (Amit is primary)
    res_a = client.post(
        "/api/contacts",
        json={
            "title": "Transport Help Desk",
            "category_name": "Transport",
            "operational_category_id": base_data["trans_cat"].id,
            "operational_area_id": base_data["trans_area"].id,
            "primary_type": "staff",
            "primary_staff_id": base_data["amit"].id,
            "use_shift_incharge": True,
            "is_public": True,
        },
    )
    assert res_a.status_code == 201
    data_a = res_a.json()
    # Current incharge Rajesh is returned as current_incharge with is_on_duty = True
    assert data_a["current_incharge"] is not None
    assert data_a["current_incharge"]["name"] == "Rajesh Kumar"
    assert data_a["current_incharge"]["is_on_duty"] is True
    # Primary Amit is still available
    assert data_a["primary_contact"]["name"] == "Amit Singh"

    # Case B: Deduplication - Contact topic where Rajesh IS already the primary contact
    res_b = client.post(
        "/api/contacts",
        json={
            "title": "Transport Dispatch Direct",
            "category_name": "Transport",
            "operational_category_id": base_data["trans_cat"].id,
            "operational_area_id": base_data["trans_area"].id,
            "primary_type": "staff",
            "primary_staff_id": base_data["rajesh"].id,
            "use_shift_incharge": True,
            "is_public": True,
        },
    )
    assert res_b.status_code == 201
    data_b = res_b.json()
    # Primary contact has is_on_duty = True, and current_incharge is None to avoid duplicate card!
    assert data_b["primary_contact"]["name"] == "Rajesh Kumar"
    assert data_b["primary_contact"]["is_on_duty"] is True
    assert data_b["current_incharge"] is None

    # Case C: Shift has ended - falls back to primary contact without incharge
    block.end_time = now - timedelta(minutes=5)
    db_session.commit()

    res_c = client.get(f"/api/contacts/{data_a['id']}")
    data_c = res_c.json()
    assert data_c["current_incharge"] is None
    assert data_c["primary_contact"]["name"] == "Amit Singh"
    assert data_c["primary_contact"]["is_on_duty"] is False

