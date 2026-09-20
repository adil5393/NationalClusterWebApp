"""Shared Operational Categories router.

Global functional tournament areas (e.g. Transport, Accommodation, Medical, Match Control,
Food, Security, Administration) shared across Staff, Contacts, Duties, and Tasks.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/operational-categories", tags=["operational-categories"])


@router.get("", response_model=List[schemas.OperationalCategoryRead])
def list_operational_categories(
    active_only: bool = Query(False, description="Filter only active categories"),
    db: Session = Depends(get_db),
):
    """List operational categories ordered by display_order, then name."""
    query = db.query(models.OperationalCategory)
    if active_only:
        query = query.filter(models.OperationalCategory.is_active == True)

    categories = query.order_by(
        models.OperationalCategory.display_order,
        models.OperationalCategory.name,
    ).all()

    result = []
    for c in categories:
        data = schemas.OperationalCategoryRead(
            id=c.id,
            name=c.name,
            key=c.key,
            description=c.description,
            icon=c.icon,
            display_order=c.display_order,
            is_active=c.is_active,
            staff_count=len(c.staff_members),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        result.append(data)
    return result


@router.post("", response_model=schemas.OperationalCategoryRead, status_code=status.HTTP_201_CREATED)
def create_operational_category(
    payload: schemas.OperationalCategoryCreate,
    db: Session = Depends(get_db),
):
    """Create a new global operational category."""
    name_clean = payload.name.strip()
    key_clean = payload.key.strip().lower()

    if not name_clean:
        raise HTTPException(status_code=422, detail="Category name cannot be empty.")
    if not key_clean:
        raise HTTPException(status_code=422, detail="Category key cannot be empty.")

    existing_name = db.query(models.OperationalCategory).filter(
        models.OperationalCategory.name == name_clean
    ).first()
    if existing_name:
        raise HTTPException(status_code=409, detail=f"Category with name '{name_clean}' already exists.")

    existing_key = db.query(models.OperationalCategory).filter(
        models.OperationalCategory.key == key_clean
    ).first()
    if existing_key:
        raise HTTPException(status_code=409, detail=f"Category with key '{key_clean}' already exists.")

    category = models.OperationalCategory(
        name=name_clean,
        key=key_clean,
        description=payload.description,
        icon=payload.icon,
        display_order=payload.display_order,
        is_active=payload.is_active,
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    return schemas.OperationalCategoryRead(
        id=category.id,
        name=category.name,
        key=category.key,
        description=category.description,
        icon=category.icon,
        display_order=category.display_order,
        is_active=category.is_active,
        staff_count=0,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.get("/{category_id}", response_model=schemas.OperationalCategoryRead)
def get_operational_category(category_id: int, db: Session = Depends(get_db)):
    """Fetch a single operational category by ID."""
    category = db.get(models.OperationalCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Operational category not found.")

    return schemas.OperationalCategoryRead(
        id=category.id,
        name=category.name,
        key=category.key,
        description=category.description,
        icon=category.icon,
        display_order=category.display_order,
        is_active=category.is_active,
        staff_count=len(category.staff_members),
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.put("/{category_id}", response_model=schemas.OperationalCategoryRead)
def update_operational_category(
    category_id: int,
    payload: schemas.OperationalCategoryUpdate,
    db: Session = Depends(get_db),
):
    """Update an operational category."""
    category = db.get(models.OperationalCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Operational category not found.")

    if payload.name is not None:
        name_clean = payload.name.strip()
        if not name_clean:
            raise HTTPException(status_code=422, detail="Category name cannot be empty.")
        if name_clean != category.name:
            dup = db.query(models.OperationalCategory).filter(
                models.OperationalCategory.name == name_clean,
                models.OperationalCategory.id != category_id,
            ).first()
            if dup:
                raise HTTPException(status_code=409, detail=f"Category with name '{name_clean}' already exists.")
            category.name = name_clean

    if payload.key is not None:
        key_clean = payload.key.strip().lower()
        if not key_clean:
            raise HTTPException(status_code=422, detail="Category key cannot be empty.")
        if key_clean != category.key:
            dup = db.query(models.OperationalCategory).filter(
                models.OperationalCategory.key == key_clean,
                models.OperationalCategory.id != category_id,
            ).first()
            if dup:
                raise HTTPException(status_code=409, detail=f"Category with key '{key_clean}' already exists.")
            category.key = key_clean

    if payload.description is not None:
        category.description = payload.description
    if payload.icon is not None:
        category.icon = payload.icon
    if payload.display_order is not None:
        category.display_order = payload.display_order
    if payload.is_active is not None:
        category.is_active = payload.is_active

    db.commit()
    db.refresh(category)

    return schemas.OperationalCategoryRead(
        id=category.id,
        name=category.name,
        key=category.key,
        description=category.description,
        icon=category.icon,
        display_order=category.display_order,
        is_active=category.is_active,
        staff_count=len(category.staff_members),
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operational_category(category_id: int, db: Session = Depends(get_db)):
    """Safely delete an operational category. Blocks deletion if staff members are currently assigned."""
    category = db.get(models.OperationalCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Operational category not found.")

    staff_count = len(category.staff_members)
    if staff_count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete category '{category.name}' because {staff_count} staff member(s) "
                f"are currently assigned to it. Deactivate the category instead or reassign the staff."
            ),
        )

    db.delete(category)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
