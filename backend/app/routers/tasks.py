"""The shared staff task board: every logged-in account (organizer or staff)
sees the same board, grouped into free-text "list" categories, and can add to
it or toggle status. Distinct from DutyAssignment (staff.py), which is the
room/shift roster rather than a to-do list."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import require_auth

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
def list_tasks(shift_id: int | None = Query(None), db: Session = Depends(get_db)):
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
def update_task(task_id: int, payload: schemas.TaskUpdate, db: Session = Depends(get_db)):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
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
def delete_task(task_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    db.delete(t)
    db.commit()
