"""Per-account, per-module session guard for the Organizer Portal admin API.

Each OrganizerUser either is_admin (full access to every module and Accounts) or
carries a `permissions` map of {module_key: "view" | "edit"} — a module missing
from that map means no access at all. GET/HEAD requests only need "view"; every
other method needs "edit". Looking the user up on every request (rather than
trusting the cookie alone) means deactivating someone, or narrowing their
permissions, takes effect immediately, not just on their next login.
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from . import models
from .database import get_db

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_auth(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    user = db.get(models.OrganizerUser, user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Not authenticated")
    return user


def require_admin(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
    user = require_auth(request, db)
    if not user.is_admin:
        raise HTTPException(403, "Admin access required")
    return user


def require_module(module_key: str):
    def _dep(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
        user = require_auth(request, db)
        if user.is_admin:
            return user
        level = (user.permissions or {}).get(module_key)
        needs_edit = request.method not in SAFE_METHODS
        if level is None or (needs_edit and level != "edit"):
            verb = "edit" if needs_edit else "view"
            raise HTTPException(403, f"You don't have {verb} access to this section")
        return user
    return _dep


def is_self_service_staff(user: "models.OrganizerUser") -> bool:
    """True for an ordinary staff member's own login — as opposed to an
    admin, or a non-admin account an admin has deliberately given real
    "staff":"edit" access to run Staff Operations on others' behalf.

    Auto-provisioned staff logins (routers/staff.py create_staff_credential)
    are granted schemas.STAFF_BASE_PERMISSIONS, which includes "staff":"view"
    so they can see day-to-day operational modules — but that "view" grant
    was never meant to expose the organizer-wide Staff Directory / Duty
    Overview / Shift Blocks / global Tasks board, only this account's own
    data (see routers/me.py). Keying off the OrganizerUser<->StaffMember
    link (not the stored permission level, which an old/legacy account might
    still carry) means this stays correct even if STAFF_BASE_PERMISSIONS
    changes later or a row predates this check.
    """
    if user.is_admin:
        return False
    if (user.permissions or {}).get("staff") == "edit":
        return False
    return bool(user.staff_members)


def resolve_self_staff(user: "models.OrganizerUser") -> "models.StaffMember | None":
    """The one StaffMember this session's self-service data belongs to.

    Identity always comes from the authenticated account's existing
    OrganizerUser<->StaffMember link — never from a client-supplied staff
    id. Returns None when nothing is linked (e.g. a pure admin account).

    That link is modeled many-to-many (see models.organizer_user_staff /
    OrganizerUserRead's staff_members list, and the Accounts page's
    MultiStaffSelector, which lets an admin deliberately link more than one
    StaffMember to a single shared login). When more than one is linked
    there is no deterministic "this one is me" rule, so this raises rather
    than silently picking staff_members[0] the way the display-only
    /auth/me payload and Staff Live Map already do — those are read-only
    name tags, not an authorization boundary for private per-staff data.
    """
    if not user.staff_members:
        return None
    if len(user.staff_members) > 1:
        raise HTTPException(
            409,
            "This account is linked to multiple staff profiles, so self-service data is ambiguous. Ask an admin to link a single staff profile to this login.",
        )
    return user.staff_members[0]


def is_self_service_volunteer(user: "models.OrganizerUser") -> bool:
    """True for a volunteer's own login — mirrors is_self_service_staff.
    Auto-provisioned volunteer logins (routers/volunteers.py
    create_volunteer_credential) get schemas.VOLUNTEER_BASE_PERMISSIONS
    (empty), so unlike is_self_service_staff there's no module-permission
    escape hatch to check — being linked to a Volunteer at all (and not
    being an admin) is enough."""
    if user.is_admin:
        return False
    return bool(user.volunteers)


def resolve_self_volunteer(user: "models.OrganizerUser") -> "models.Volunteer | None":
    """The one Volunteer this session's self-service data belongs to —
    mirrors resolve_self_staff. Identity always comes from the authenticated
    account's existing OrganizerUser<->Volunteer link, never a client-
    supplied volunteer id."""
    if not user.volunteers:
        return None
    if len(user.volunteers) > 1:
        raise HTTPException(
            409,
            "This account is linked to multiple volunteer profiles, so self-service data is ambiguous. Ask an admin to link a single volunteer profile to this login.",
        )
    return user.volunteers[0]


def require_staff_operator(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
    """Gate for the organizer-wide Staff Operations surface (staff.py,
    event_locations.py) — like require_module("staff"), but a self-service
    staff account never gets in here even though it carries "staff":"view"
    for other purposes (see is_self_service_staff). Real Staff Ops
    coordinators still get in via is_admin or an explicit "staff":"edit"
    grant, exactly as require_module("staff") already worked for them."""
    user = require_module("staff")(request, db)
    if is_self_service_staff(user):
        raise HTTPException(403, "Use your My Work page for your own shifts, duties and tasks")
    return user


# Router-level gate for routers/matches.py only (registered in main.py in place
# of require_module("matches") — pools/buckets/reports/mats keep the plain
# module gate). An account assigned to a match (models.Match.assigned_users)
# gets access independent of the "matches" module permission entirely: they
# can view every match (even with zero module access), and get full control
# of specifically their own assigned match(es) for the plain lifecycle
# actions below — never delete, reset, the general PUT edit, or mat
# (re)assignment, which always still need real module edit access or admin.
_ASSIGNABLE_MATCH_ACTIONS = {"start", "score", "pause", "resume", "complete", "cancel", "forfeit", "postpone"}


def require_match_access(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
    user = require_auth(request, db)
    if user.is_admin:
        return user

    level = (user.permissions or {}).get("matches")
    if request.method in SAFE_METHODS:
        if level in ("view", "edit") or user.assigned_matches:
            return user
        raise HTTPException(403, "You don't have view access to this section")

    if level == "edit":
        return user

    # No module edit access — only a per-match assignment can still unlock
    # this, and only for a whitelisted action (fails closed: any new
    # mutating endpoint added later defaults to requiring full edit access).
    action = request.url.path.rstrip("/").rsplit("/", 1)[-1]
    if action not in _ASSIGNABLE_MATCH_ACTIONS:
        raise HTTPException(403, "This action requires full Matches & Fixtures edit access")

    match_id_raw = request.path_params.get("match_id")
    match = db.get(models.Match, int(match_id_raw)) if match_id_raw is not None else None
    if match and any(u.id == user.id for u in match.assigned_users):
        return user
    raise HTTPException(403, "You're not assigned to this match")
