"""Staff Live Map — approximate last-known location of authenticated
Organizer Portal / Capacitor app accounts. NOT participant/team tracking.

Two very different access levels live in one router (see main.py's
registration: the whole router gets the loose `require_auth` gate, and the
listing endpoint below stacks an extra `require_admin` on top — same shape
already used for exports.py's mixed-module endpoints):

- POST /me: any authenticated account may report ITS OWN location. user_id
  is never taken from the client, only from the session (see security.py's
  require_auth) — a staff member can never submit a location for anyone else.
- GET  "": admins only — seeing where every staff account is is more
  sensitive than the "staff" module's ordinary view access (which plenty of
  non-admin staff logins already have for the Staff & Duties page), so this
  is intentionally not just another require_module("staff") gate.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import require_admin, require_auth

router = APIRouter(prefix="/api/staff-locations", tags=["staff-locations"])

# Rounding lat/lng to 3 decimal places is ~110m of fuzz at the equator —
# enough to place a marker in roughly the right spot (which building, which
# gate) without exposing anyone's exact position. Stored values stay full
# precision; only the API response is rounded, so this can be tightened or
# loosened later without touching what's on disk.
_APPROX_DECIMALS = 3


def _latest_duty(staff: "models.StaffMember | None"):
    if not staff or not staff.duties:
        return None
    duty = max(staff.duties, key=lambda d: d.id)
    return {
        "duty_type": duty.duty_type,
        "room_name": duty.room.name if duty.room else None,
        "start_time": duty.start_time.isoformat() if duty.start_time else None,
        "end_time": duty.end_time.isoformat() if duty.end_time else None,
    }


@router.post("/me")
def update_my_location(
    payload: schemas.StaffLocationUpdate,
    current: models.OrganizerUser = Depends(require_auth),
    db: Session = Depends(get_db),
):
    loc = db.get(models.StaffLocation, current.id)
    if loc:
        loc.latitude = payload.latitude
        loc.longitude = payload.longitude
        loc.accuracy = payload.accuracy
    else:
        loc = models.StaffLocation(
            user_id=current.id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            accuracy=payload.accuracy,
        )
        db.add(loc)
    db.commit()
    db.refresh(loc)
    return {"updated_at": loc.updated_at.isoformat()}


@router.get("", dependencies=[Depends(require_admin)])
def list_staff_locations(db: Session = Depends(get_db)):
    """Every active account linked to a staff member, whether or not it has
    ever reported a location — an account with none still needs to show up
    as "Location unavailable" rather than silently vanish from the map's
    staff list (see StaffLiveMap.tsx)."""
    users = (
        db.query(models.OrganizerUser)
        .filter(models.OrganizerUser.is_active.is_(True))
        .join(models.OrganizerUser.staff_members)
        .options(
            joinedload(models.OrganizerUser.staff_members).joinedload(models.StaffMember.duties),
            joinedload(models.OrganizerUser.location),
        )
        .order_by(models.OrganizerUser.full_name, models.OrganizerUser.username)
        .all()
    )

    rows = []
    for user in users:
        staff = user.staff_members[0] if user.staff_members else None
        loc = user.location
        rows.append(
            {
                "user_id": user.id,
                "staff_id": staff.id if staff else None,
                "staff_name": (staff.full_name if staff else None) or user.full_name or user.username,
                "category": staff.category if staff else None,
                "duty": _latest_duty(staff),
                "latitude": round(loc.latitude, _APPROX_DECIMALS) if loc else None,
                "longitude": round(loc.longitude, _APPROX_DECIMALS) if loc else None,
                "accuracy": loc.accuracy if loc else None,
                "updated_at": loc.updated_at.isoformat() if loc else None,
            }
        )
    return rows
