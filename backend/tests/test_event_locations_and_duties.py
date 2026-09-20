"""Phase 2 tests: EventLocation model, DutyAssignment location refactor, and delete safety regression.

Covers:
A. Create EventLocation
B. Reject obvious duplicate EventLocation
C. Update EventLocation
D. Deactivate EventLocation
E. Unused EventLocation can be deleted if supported
F. Referenced EventLocation cannot be deleted (HTTP 409)
G. Existing legacy duty with room_id remains valid
H. New duty with EventLocation works
I. New duty can exist without room_id
J. Duty correctly returns EventLocation human-readable data
K. Duty linked to matching StaffShift works
L. Mismatched StaffShift/staff still rejected
M. Duty inside shift window works
N. Duty extending outside shift remains allowed (warning surfaced)
O. Emergency duty with no shift remains allowed
P. Inactive EventLocation rejected for NEW duty assignment
Q. Historical duty using deactivated EventLocation remains readable
R. ShiftBlock deletion with operational work returns HTTP 409 (Phase 1 safety regression)
"""
from datetime import datetime, timedelta, timezone
import io
import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
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
def sample_staff(db_session):
    staff = models.StaffMember(
        full_name="Rahul Sharma",
        phone="9876543210",
        email="rahul@example.com",
        category="Transport",
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)
    return staff


@pytest.fixture
def sample_room(db_session):
    bldg = models.Building(name="Main Block")
    db_session.add(bldg)
    db_session.commit()
    floor = models.Floor(name="Ground Floor", building_id=bldg.id)
    db_session.add(floor)
    db_session.commit()
    room = models.Room(name="Gate 1 Office", floor_id=floor.id)
    db_session.add(room)
    db_session.commit()
    db_session.refresh(room)
    return room


@pytest.fixture
def sample_area(db_session):
    area = models.OperationalArea(code="GROUND_MATCH", name="Ground / Match Operations")
    db_session.add(area)
    db_session.commit()
    db_session.refresh(area)
    return area


# --- A. Create EventLocation ---
def test_a_create_event_location(client):
    r = client.post(
        "/api/event-locations",
        json={
            "name": "Ground 1",
            "location_type": "GROUND",
            "description": "Main kabaddi arena court",
            "sort_order": 1,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"] is not None
    assert data["name"] == "Ground 1"
    assert data["location_type"] == "GROUND"
    assert data["description"] == "Main kabaddi arena court"
    assert data["is_active"] is True
    assert data["sort_order"] == 1


# --- B. Reject obvious duplicate EventLocation ---
def test_b_reject_duplicate_event_location(client):
    client.post(
        "/api/event-locations",
        json={"name": "Main Gate", "location_type": "GATE"},
    )
    # Exact duplicate
    r1 = client.post(
        "/api/event-locations",
        json={"name": "Main Gate", "location_type": "GATE"},
    )
    assert r1.status_code == 400
    assert "already exists" in r1.text

    # Case-insensitive / whitespace duplicate
    r2 = client.post(
        "/api/event-locations",
        json={"name": "  main gate  ", "location_type": "GATE"},
    )
    assert r2.status_code == 400
    assert "already exists" in r2.text


# --- C. Update EventLocation ---
def test_c_update_event_location(client):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Dining Hall", "location_type": "FOOD", "description": "Old mess"},
    ).json()

    r = client.put(
        f"/api/event-locations/{loc['id']}",
        json={"description": "Central dining pavilion", "sort_order": 5},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["description"] == "Central dining pavilion"
    assert data["sort_order"] == 5


# --- D. Deactivate EventLocation ---
def test_d_deactivate_event_location(client):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Old Bus Stand", "location_type": "TRANSPORT"},
    ).json()

    r = client.put(f"/api/event-locations/{loc['id']}", json={"is_active": False})
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    # Verify active_only filter works
    active_locs = client.get("/api/event-locations?active_only=true").json()
    assert not any(l["id"] == loc["id"] for l in active_locs)

    all_locs = client.get("/api/event-locations").json()
    assert any(l["id"] == loc["id"] for l in all_locs)


# --- E. Unused EventLocation can be deleted if supported ---
def test_e_unused_event_location_can_be_deleted(client):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Temporary Booth", "location_type": "OPERATIONS"},
    ).json()

    r = client.delete(f"/api/event-locations/{loc['id']}")
    assert r.status_code == 204

    # Verify it is deleted
    r_get = client.get(f"/api/event-locations/{loc['id']}")
    assert r_get.status_code == 404


# --- F. Referenced EventLocation cannot be deleted ---
def test_f_referenced_event_location_cannot_be_deleted(client, sample_staff, sample_area):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Control Room", "location_type": "OPERATIONS"},
    ).json()

    # Assign duty to this location
    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "location_id": loc["id"],
            "duty_type": "Match Control",
            "operational_area_id": sample_area.id,
        },
    ).json()
    assert duty["location_id"] == loc["id"]

    # Deletion must be rejected with HTTP 409
    r = client.delete(f"/api/event-locations/{loc['id']}")
    assert r.status_code == 409
    assert "Location is used by existing duties. Deactivate it instead." in r.text


# --- G. Existing legacy duty with room_id remains valid ---
def test_g_legacy_duty_with_room_id_remains_valid(client, sample_staff, sample_room, sample_area):
    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "room_id": sample_room.id,
            "duty_type": "Lodging",
            "operational_area_id": sample_area.id,
            "notes": "Hostel room reception",
        },
    )
    assert r.status_code == 201
    duty = r.json()
    assert duty["room_id"] == sample_room.id
    assert duty["room_name"] == "Gate 1 Office"
    assert duty["location_id"] is None


# --- H. New duty with EventLocation works ---
def test_h_new_duty_with_event_location_works(client, sample_staff, sample_area):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Ground 2", "location_type": "GROUND"},
    ).json()

    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "location_id": loc["id"],
            "duty_type": "Ground Coordination",
            "operational_area_id": sample_area.id,
        },
    )
    assert r.status_code == 201
    duty = r.json()
    assert duty["location_id"] == loc["id"]
    assert duty["duty_type"] == "Ground Coordination"


# --- I. New duty can exist without room_id ---
def test_i_new_duty_without_room_id(client, sample_staff, sample_area):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Main Gate Reception", "location_type": "GATE"},
    ).json()

    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "location_id": loc["id"],
            "duty_type": "Team Reception",
            "operational_area_id": sample_area.id,
        },
    )
    assert r.status_code == 201
    duty = r.json()
    assert duty["room_id"] is None
    assert duty["location_id"] == loc["id"]


# --- J. Duty correctly returns EventLocation human-readable data ---
def test_j_duty_returns_event_location_readable_data(client, sample_staff, sample_area):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Medical Center", "location_type": "MEDICAL"},
    ).json()

    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "location_id": loc["id"],
            "duty_type": "Medical",
            "operational_area_id": sample_area.id,
        },
    ).json()

    assert duty["location_name"] == "Medical Center"
    assert duty["location_type"] == "MEDICAL"

    # Query duty via list endpoint
    duties_list = client.get(f"/api/staff/duties?location_id={loc['id']}").json()
    assert len(duties_list) == 1
    assert duties_list[0]["location_name"] == "Medical Center"


# --- K. Duty linked to matching StaffShift works ---
def test_k_duty_linked_to_matching_staff_shift(client, sample_staff, sample_area):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Morning Operations",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    shift_id = block["staff_assignments"][0]["id"]

    loc = client.post(
        "/api/event-locations",
        json={"name": "Mat 1", "location_type": "MAT"},
    ).json()

    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": shift_id,
            "location_id": loc["id"],
            "duty_type": "Ground Coordination",
            "operational_area_id": sample_area.id,
        },
    ).json()
    assert duty["shift_id"] == shift_id
    assert duty["shift_name"] == "Morning Operations"


# --- L. Mismatched StaffShift/staff still rejected ---
def test_l_mismatched_staff_shift_rejected(client, db_session, sample_staff, sample_area):
    staff2 = models.StaffMember(full_name="Amit Singh")
    db_session.add(staff2)
    db_session.commit()

    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Evening Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [staff2.id],
        },
    ).json()
    amit_shift_id = block["staff_assignments"][0]["id"]

    loc = client.post(
        "/api/event-locations",
        json={"name": "Security Post", "location_type": "SECURITY"},
    ).json()

    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,  # Rahul
            "shift_id": amit_shift_id,    # Amit's shift
            "location_id": loc["id"],
            "duty_type": "Security",
            "operational_area_id": sample_area.id,
        },
    )
    assert r.status_code == 400
    assert "Duty staff_id does not match shift staff_id" in r.text


# --- M. Duty inside shift window works ---
def test_m_duty_inside_shift_window(client, sample_staff, sample_area):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Day Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=8)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    shift_id = block["staff_assignments"][0]["id"]

    loc = client.post(
        "/api/event-locations",
        json={"name": "Ground 3", "location_type": "GROUND"},
    ).json()

    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": shift_id,
            "location_id": loc["id"],
            "duty_type": "Ground Coordination",
            "operational_area_id": sample_area.id,
            "start_time": (now + timedelta(hours=1)).isoformat(),
            "end_time": (now + timedelta(hours=3)).isoformat(),
        },
    ).json()
    assert duty.get("warning") is None


# --- N. Duty extending outside shift remains allowed ---
def test_n_duty_extending_outside_shift_allowed_with_warning(client, sample_staff, sample_area):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Strict Window Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),  # 0 to 4 hours
            "staff_ids": [sample_staff.id],
        },
    ).json()
    shift_id = block["staff_assignments"][0]["id"]

    loc = client.post(
        "/api/event-locations",
        json={"name": "Handover Gate", "location_type": "GATE"},
    ).json()

    # Duty extends to hour 6 (outside shift window of 4 hours)
    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": shift_id,
            "location_id": loc["id"],
            "duty_type": "Security",
            "operational_area_id": sample_area.id,
            "start_time": (now + timedelta(hours=2)).isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
        },
    )
    assert r.status_code == 201
    duty = r.json()
    assert duty["warning"] == "Duty extends outside assigned shift window."


# --- O. Emergency duty with no shift remains allowed ---
def test_o_emergency_duty_without_shift_allowed(client, sample_staff, sample_area):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Emergency Entrance", "location_type": "GATE"},
    ).json()

    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": None,
            "location_id": loc["id"],
            "duty_type": "General Operations",
            "operational_area_id": sample_area.id,
            "notes": "Unscheduled emergency response duty",
        },
    )
    assert r.status_code == 201
    duty = r.json()
    assert duty["shift_id"] is None
    assert duty["location_name"] == "Emergency Entrance"


# --- S. Outside-shift warning is computed live, so it also surfaces on every
# read path (list, shift detail, self-service), not just the create/update
# response it used to be attached to transiently ---
def test_s_outside_shift_warning_surfaces_on_read_paths(client, db_session, sample_staff, sample_area):
    from app.auth_utils import hash_password

    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Evening Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    shift_id = block["staff_assignments"][0]["id"]

    loc = client.post("/api/event-locations", json={"name": "Depot", "location_type": "GATE"}).json()

    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": shift_id,
            "location_id": loc["id"],
            "duty_type": "Transport",
            "operational_area_id": sample_area.id,
            "start_time": (now + timedelta(hours=6)).isoformat(),
            "end_time": (now + timedelta(hours=7)).isoformat(),  # 1h past shift end
        },
    )
    assert r.status_code == 201
    duty_id = r.json()["id"]
    assert r.json()["outside_shift_minutes"] == 60

    # GET /staff/duties (list) — not just the create response
    listed = client.get("/api/staff/duties").json()
    row = next(d for d in listed if d["id"] == duty_id)
    assert row["warning"] == "Duty extends outside assigned shift window."
    assert row["outside_shift_minutes"] == 60

    # GET /staff/shifts/{id} — the organizer shift roster's duties list
    shift_detail = client.get(f"/api/staff/shifts/{shift_id}").json()
    nested = next(d for d in shift_detail["duties"] if d["id"] == duty_id)
    assert nested["outside_shift_minutes"] == 60

    # Self-service /api/me/duties for that same staff member
    login = models.OrganizerUser(
        username="TRANSPORTSTAFF",
        password_hash=hash_password("pass1234"),
        is_active=True,
        is_admin=False,
        permissions=schemas.STAFF_BASE_PERMISSIONS,
        staff_members=[sample_staff],
    )
    db_session.add(login)
    db_session.commit()

    me_client_login = client.post("/api/auth/login", json={"username": "TRANSPORTSTAFF", "password": "pass1234"})
    assert me_client_login.status_code == 200
    my_duties = client.get("/api/me/duties").json()
    mine = next(d for d in my_duties if d["id"] == duty_id)
    assert mine["outside_shift_minutes"] == 60
    assert mine["warning"] == "Duty extends outside assigned shift window."


# --- P. Inactive EventLocation rejected for NEW duty assignment ---
def test_p_inactive_event_location_rejected_for_new_duty(client, sample_staff, sample_area):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Renovation Ground", "location_type": "GROUND"},
    ).json()

    # Deactivate location
    client.put(f"/api/event-locations/{loc['id']}", json={"is_active": False})

    # Attempt to assign new duty to inactive location
    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "location_id": loc["id"],
            "duty_type": "Ground Coordination",
            "operational_area_id": sample_area.id,
        },
    )
    assert r.status_code == 400
    assert "is inactive and cannot be used for new duty assignments" in r.text


# --- Q. Historical duty using deactivated EventLocation remains readable ---
def test_q_historical_duty_with_deactivated_location_readable(client, sample_staff, sample_area):
    loc = client.post(
        "/api/event-locations",
        json={"name": "Historic Court", "location_type": "GROUND"},
    ).json()

    # Assign duty while active
    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "location_id": loc["id"],
            "duty_type": "Match Control",
            "operational_area_id": sample_area.id,
        },
    ).json()

    # Now deactivate location
    client.put(f"/api/event-locations/{loc['id']}", json={"is_active": False})

    # Read duty back
    duties = client.get(f"/api/staff/duties?staff_id={sample_staff.id}").json()
    matched = [d for d in duties if d["id"] == duty["id"]][0]
    assert matched["location_name"] == "Historic Court"
    assert matched["location_id"] == loc["id"]


# --- R. ShiftBlock deletion with operational work returns HTTP 409 (Phase 1 safety regression) ---
def test_r_shift_block_delete_safety_regression(client, sample_staff, sample_area):
    now = datetime.now(timezone.utc)

    # 1. Empty shift block deletion -> Allowed (204)
    empty_block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Delete Me Empty",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=2)).isoformat(),
            "staff_ids": [],
        },
    ).json()
    assert client.delete(f"/api/staff/shift-blocks/{empty_block['id']}").status_code == 204

    # 2. Shift block with staff assignments but NO duties/tasks -> Allowed (204)
    assigned_block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Delete Me Assigned",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=2)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    assert client.delete(f"/api/staff/shift-blocks/{assigned_block['id']}").status_code == 204

    # 3. Shift block with attached duty -> HTTP 409 Conflict
    active_block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Protected Shift Block",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    shift_id = active_block["staff_assignments"][0]["id"]

    client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": shift_id,
            "duty_type": "General Operations",
            "operational_area_id": sample_area.id,
        },
    )

    r_del = client.delete(f"/api/staff/shift-blocks/{active_block['id']}")
    assert r_del.status_code == 409
    assert "Cannot delete this shift because operational duties or tasks are attached" in r_del.text


# --- S. Duty reports populate Location, Building, Room, and Local Time ---
def test_s_duty_reports_populate_location_building_room_and_local_time(client, db_session, sample_staff, sample_area):
    # 1. Create building, floor, room hierarchy
    bldg = models.Building(name="Sarojini Hostel")
    db_session.add(bldg)
    db_session.flush()

    flr = models.Floor(name="1st Floor", building_id=bldg.id)
    db_session.add(flr)
    db_session.flush()

    rm = models.Room(name="Room 105", floor_id=flr.id, capacity=4)
    db_session.add(rm)
    db_session.commit()

    # 2. Assign duty with room location and specific UTC time (03:30 UTC = 09:00 IST)
    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "location_source": "room",
            "location_source_id": rm.id,
            "duty_type": "Hostel Incharge",
            "operational_area_id": sample_area.id,
            "start_time": "2026-09-18T03:30:00Z",
            "end_time": "2026-09-18T11:30:00Z",
        },
    )
    assert r.status_code == 201

    # 3. Test GET /api/export/live-detail/duty
    detail_res = client.get("/api/export/live-detail/duty")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert "Location" in detail["columns"]
    assert "Building" in detail["columns"]
    assert "Room" in detail["columns"]
    assert "Start" in detail["columns"]
    assert "End" in detail["columns"]

    # Check the row
    loc_idx = detail["columns"].index("Location")
    bldg_idx = detail["columns"].index("Building")
    room_idx = detail["columns"].index("Room")
    start_idx = detail["columns"].index("Start")
    end_idx = detail["columns"].index("End")

    row = detail["rows"][0]
    assert "Sarojini Hostel" in row[loc_idx]
    assert "Room 105" in row[loc_idx]
    assert row[bldg_idx] == "Sarojini Hostel"
    assert row[room_idx] == "Room 105"
    # Local Indian time: 03:30 UTC -> 09:00 IST
    assert "09:00" in row[start_idx]
    assert "17:00" in row[end_idx]

    # 4. Test GET /api/export/duties.xlsx
    xlsx_res = client.get("/api/export/duties.xlsx")
    assert xlsx_res.status_code == 200
    assert len(xlsx_res.content) > 0

    # 5. Test GET /api/staff-reports/duties
    sr_res = client.get("/api/staff-reports/duties")
    assert sr_res.status_code == 200
    sr_data = sr_res.json()
    assert sr_data["total"] >= 1
    sr_row = sr_data["rows"][0]
    assert sr_row["building"] == "Sarojini Hostel"
    assert sr_row["room"] == "Room 105"
    assert "09:00" in sr_row["duty_time_span"]
    assert "17:00" in sr_row["duty_time_span"]

    # 6. Test GET /api/staff-reports/duties.xlsx
    sr_xlsx = client.get("/api/staff-reports/duties.xlsx")
    assert sr_xlsx.status_code == 200
    assert len(sr_xlsx.content) > 0


# --- T. Task report integrated in Duty report (detail, xlsx multi-sheet, staff-reports) ---
def test_t_task_report_in_duty_report_integration(client, db_session, sample_staff, sample_area):
    # 1. Create building, room
    bldg = models.Building(name="Tagore Bhavan")
    db_session.add(bldg)
    db_session.flush()

    flr = models.Floor(name="Ground Floor", building_id=bldg.id)
    db_session.add(flr)
    db_session.flush()

    rm = models.Room(name="Control Room 01", floor_id=flr.id, capacity=6)
    db_session.add(rm)
    db_session.flush()

    # 2. Create Shift Block and Staff Shift
    sb = models.ShiftBlock(
        name="Morning Deployment",
        start_time=datetime(2026, 9, 21, 6, 0, 0, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 21, 14, 0, 0, tzinfo=timezone.utc),
        status="ACTIVE",
    )
    db_session.add(sb)
    db_session.flush()

    staff_shift = models.StaffShift(
        staff_id=sample_staff.id,
        shift_block_id=sb.id,
    )
    db_session.add(staff_shift)
    db_session.flush()

    # 3. Create Duty Assignment for this staff and shift
    duty = models.DutyAssignment(
        staff_id=sample_staff.id,
        shift_id=staff_shift.id,
        operational_area_id=sample_area.id,
        room_id=rm.id,
        duty_type="Venue Incharge",
        start_time=datetime(2026, 9, 21, 6, 0, 0, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 21, 14, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add(duty)
    db_session.flush()

    # 4. Create Tasks assigned to this staff member linked to this shift
    task1 = models.Task(
        title="Check Venue Perimeter & Gates",
        category="Security",
        priority="urgent",
        status="pending",
        assigned_staff_id=sample_staff.id,
        shift_id=staff_shift.id,
        due_date=datetime(2026, 9, 21, 7, 0, 0, tzinfo=timezone.utc),
    )
    task2 = models.Task(
        title="Verify Water Refill Stations",
        category="Logistics",
        priority="normal",
        status="completed",
        assigned_staff_id=sample_staff.id,
        shift_id=staff_shift.id,
        due_date=datetime(2026, 9, 21, 8, 0, 0, tzinfo=timezone.utc),
    )
    db_session.add_all([task1, task2])
    db_session.commit()

    # A. Test Live Detail: GET /api/export/live-detail/duty
    res_detail = client.get("/api/export/live-detail/duty")
    assert res_detail.status_code == 200
    detail_data = res_detail.json()
    assert "Assigned Tasks" in detail_data["columns"]
    task_col_idx = detail_data["columns"].index("Assigned Tasks")

    matching_row = next(
        (row for row in detail_data["rows"] if row[0] == sample_staff.full_name and "Venue Incharge" in row), None
    )
    assert matching_row is not None
    tasks_text = matching_row[task_col_idx]
    assert "Check Venue Perimeter & Gates" in tasks_text
    assert "Verify Water Refill Stations" in tasks_text

    # B. Test Excel: GET /api/export/duties.xlsx
    res_xlsx = client.get("/api/export/duties.xlsx")
    assert res_xlsx.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(res_xlsx.content))
    assert "Duty Roster" in wb.sheetnames
    assert "Task Report" in wb.sheetnames

    ws_tasks = wb["Task Report"]
    task_titles = [cell.value for row in ws_tasks.iter_rows(min_row=8) for cell in row if cell.value]
    assert "Check Venue Perimeter & Gates" in task_titles
    assert "Verify Water Refill Stations" in task_titles

    # C. Test Staff Reports API: GET /api/staff-reports/duties
    res_sr = client.get("/api/staff-reports/duties")
    assert res_sr.status_code == 200
    sr_data = res_sr.json()
    assert "task_summary" in sr_data
    assert sr_data["task_summary"]["total_linked_tasks"] >= 2
    assert sr_data["task_summary"]["completed_tasks"] >= 1

    sr_duty = next((r for r in sr_data["rows"] if r["id"] == duty.id), None)
    assert sr_duty is not None
    assert sr_duty["task_count"] == 2
    assert any(t["title"] == "Check Venue Perimeter & Gates" for t in sr_duty["tasks"])

    # D. Test Staff Reports Excel: GET /api/staff-reports/duties.xlsx
    res_sr_xlsx = client.get("/api/staff-reports/duties.xlsx")
    assert res_sr_xlsx.status_code == 200
    wb_sr = openpyxl.load_workbook(io.BytesIO(res_sr_xlsx.content))
    assert "Duty Assignments" in wb_sr.sheetnames
    assert "Task Report" in wb_sr.sheetnames

