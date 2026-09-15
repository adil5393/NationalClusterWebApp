"""Tests for StaffShift model, shift associations, duty/task links, and API validation.

Covers:
A. Create valid shift
B. Reject end_time <= start_time
C. Multiple shifts for same StaffMember
D. Duty linked to matching staff shift
E. Reject duty where duty.staff_id != shift.staff_id
F. Task linked to matching staff shift
G. Reject task where assigned_staff_id != shift.staff_id
H. Existing duty without shift remains valid
I. Existing task without shift remains valid
J. Current/on-shift calculation
K. Cancelled shift is not considered currently active
L. Staff deletion correctly handles shifts
"""
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app import models, schemas
from app.security import require_auth


# Setup in-memory test database for fast, isolated unit test execution
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

    # Create dummy admin organizer user with valid bcrypt hash
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


# --- A. Create ShiftBlock ---
def test_a_create_shift_block(client):
    now = datetime.now(timezone.utc)
    start = now + timedelta(hours=1)
    end = start + timedelta(hours=8)

    payload = {
        "name": "Morning Shift",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "notes": "Main morning operations block",
    }
    r = client.post("/api/staff/shift-blocks", json=payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == "Morning Shift"
    assert data["status"] == "SCHEDULED"
    assert data["derived_status"] == "UPCOMING"
    assert data["is_active"] is False
    assert data["staff_count"] == 0


# --- B. Reject ShiftBlock end_time <= start_time ---
def test_b_reject_invalid_shift_times(client):
    now = datetime.now(timezone.utc)
    payload = {
        "name": "Invalid Shift",
        "start_time": now.isoformat(),
        "end_time": (now - timedelta(hours=2)).isoformat(),
    }
    r = client.post("/api/staff/shift-blocks", json=payload)
    assert r.status_code == 400
    assert "end_time must be strictly after start_time" in r.text


# --- C. Assign one StaffMember to ShiftBlock ---
def test_c_assign_one_staff_to_shift_block(client, sample_staff):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Transport Morning",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    assert block["staff_count"] == 1
    assignment = block["staff_assignments"][0]
    assert assignment["staff_id"] == sample_staff.id
    assert assignment["staff_name"] == "Rahul Sharma"
    assert assignment["shift_name"] == "Transport Morning"


# --- D. Bulk assign multiple StaffMembers ---
def test_d_bulk_assign_multiple_staff(client, db_session, sample_staff):
    staff2 = models.StaffMember(full_name="Priya Patel", category="Medical")
    staff3 = models.StaffMember(full_name="Amit Singh", category="Security")
    db_session.add_all([staff2, staff3])
    db_session.commit()

    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "General Evening Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=8)).isoformat(),
        },
    ).json()

    # Sync staff using PUT /shift-blocks/{id}/staff
    r = client.put(
        f"/api/staff/shift-blocks/{block['id']}/staff",
        json={"staff_ids": [sample_staff.id, staff2.id, staff3.id]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["staff_count"] == 3
    assigned_ids = [a["staff_id"] for a in data["staff_assignments"]]
    assert set(assigned_ids) == {sample_staff.id, staff2.id, staff3.id}


# --- E. Duplicate StaffMember cannot appear twice in same ShiftBlock ---
def test_e_duplicate_staff_prevented(client, sample_staff):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Single Duty Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),
            "staff_ids": [sample_staff.id, sample_staff.id, sample_staff.id],
        },
    ).json()

    # Deduplication in creation/sync ensures unique assignment
    assert block["staff_count"] == 1


# --- F. Same StaffMember can belong to different ShiftBlocks ---
def test_f_staff_can_belong_to_multiple_shift_blocks(client, sample_staff):
    now = datetime.now(timezone.utc)
    b1 = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Day 1 Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    b2 = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Day 2 Shift",
            "start_time": (now + timedelta(days=1)).isoformat(),
            "end_time": (now + timedelta(days=1, hours=4)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    # Query staff's shifts
    r = client.get(f"/api/staff/shifts?staff_id={sample_staff.id}")
    assert r.status_code == 200
    shifts = r.json()
    assert len(shifts) == 2
    block_ids = [s["shift_block_id"] for s in shifts]
    assert b1["id"] in block_ids
    assert b2["id"] in block_ids


# --- G. Derived UPCOMING state from ShiftBlock ---
def test_g_derived_upcoming_state(client, sample_staff):
    now = datetime.now(timezone.utc)
    future_start = now + timedelta(hours=3)
    future_end = now + timedelta(hours=9)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Future Shift",
            "start_time": future_start.isoformat(),
            "end_time": future_end.isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    assert block["derived_status"] == "UPCOMING"
    assert block["is_active"] is False

    # Check StaffShift assignment derived state
    assignment = block["staff_assignments"][0]
    assert assignment["derived_status"] == "UPCOMING"
    assert assignment["is_active"] is False


# --- H. Derived ON_SHIFT state from ShiftBlock ---
def test_h_derived_on_shift_state(client, sample_staff):
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(hours=1)
    current_end = now + timedelta(hours=5)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Active Shift",
            "start_time": current_start.isoformat(),
            "end_time": current_end.isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    assert block["derived_status"] == "ON_SHIFT"
    assert block["is_active"] is True

    assignment = block["staff_assignments"][0]
    assert assignment["derived_status"] == "ON_SHIFT"
    assert assignment["is_active"] is True


# --- I. Derived COMPLETED state from ShiftBlock ---
def test_i_derived_completed_state(client, sample_staff):
    now = datetime.now(timezone.utc)
    past_start = now - timedelta(hours=6)
    past_end = now - timedelta(hours=1)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Past Shift",
            "start_time": past_start.isoformat(),
            "end_time": past_end.isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    assert block["derived_status"] == "COMPLETED"
    assert block["is_active"] is False

    assignment = block["staff_assignments"][0]
    assert assignment["derived_status"] == "COMPLETED"
    assert assignment["is_active"] is False


# --- J. CANCELLED ShiftBlock is never active ---
def test_j_cancelled_shift_never_active(client, sample_staff):
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(hours=1)
    current_end = now + timedelta(hours=5)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Cancelled Shift",
            "start_time": current_start.isoformat(),
            "end_time": current_end.isoformat(),
            "status": "CANCELLED",
            "staff_ids": [sample_staff.id],
        },
    ).json()

    assert block["status"] == "CANCELLED"
    assert block["derived_status"] == "CANCELLED"
    assert block["is_active"] is False

    assignment = block["staff_assignments"][0]
    assert assignment["derived_status"] == "CANCELLED"
    assert assignment["is_active"] is False


# --- K. Duty linked to correct StaffShift ---
def test_k_duty_linked_to_correct_staff_shift(client, sample_staff, sample_room):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Reception Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    staff_shift_id = block["staff_assignments"][0]["id"]

    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": staff_shift_id,
            "room_id": sample_room.id,
            "duty_type": "Reception",
        },
    ).json()

    assert duty["shift_id"] == staff_shift_id
    assert duty["staff_id"] == sample_staff.id

    # Check shift detail
    detail = client.get(f"/api/staff/shifts/{staff_shift_id}").json()
    assert detail["duty_count"] == 1
    assert detail["duties"][0]["id"] == duty["id"]


# --- L. Reject Duty linked to another StaffMember's StaffShift ---
def test_l_reject_duty_mismatched_staff_shift(client, db_session, sample_staff, sample_room):
    staff2 = models.StaffMember(full_name="Priya Patel")
    db_session.add(staff2)
    db_session.commit()

    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Morning Shift",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),
            "staff_ids": [staff2.id],
        },
    ).json()
    priya_shift_id = block["staff_assignments"][0]["id"]

    # Attempt to assign duty with sample_staff (Rahul) to Priya's StaffShift
    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": priya_shift_id,
            "room_id": sample_room.id,
            "duty_type": "Security",
        },
    )
    assert r.status_code == 400
    assert "Duty staff_id does not match shift staff_id" in r.text


# --- M. Task linked to correct StaffShift ---
def test_m_task_linked_to_correct_staff_shift(client, sample_staff):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Operations Block",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    staff_shift_id = block["staff_assignments"][0]["id"]

    task = client.post(
        "/api/tasks",
        json={
            "title": "Distribute ID badges",
            "category": "Reception",
            "assigned_staff_id": sample_staff.id,
            "shift_id": staff_shift_id,
        },
    ).json()

    assert task["shift_id"] == staff_shift_id
    assert task["assigned_staff_id"] == sample_staff.id

    # Check shift detail
    detail = client.get(f"/api/staff/shifts/{staff_shift_id}").json()
    assert detail["task_count"] == 1
    assert detail["tasks"][0]["id"] == task["id"]


# --- N. Reject Task linked to another StaffMember's StaffShift ---
def test_n_reject_task_mismatched_staff_shift(client, db_session, sample_staff):
    staff2 = models.StaffMember(full_name="Priya Patel")
    db_session.add(staff2)
    db_session.commit()

    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Operations Block",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [staff2.id],
        },
    ).json()
    priya_shift_id = block["staff_assignments"][0]["id"]

    # Assign task to sample_staff (Rahul) but pass Priya's StaffShift
    r = client.post(
        "/api/tasks",
        json={
            "title": "Check ground setup",
            "category": "Ground",
            "assigned_staff_id": sample_staff.id,
            "shift_id": priya_shift_id,
        },
    )
    assert r.status_code == 400
    assert "Task assigned_staff_id does not match shift staff_id" in r.text


# --- O. Legacy Duty without shift remains valid ---
def test_o_legacy_duty_without_shift_valid(client, sample_staff, sample_room):
    r = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "room_id": sample_room.id,
            "duty_type": "Medical",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["shift_id"] is None
    assert data["duty_type"] == "Medical"


# --- P. Legacy Task without shift remains valid ---
def test_p_legacy_task_without_shift_valid(client, sample_staff):
    r = client.post(
        "/api/tasks",
        json={
            "title": "General campus check",
            "category": "General",
            "assigned_staff_id": sample_staff.id,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["shift_id"] is None
    assert data["assigned_staff_id"] == sample_staff.id


# --- Q. Time overlap does NOT automatically link Duty/Task ---
def test_q_time_overlap_does_not_auto_link(client, sample_staff, sample_room):
    now = datetime.now(timezone.utc)
    shift_start = now.replace(hour=8, minute=0, second=0, microsecond=0)
    shift_end = now.replace(hour=16, minute=0, second=0, microsecond=0)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Common 8-4 Block",
            "start_time": shift_start.isoformat(),
            "end_time": shift_end.isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    staff_shift_id = block["staff_assignments"][0]["id"]

    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "room_id": sample_room.id,
            "duty_type": "Security",
            "start_time": (shift_start + timedelta(hours=2)).isoformat(),
            "end_time": (shift_start + timedelta(hours=4)).isoformat(),
        },
    ).json()
    assert duty["shift_id"] is None

    task = client.post(
        "/api/tasks",
        json={
            "title": "Check lunch queue",
            "category": "Fooding",
            "assigned_staff_id": sample_staff.id,
            "due_date": (shift_start + timedelta(hours=5)).isoformat(),
        },
    ).json()
    assert task["shift_id"] is None

    detail = client.get(f"/api/staff/shifts/{staff_shift_id}").json()
    assert detail["duty_count"] == 0
    assert detail["task_count"] == 0


# --- R. Removing StaffShift with linked Duty/Task is rejected by bulk assignment synchronization ---
def test_r_reject_sync_removal_with_linked_operational_work(client, db_session, sample_staff, sample_room):
    staff2 = models.StaffMember(full_name="Priya Patel")
    db_session.add(staff2)
    db_session.commit()

    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Morning Transport",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),
            "staff_ids": [sample_staff.id, staff2.id],
        },
    ).json()

    rahul_shift_id = [a["id"] for a in block["staff_assignments"] if a["staff_id"] == sample_staff.id][0]

    # Attach a duty to Rahul's shift
    client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": rahul_shift_id,
            "room_id": sample_room.id,
            "duty_type": "Transport",
        },
    )

    # Attempt to sync staff keeping only Priya (removing Rahul who has linked work)
    r = client.put(
        f"/api/staff/shift-blocks/{block['id']}/staff",
        json={"staff_ids": [staff2.id]},
    )
    assert r.status_code == 409
    assert "Cannot remove Rahul Sharma" in r.text
    assert "duties" in r.text


# --- S. Deleting ShiftBlock safety & DB preservation ---
def test_s_deleting_shift_block_preserves_duties_and_tasks(client, db_session, sample_staff, sample_room):
    now = datetime.now(timezone.utc)

    # Rule A: Empty ShiftBlock -> deletion allowed
    empty_block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Empty Block",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=2)).isoformat(),
            "staff_ids": [],
        },
    ).json()
    r_empty = client.delete(f"/api/staff/shift-blocks/{empty_block['id']}")
    assert r_empty.status_code == 204

    # Rule B: ShiftBlock with staff assignments but NO duties/tasks -> deletion allowed
    staff_only_block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Staff Only Block",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=2)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    r_staff_only = client.delete(f"/api/staff/shift-blocks/{staff_only_block['id']}")
    assert r_staff_only.status_code == 204

    # Rule C: ShiftBlock with linked duties/tasks -> HTTP 409 Conflict
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Temporary Shift Block",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    staff_shift_id = block["staff_assignments"][0]["id"]

    duty = client.post(
        "/api/staff/duties",
        json={
            "staff_id": sample_staff.id,
            "shift_id": staff_shift_id,
            "room_id": sample_room.id,
            "duty_type": "Ground Support",
        },
    ).json()

    task = client.post(
        "/api/tasks",
        json={
            "title": "Check scoreboard cable",
            "category": "Ground",
            "assigned_staff_id": sample_staff.id,
            "shift_id": staff_shift_id,
        },
    ).json()

    # Attempt to delete ShiftBlock via API -> Rejected with 409
    r_rejected = client.delete(f"/api/staff/shift-blocks/{block['id']}")
    assert r_rejected.status_code == 409
    assert "Cannot delete this shift because operational duties or tasks are attached" in r_rejected.text

    # Verify DB-level last-line fallback: directly deleting block cascades StaffShift and SET NULL on duties/tasks
    sb_db = db_session.get(models.ShiftBlock, block["id"])
    db_session.delete(sb_db)
    db_session.commit()

    # Duty and Task must still exist, with shift_id set to NULL
    duty_db = db_session.get(models.DutyAssignment, duty["id"])
    assert duty_db is not None
    assert duty_db.shift_id is None

    task_db = db_session.get(models.Task, task["id"])
    assert task_db is not None
    assert task_db.shift_id is None


# --- T. Deleting StaffMember correctly handles their StaffShift assignments ---
def test_t_deleting_staff_member_cascades_assignments(client, db_session, sample_staff):
    now = datetime.now(timezone.utc)
    block = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "General Block",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=4)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()
    staff_shift_id = block["staff_assignments"][0]["id"]

    # Delete staff member
    r = client.delete(f"/api/staff/{sample_staff.id}")
    assert r.status_code == 204

    # StaffShift assignment record should be cascaded
    assert db_session.get(models.StaffShift, staff_shift_id) is None
    # ShiftBlock should still exist
    assert db_session.get(models.ShiftBlock, block["id"]) is not None


# --- U. Overlapping ShiftBlocks do not corrupt assignments ---
def test_u_overlapping_shift_blocks_allowed(client, sample_staff):
    now = datetime.now(timezone.utc)
    # Block 1: 08:00 - 14:00
    b1 = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Shift Block 1",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=6)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    # Block 2: 12:00 - 18:00 (overlaps by 2 hours)
    b2 = client.post(
        "/api/staff/shift-blocks",
        json={
            "name": "Shift Block 2 (Overlapping Handover)",
            "start_time": (now + timedelta(hours=4)).isoformat(),
            "end_time": (now + timedelta(hours=10)).isoformat(),
            "staff_ids": [sample_staff.id],
        },
    ).json()

    assert b1["id"] != b2["id"]
    r = client.get(f"/api/staff/shifts?staff_id={sample_staff.id}")
    shifts = r.json()
    assert len(shifts) == 2
    assert {s["shift_block_id"] for s in shifts} == {b1["id"], b2["id"]}
