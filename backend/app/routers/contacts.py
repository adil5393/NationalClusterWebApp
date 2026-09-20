"""Contacts & Helplines directory router.

Connects Contact Groups to the Staff module, Operational Categories, and Operational Areas.
Personnel details (name, phone, email, languages, shift assignments) are dynamically
resolved from Staff without duplicating records.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _normalize_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def resolve_group_contacts(
    group: models.ContactGroup,
    db: Session,
    now: Optional[datetime] = None,
) -> tuple[
    Optional[schemas.ContactPersonDTO],
    Optional[schemas.ContactPersonDTO],
    Optional[schemas.ContactPersonDTO],
    List[schemas.ResolvedContactPerson],
]:
    """Resolves contacts for a ContactGroup according to the simplified architecture:
    1. Primary Contact (Staff OR External)
    2. Secondary / Backup Contact (Staff OR External OR None)
    3. Optional Current Shift Incharge (if enabled and on duty)

    Precedence:
      Current Incharge (if enabled + available)
      ↓
      Primary Contact
      ↓
      Backup Contact

    Deduplication:
      If on-duty incharge is already Primary or Backup, set is_on_duty = True
      on that contact rather than creating a duplicate entry.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # 1. PRIMARY CONTACT
    primary_contact: Optional[schemas.ContactPersonDTO] = None
    primary_staff_id = group.primary_staff_id or (group.lead_staff_id if not group.primary_name else None)
    if group.primary_type == "external" or (group.primary_name and not group.primary_staff_id):
        primary_contact = schemas.ContactPersonDTO(
            id=None,
            name=group.primary_name or "Primary Contact",
            phone=group.primary_phone or "",
            email=group.primary_email,
            role=group.primary_role or "Primary Contact",
            languages=[],
            is_staff=False,
            is_on_duty=False,
            is_external=True,
        )
    elif primary_staff_id:
        st = db.get(models.StaffMember, primary_staff_id)
        if st:
            role = group.primary_role or st.designation or (st.categories[0].name if st.categories else "Primary Contact")
            primary_contact = schemas.ContactPersonDTO(
                id=st.id,
                name=st.full_name,
                phone=st.phone or "",
                email=st.email,
                role=role,
                languages=st.languages or [],
                is_staff=True,
                is_on_duty=False,
                is_external=False,
            )

    # 2. SECONDARY / BACKUP CONTACT
    secondary_contact: Optional[schemas.ContactPersonDTO] = None
    if group.secondary_type == "external" or (group.secondary_name and not group.secondary_staff_id):
        secondary_contact = schemas.ContactPersonDTO(
            id=None,
            name=group.secondary_name or "Backup Contact",
            phone=group.secondary_phone or "",
            email=group.secondary_email,
            role=group.secondary_role or "Backup Contact",
            languages=[],
            is_staff=False,
            is_on_duty=False,
            is_external=True,
        )
    elif group.secondary_staff_id:
        st = db.get(models.StaffMember, group.secondary_staff_id)
        if st:
            role = group.secondary_role or st.designation or (st.categories[0].name if st.categories else "Backup Contact")
            secondary_contact = schemas.ContactPersonDTO(
                id=st.id,
                name=st.full_name,
                phone=st.phone or "",
                email=st.email,
                role=role,
                languages=st.languages or [],
                is_staff=True,
                is_on_duty=False,
                is_external=False,
            )

    # 3. CURRENT SHIFT INCHARGE (Optional convenience feature)
    current_incharge: Optional[schemas.ContactPersonDTO] = None
    use_incharge = bool(group.use_shift_incharge if group.use_shift_incharge is not None else group.show_shift_incharges)

    active_block_ids: list[int] = []
    active_staff_shift_map: dict[int, str] = {}

    # Check active shift blocks if needed
    active_blocks = (
        db.query(models.ShiftBlock)
        .filter(
            models.ShiftBlock.status.notin_(["CANCELLED", "COMPLETED"]),
            models.ShiftBlock.start_time <= now,
            models.ShiftBlock.end_time >= now,
        )
        .order_by(models.ShiftBlock.start_time.desc())
        .all()
    )
    if active_blocks:
        active_block_ids = [b.id for b in active_blocks]
        shifts = (
            db.query(models.StaffShift)
            .options(joinedload(models.StaffShift.shift_block))
            .filter(models.StaffShift.shift_block_id.in_(active_block_ids))
            .all()
        )
        for s in shifts:
            active_staff_shift_map[s.staff_id] = s.shift_block.name if s.shift_block else "On Shift"

    if use_incharge and active_block_ids and (group.operational_category_id or group.operational_area_id):
        incharge_rows = (
            db.query(models.ShiftOperationalIncharge)
            .options(
                joinedload(models.ShiftOperationalIncharge.staff).joinedload(models.StaffMember.categories),
                joinedload(models.ShiftOperationalIncharge.operational_area),
            )
            .filter(models.ShiftOperationalIncharge.shift_block_id.in_(active_block_ids))
            .all()
        )
        for r in incharge_rows:
            st = r.staff
            if not st:
                continue

            matches = False
            if group.operational_area_id and r.operational_area_id == group.operational_area_id:
                matches = True
            elif group.operational_category_id:
                if any(c.id == group.operational_category_id for c in (st.categories or [])):
                    matches = True
                elif r.operational_area and group.operational_category:
                    if (r.operational_area.code or "").lower() == (group.operational_category.key or "").lower():
                        matches = True

            if matches:
                # Deduplication check
                if primary_contact and primary_contact.id == st.id:
                    primary_contact.is_on_duty = True
                elif secondary_contact and secondary_contact.id == st.id:
                    secondary_contact.is_on_duty = True
                else:
                    role = st.designation or (f"{group.operational_category.name} Incharge" if group.operational_category else "On Duty Incharge")
                    current_incharge = schemas.ContactPersonDTO(
                        id=st.id,
                        name=st.full_name,
                        phone=st.phone or "",
                        email=st.email,
                        role=role,
                        languages=st.languages or [],
                        is_staff=True,
                        is_on_duty=True,
                        is_external=False,
                    )
                break

    # Build backward-compatible contacts list
    legacy_contacts: List[schemas.ResolvedContactPerson] = []
    seen_ids: set[int] = set()

    if current_incharge:
        seen_ids.add(current_incharge.id)
        legacy_contacts.append(
            schemas.ResolvedContactPerson(
                id=current_incharge.id,
                name=current_incharge.name,
                role_label=f"{current_incharge.role} (On Duty)" if current_incharge.role else "On Duty",
                phone=current_incharge.phone,
                email=current_incharge.email,
                languages=current_incharge.languages,
                is_incharge=True,
                incharge_type="ACTIVE_SHIFT_INCHARGE",
                is_on_shift=True,
                current_shift_name=active_staff_shift_map.get(current_incharge.id, "Active Shift"),
                is_external=False,
                priority=1,
                display_order=1,
                is_pinned=True,
            )
        )

    if primary_contact:
        if primary_contact.id:
            seen_ids.add(primary_contact.id)
        is_inc = True if (primary_contact.is_on_duty or primary_contact.is_staff) else False
        inc_type = "ACTIVE_SHIFT_INCHARGE" if primary_contact.is_on_duty else ("DESIGNATED_LEAD" if primary_contact.is_staff else "EXTERNAL")
        prio = 1 if primary_contact.is_on_duty else (2 if primary_contact.is_staff else 4)
        legacy_contacts.append(
            schemas.ResolvedContactPerson(
                id=primary_contact.id,
                name=primary_contact.name,
                role_label=primary_contact.role or "Primary Contact",
                phone=primary_contact.phone,
                email=primary_contact.email,
                languages=primary_contact.languages,
                is_incharge=is_inc,
                incharge_type=inc_type,
                is_on_shift=primary_contact.is_on_duty or (primary_contact.id in active_staff_shift_map if primary_contact.id else False),
                current_shift_name=active_staff_shift_map.get(primary_contact.id) if primary_contact.id else None,
                is_external=primary_contact.is_external,
                priority=prio,
                display_order=2,
                is_pinned=True,
            )
        )

    if secondary_contact:
        if secondary_contact.id:
            seen_ids.add(secondary_contact.id)
        legacy_contacts.append(
            schemas.ResolvedContactPerson(
                id=secondary_contact.id,
                name=secondary_contact.name,
                role_label=secondary_contact.role or "Backup Contact",
                phone=secondary_contact.phone,
                email=secondary_contact.email,
                languages=secondary_contact.languages,
                is_incharge=True if secondary_contact.is_on_duty else False,
                incharge_type="ACTIVE_SHIFT_INCHARGE" if secondary_contact.is_on_duty else "ADDITIONAL_STAFF",
                is_on_shift=secondary_contact.is_on_duty or (secondary_contact.id in active_staff_shift_map if secondary_contact.id else False),
                current_shift_name=active_staff_shift_map.get(secondary_contact.id) if secondary_contact.id else None,
                is_external=secondary_contact.is_external,
                priority=1 if secondary_contact.is_on_duty else 3,
                display_order=3,
                is_pinned=False,
            )
        )

    # If this group had explicit curated staff associations not yet covered, append them
    for assoc in sorted(group.staff_associations or [], key=lambda a: (not a.is_pinned, a.display_order, a.id)):
        st = assoc.staff
        if not st or st.id in seen_ids:
            continue
        seen_ids.add(st.id)
        on_shift = st.id in active_staff_shift_map
        legacy_contacts.append(
            schemas.ResolvedContactPerson(
                id=st.id,
                name=st.full_name,
                role_label=assoc.custom_role_override or st.designation or "Additional Contact",
                phone=st.phone or "",
                email=st.email,
                languages=st.languages or [],
                is_incharge=False,
                incharge_type="ADDITIONAL_STAFF",
                is_on_shift=on_shift,
                current_shift_name=active_staff_shift_map.get(st.id),
                is_external=False,
                priority=3,
                display_order=assoc.display_order,
                is_pinned=assoc.is_pinned,
            )
        )

    # If this group had external contacts not yet covered, append them
    for ext in sorted([e for e in (group.external_contacts or []) if e.is_active], key=lambda e: (e.display_order, e.id)):
        # Avoid duplicate if matches primary or secondary external
        if primary_contact and primary_contact.is_external and primary_contact.name == ext.name and primary_contact.phone == ext.phone:
            continue
        if secondary_contact and secondary_contact.is_external and secondary_contact.name == ext.name and secondary_contact.phone == ext.phone:
            continue
        legacy_contacts.append(
            schemas.ResolvedContactPerson(
                id=None,
                name=ext.name,
                role_label=ext.role_label or "Emergency Contact",
                phone=ext.phone,
                email=ext.email,
                languages=[],
                is_incharge=False,
                incharge_type="EXTERNAL",
                is_on_shift=False,
                current_shift_name=None,
                is_external=True,
                priority=4,
                display_order=ext.display_order,
                is_pinned=False,
            )
        )

    return current_incharge, primary_contact, secondary_contact, legacy_contacts


def resolve_category_staff(
    group: models.ContactGroup,
    db: Session,
    active_staff_shift_map: Optional[dict[int, str]] = None,
) -> List[schemas.ResolvedContactPerson]:
    """Returns all staff members belonging to the group's OperationalCategory.

    For INTERNAL organizer/admin reference ONLY. These members are NOT exposed publicly!
    """
    if not group.operational_category_id:
        return []
    cat = db.get(models.OperationalCategory, group.operational_category_id)
    if not cat or not cat.staff_members:
        return []

    if active_staff_shift_map is None:
        active_staff_shift_map = {}

    cat_staff: List[schemas.ResolvedContactPerson] = []
    for st in sorted(cat.staff_members, key=lambda s: s.full_name.lower()):
        on_shift = st.id in active_staff_shift_map
        cat_staff.append(
            schemas.ResolvedContactPerson(
                id=st.id,
                name=st.full_name,
                role_label=st.designation or cat.name,
                phone=st.phone or "",
                email=st.email,
                languages=st.languages or [],
                is_incharge=False,
                incharge_type="CATEGORY_MEMBER",
                is_on_shift=on_shift,
                current_shift_name=active_staff_shift_map.get(st.id),
                is_external=False,
                priority=5,
                display_order=100,
                is_pinned=False,
            )
        )
    return cat_staff


def _serialize_group(
    group: models.ContactGroup,
    db: Session,
    now: Optional[datetime] = None,
    include_category_staff: bool = True,
) -> schemas.ContactGroupRead:
    if now is None:
        now = datetime.now(timezone.utc)

    current_incharge, primary_contact, secondary_contact, contacts = resolve_group_contacts(group, db, now=now)

    category_staff: List[schemas.ResolvedContactPerson] = []
    if include_category_staff and group.operational_category_id:
        active_blocks = (
            db.query(models.ShiftBlock)
            .filter(
                models.ShiftBlock.status.notin_(["CANCELLED", "COMPLETED"]),
                models.ShiftBlock.start_time <= now,
                models.ShiftBlock.end_time >= now,
            )
            .order_by(models.ShiftBlock.start_time.desc())
            .all()
        )
        active_staff_shift_map = {}
        if active_blocks:
            shifts = (
                db.query(models.StaffShift)
                .options(joinedload(models.StaffShift.shift_block))
                .filter(models.StaffShift.shift_block_id.in_([b.id for b in active_blocks]))
                .all()
            )
            for s in shifts:
                active_staff_shift_map[s.staff_id] = s.shift_block.name if s.shift_block else "On Shift"

        category_staff = resolve_category_staff(group, db, active_staff_shift_map=active_staff_shift_map)

    # Determine resolved category name
    resolved_cat_name = group.category_name
    if not resolved_cat_name and group.operational_category:
        resolved_cat_name = group.operational_category.name

    return schemas.ContactGroupRead(
        id=group.id,
        title=group.title,
        description=group.description,
        category_name=resolved_cat_name,
        icon=group.icon or "Phone",
        display_order=group.display_order,
        is_active=group.is_active,
        is_public=group.is_public,
        # Primary Contact
        primary_type=group.primary_type or ("staff" if group.primary_staff_id or group.lead_staff_id else "external" if group.primary_name else "staff"),
        primary_staff_id=group.primary_staff_id or group.lead_staff_id,
        primary_name=group.primary_name,
        primary_phone=group.primary_phone,
        primary_email=group.primary_email,
        primary_role=group.primary_role,
        # Secondary Contact
        secondary_type=group.secondary_type or ("staff" if group.secondary_staff_id else "external" if group.secondary_name else "none"),
        secondary_staff_id=group.secondary_staff_id,
        secondary_name=group.secondary_name,
        secondary_phone=group.secondary_phone,
        secondary_email=group.secondary_email,
        secondary_role=group.secondary_role,
        # Shift incharge dynamic routing
        use_shift_incharge=bool(group.use_shift_incharge if group.use_shift_incharge is not None else group.show_shift_incharges),
        operational_category_id=group.operational_category_id,
        operational_category_name=group.operational_category.name if group.operational_category else None,
        operational_area_id=group.operational_area_id,
        operational_area_name=group.operational_area.name if group.operational_area else None,
        # Backward compatibility
        lead_staff_id=group.lead_staff_id or group.primary_staff_id,
        lead_staff_name=group.lead_staff.full_name if group.lead_staff else (group.primary_staff.full_name if group.primary_staff else None),
        show_shift_incharges=group.show_shift_incharges,
        # Resolved objects
        current_incharge=current_incharge,
        primary_contact=primary_contact,
        secondary_contact=secondary_contact,
        contacts=contacts,
        category_staff=category_staff,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


# -----------------------------------------------------------------------------
# 1. DIRECTORY / LIST ENDPOINTS
# -----------------------------------------------------------------------------
@router.get("", response_model=List[schemas.ContactGroupRead])
def get_contacts_directory(
    active_only: bool = Query(True, description="Filter for active contact groups"),
    public_only: bool = Query(False, description="Filter for public groups only"),
    category_id: Optional[int] = Query(None, description="Filter by operational category ID"),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.ContactGroup)
        .options(
            joinedload(models.ContactGroup.operational_category),
            joinedload(models.ContactGroup.operational_area),
            joinedload(models.ContactGroup.primary_staff),
            joinedload(models.ContactGroup.secondary_staff),
            joinedload(models.ContactGroup.lead_staff),
            joinedload(models.ContactGroup.staff_associations).joinedload(models.ContactGroupStaff.staff),
            joinedload(models.ContactGroup.external_contacts),
        )
        .order_by(models.ContactGroup.display_order, models.ContactGroup.id)
    )
    if active_only:
        query = query.filter(models.ContactGroup.is_active == True)
    if public_only:
        query = query.filter(models.ContactGroup.is_public == True)
    if category_id:
        query = query.filter(models.ContactGroup.operational_category_id == category_id)

    groups = query.all()
    return [_serialize_group(g, db) for g in groups]


@router.get("/groups", response_model=List[schemas.ContactGroupRead])
def list_contact_groups(db: Session = Depends(get_db)):
    return get_contacts_directory(active_only=False, public_only=False, db=db)


# -----------------------------------------------------------------------------
# 2. CONTACT CRUD ENDPOINTS
# -----------------------------------------------------------------------------
def _apply_contact_group_payload(
    group: models.ContactGroup,
    payload: schemas.ContactGroupCreate | schemas.ContactGroupUpdate,
    db: Session,
    is_create: bool = False,
):
    if payload.title is not None:
        group.title = payload.title.strip()
    if payload.description is not None:
        group.description = payload.description.strip() if payload.description else None
    if payload.category_name is not None:
        group.category_name = payload.category_name.strip() if payload.category_name else None
    if payload.icon is not None:
        group.icon = payload.icon.strip() if payload.icon else "Phone"
    if payload.display_order is not None:
        group.display_order = payload.display_order
    if payload.is_active is not None:
        group.is_active = payload.is_active
    if payload.is_public is not None:
        group.is_public = payload.is_public

    # Primary Contact
    if payload.primary_type is not None:
        group.primary_type = payload.primary_type
    if payload.primary_staff_id is not None:
        if payload.primary_staff_id > 0:
            staff = db.get(models.StaffMember, payload.primary_staff_id)
            if not staff:
                raise HTTPException(404, "Primary staff member not found")
            group.primary_staff_id = staff.id
            group.lead_staff_id = staff.id
        else:
            group.primary_staff_id = None
            if group.lead_staff_id:
                group.lead_staff_id = None

    if payload.primary_name is not None:
        group.primary_name = payload.primary_name.strip() if payload.primary_name else None
    if payload.primary_phone is not None:
        group.primary_phone = payload.primary_phone.strip() if payload.primary_phone else None
    if payload.primary_email is not None:
        group.primary_email = payload.primary_email.strip() if payload.primary_email else None
    if payload.primary_role is not None:
        group.primary_role = payload.primary_role.strip() if payload.primary_role else None

    # Secondary Contact
    if payload.secondary_type is not None:
        group.secondary_type = payload.secondary_type
    if payload.secondary_staff_id is not None:
        if payload.secondary_staff_id > 0:
            staff = db.get(models.StaffMember, payload.secondary_staff_id)
            if not staff:
                raise HTTPException(404, "Secondary staff member not found")
            group.secondary_staff_id = staff.id
        else:
            group.secondary_staff_id = None

    if payload.secondary_name is not None:
        group.secondary_name = payload.secondary_name.strip() if payload.secondary_name else None
    if payload.secondary_phone is not None:
        group.secondary_phone = payload.secondary_phone.strip() if payload.secondary_phone else None
    if payload.secondary_email is not None:
        group.secondary_email = payload.secondary_email.strip() if payload.secondary_email else None
    if payload.secondary_role is not None:
        group.secondary_role = payload.secondary_role.strip() if payload.secondary_role else None

    # Dynamic Shift Incharge
    if payload.use_shift_incharge is not None:
        group.use_shift_incharge = payload.use_shift_incharge
        group.show_shift_incharges = payload.use_shift_incharge
    elif payload.show_shift_incharges is not None:
        group.use_shift_incharge = payload.show_shift_incharges
        group.show_shift_incharges = payload.show_shift_incharges

    if payload.operational_category_id is not None:
        if payload.operational_category_id > 0:
            cat = db.get(models.OperationalCategory, payload.operational_category_id)
            if not cat:
                raise HTTPException(404, "Operational category not found")
            group.operational_category_id = cat.id
            if not group.category_name:
                group.category_name = cat.name
        else:
            group.operational_category_id = None

    if payload.operational_area_id is not None:
        if payload.operational_area_id > 0:
            area = db.get(models.OperationalArea, payload.operational_area_id)
            if not area:
                raise HTTPException(404, "Operational area not found")
            group.operational_area_id = area.id
        else:
            group.operational_area_id = None

    # Backward compatibility lead_staff_id
    if payload.lead_staff_id is not None:
        if payload.lead_staff_id > 0:
            staff = db.get(models.StaffMember, payload.lead_staff_id)
            if not staff:
                raise HTTPException(404, "Lead staff member not found")
            group.lead_staff_id = staff.id
            if not group.primary_staff_id:
                group.primary_staff_id = staff.id
                group.primary_type = "staff"
        else:
            group.lead_staff_id = None


@router.post("", response_model=schemas.ContactGroupRead, status_code=201)
@router.post("/groups", response_model=schemas.ContactGroupRead, status_code=201)
def create_contact(payload: schemas.ContactGroupCreate, db: Session = Depends(get_db)):
    group = models.ContactGroup(
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        category_name=payload.category_name.strip() if payload.category_name else None,
        icon=payload.icon.strip() if payload.icon else "Phone",
        display_order=payload.display_order,
        is_active=payload.is_active,
        is_public=payload.is_public,
        primary_type=payload.primary_type or "staff",
        secondary_type=payload.secondary_type or "none",
    )
    _apply_contact_group_payload(group, payload, db, is_create=True)
    db.add(group)
    db.commit()
    db.refresh(group)
    return _serialize_group(group, db)


@router.get("/{group_id}", response_model=schemas.ContactGroupRead)
@router.get("/groups/{group_id}", response_model=schemas.ContactGroupRead)
def get_contact(group_id: int, db: Session = Depends(get_db)):
    group = db.get(models.ContactGroup, group_id)
    if not group:
        raise HTTPException(404, "Contact not found")
    return _serialize_group(group, db)


@router.put("/{group_id}", response_model=schemas.ContactGroupRead)
@router.put("/groups/{group_id}", response_model=schemas.ContactGroupRead)
def update_contact(
    group_id: int,
    payload: schemas.ContactGroupUpdate,
    db: Session = Depends(get_db),
):
    group = db.get(models.ContactGroup, group_id)
    if not group:
        raise HTTPException(404, "Contact not found")
    _apply_contact_group_payload(group, payload, db, is_create=False)
    db.commit()
    db.refresh(group)
    return _serialize_group(group, db)


@router.delete("/{group_id}", status_code=204)
@router.delete("/groups/{group_id}", status_code=204)
def delete_contact(group_id: int, db: Session = Depends(get_db)):
    group = db.get(models.ContactGroup, group_id)
    if not group:
        raise HTTPException(404, "Contact not found")
    db.delete(group)
    db.commit()


# -----------------------------------------------------------------------------
# 3. LEGACY GROUP STAFF ASSIGNMENTS (Curated additions / overrides)
# -----------------------------------------------------------------------------
@router.post("/groups/{group_id}/staff", response_model=schemas.ContactGroupRead)
def add_staff_to_group(
    group_id: int,
    payload: schemas.ContactGroupStaffAdd,
    db: Session = Depends(get_db),
):
    group = db.get(models.ContactGroup, group_id)
    if not group:
        raise HTTPException(404, "Contact group not found")

    staff = db.get(models.StaffMember, payload.staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found")

    existing = (
        db.query(models.ContactGroupStaff)
        .filter(
            models.ContactGroupStaff.contact_group_id == group_id,
            models.ContactGroupStaff.staff_id == payload.staff_id,
        )
        .first()
    )
    role_override = payload.custom_role_override or payload.role_override
    if existing:
        if role_override is not None:
            existing.custom_role_override = role_override.strip() if role_override else None
        existing.display_order = payload.display_order
        existing.is_pinned = payload.is_pinned
    else:
        assoc = models.ContactGroupStaff(
            contact_group_id=group_id,
            staff_id=payload.staff_id,
            custom_role_override=role_override.strip() if role_override else None,
            display_order=payload.display_order,
            is_pinned=payload.is_pinned,
        )
        db.add(assoc)

    db.commit()
    db.refresh(group)
    return _serialize_group(group, db)


@router.delete("/groups/{group_id}/staff/{staff_id}", status_code=204)
def remove_staff_from_group(group_id: int, staff_id: int, db: Session = Depends(get_db)):
    assoc = (
        db.query(models.ContactGroupStaff)
        .filter(
            models.ContactGroupStaff.contact_group_id == group_id,
            models.ContactGroupStaff.staff_id == staff_id,
        )
        .first()
    )
    if not assoc:
        raise HTTPException(404, "Staff assignment not found in this group")
    db.delete(assoc)
    db.commit()


# -----------------------------------------------------------------------------
# 4. LEGACY EXTERNAL CONTACTS (Police, Hospital, Ambulance)
# -----------------------------------------------------------------------------
@router.post("/groups/{group_id}/external", response_model=schemas.ExternalContactRead, status_code=201)
def add_external_contact(
    group_id: int,
    payload: schemas.ExternalContactCreate,
    db: Session = Depends(get_db),
):
    group = db.get(models.ContactGroup, group_id)
    if not group:
        raise HTTPException(404, "Contact group not found")

    ext = models.ExternalContact(
        contact_group_id=group_id,
        name=payload.name.strip(),
        role_label=payload.role_label.strip() if payload.role_label else "Emergency Contact",
        phone=payload.phone.strip(),
        email=payload.email.strip() if payload.email else None,
        notes=payload.notes.strip() if payload.notes else None,
        display_order=payload.display_order,
        is_active=payload.is_active,
    )
    db.add(ext)
    db.commit()
    db.refresh(ext)
    return ext


@router.put("/external/{external_id}", response_model=schemas.ExternalContactRead)
def update_external_contact(
    external_id: int,
    payload: schemas.ExternalContactUpdate,
    db: Session = Depends(get_db),
):
    ext = db.get(models.ExternalContact, external_id)
    if not ext:
        raise HTTPException(404, "External contact not found")

    if payload.name is not None:
        ext.name = payload.name.strip()
    if payload.role_label is not None:
        ext.role_label = payload.role_label.strip()
    if payload.phone is not None:
        ext.phone = payload.phone.strip()
    if payload.email is not None:
        ext.email = payload.email.strip() if payload.email else None
    if payload.notes is not None:
        ext.notes = payload.notes.strip() if payload.notes else None
    if payload.display_order is not None:
        ext.display_order = payload.display_order
    if payload.is_active is not None:
        ext.is_active = payload.is_active

    db.commit()
    db.refresh(ext)
    return ext


@router.delete("/external/{external_id}", status_code=204)
def delete_external_contact(external_id: int, db: Session = Depends(get_db)):
    ext = db.get(models.ExternalContact, external_id)
    if not ext:
        raise HTTPException(404, "External contact not found")
    db.delete(ext)
    db.commit()
