"""The organizer-wide task board: every task, grouped into free-text "list"
categories. Organizer/operator accounts see and manage the whole board. A
self-service staff account (an ordinary staff member's own login) is blocked
from every endpoint here — see routers/me.py's /api/me/tasks and
PATCH /api/me/tasks/{id}/complete for their own-assignments-only equivalent.
Distinct from DutyAssignment (staff.py), which is the room/shift roster
rather than a to-do list."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import is_self_service_staff, require_auth

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _dict(t: models.Task):
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "category": t.category,
        "owner": t.owner,
        "assigned_staff_id": t.assigned_staff_id,
        "shift_id": t.shift_id,
        "assigned_staff_name": t.assigned_staff.full_name if t.assigned_staff else None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
def list_tasks(
    shift_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current: models.OrganizerUser = Depends(require_auth),
):
    # This is the organizer-wide task board — every task, regardless of
    # assignee. A self-service staff account (an ordinary staff member's own
    # login) must use /api/me/tasks instead, which is scoped to their own
    # assignments only; letting them hit this endpoint would hand back every
    # other staff member's tasks too.
    if is_self_service_staff(current):
        raise HTTPException(403, "Use the My Work page to view your own tasks")
    q = db.query(models.Task)
    if shift_id:
        q = q.filter(models.Task.shift_id == shift_id)
    rows = q.order_by(models.Task.created_at.desc()).all()
    return [_dict(t) for t in rows]


@router.post("", status_code=201)
def create_task(
    payload: schemas.TaskCreate,
    db: Session = Depends(get_db),
    current: models.OrganizerUser = Depends(require_auth),
):
    # No product requirement currently permits self-service staff to create
    # organizer tasks on the shared board — only an organizer/operator may.
    if is_self_service_staff(current):
        raise HTTPException(403, "Staff accounts can't create tasks")
    if payload.assigned_staff_id and not db.get(models.StaffMember, payload.assigned_staff_id):
        raise HTTPException(404, "Staff member not found")
    if payload.shift_id:
        shift = db.get(models.StaffShift, payload.shift_id)
        if not shift:
            raise HTTPException(404, "Shift not found")
        if shift.staff_id != payload.assigned_staff_id:
            raise HTTPException(400, "Task assigned_staff_id does not match shift staff_id")
    data = payload.model_dump()
    category = (data.get("category") or "General").strip() or "General"
    t = models.Task(**{**data, "category": category}, owner=current.full_name or current.username)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _dict(t)


@router.put("/{task_id}")
def update_task(
    task_id: int,
    payload: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current: models.OrganizerUser = Depends(require_auth),
):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    # A self-service staff account (an ordinary staff member's own login —
    # see routers/me.py) gets no general edit access here at all, even to
    # their own task: this endpoint can reassign/reshift/retitle, none of
    # which self-service should ever do. Their one allowed mutation —
    # marking their own task complete — goes through
    # PATCH /api/me/tasks/{id}/complete instead, which enforces ownership.
    if is_self_service_staff(current):
        raise HTTPException(403, "Use the My Work page to update your own tasks")
    data = payload.model_dump(exclude_unset=True)
    target_staff_id = data.get("assigned_staff_id", t.assigned_staff_id)
    if "assigned_staff_id" in data and target_staff_id and not db.get(models.StaffMember, target_staff_id):
        raise HTTPException(404, "Staff member not found")
    target_shift_id = data.get("shift_id", t.shift_id)
    if target_shift_id is not None:
        shift = db.get(models.StaffShift, target_shift_id)
        if not shift:
            raise HTTPException(404, "Shift not found")
        if shift.staff_id != target_staff_id:
            raise HTTPException(400, "Task assigned_staff_id does not match shift staff_id")
    if "category" in data:
        data["category"] = (data["category"] or "General").strip() or "General"
    for key, value in data.items():
        setattr(t, key, value)
    db.commit()
    db.refresh(t)
    return _dict(t)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current: models.OrganizerUser = Depends(require_auth),
):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    if is_self_service_staff(current):
        raise HTTPException(403, "Staff accounts can't delete tasks")
    db.delete(t)
    db.commit()
