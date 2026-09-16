"""Password hashing for individual Organizer Portal accounts."""
import bcrypt
from sqlalchemy import func
from sqlalchemy.orm import Session


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def provision_login_credentials(db: Session, full_name: str, fallback_label: str = "USER") -> tuple[str, str]:
    """Username is their first name in caps (suffixed with a number if that's
    already taken by someone else), password is "2026" + their first name;
    both are handed back once by the caller since the password only exists
    as a bcrypt hash after this. Shared by routers/staff.py and
    routers/volunteers.py's "Create Credential" actions."""
    from . import models  # local import: avoids a models <-> auth_utils import cycle

    first = (full_name or "").strip().split()[0] if (full_name or "").strip() else fallback_label
    base_username = first.upper()
    username = base_username
    suffix = 2
    while db.query(models.OrganizerUser).filter(func.lower(models.OrganizerUser.username) == username.lower()).first():
        username = f"{base_username}{suffix}"
        suffix += 1
    return username, f"2026{first}"
