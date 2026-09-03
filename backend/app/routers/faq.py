from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/faqs", tags=["faq"])


@router.get("", response_model=list[schemas.FaqRead])
def list_items(db: Session = Depends(get_db)):
    return db.query(models.Faq).order_by(models.Faq.sequence.asc(), models.Faq.id.asc()).all()


@router.post("", response_model=schemas.FaqRead, status_code=201)
def create_item(payload: schemas.FaqCreate, db: Session = Depends(get_db)):
    item = models.Faq(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=schemas.FaqRead)
def update_item(item_id: int, payload: schemas.FaqUpdate, db: Session = Depends(get_db)):
    item = db.get(models.Faq, item_id)
    if not item:
        raise HTTPException(404, "FAQ not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.Faq, item_id)
    if not item:
        raise HTTPException(404, "FAQ not found")
    db.delete(item)
    db.commit()


# --- Visitor-submitted questions inbox (see public.py submit_faq_question) ---

@router.get("/questions", response_model=list[schemas.FaqQuestionRead])
def list_questions(db: Session = Depends(get_db)):
    return db.query(models.FaqQuestion).order_by(models.FaqQuestion.created_at.desc()).all()


@router.post("/questions/{question_id}/promote", response_model=schemas.FaqRead)
def promote_question(question_id: int, payload: schemas.FaqQuestionPromote, db: Session = Depends(get_db)):
    """Turns a visitor's submitted question into a real, published-or-draft
    FAQ entry — the question text carries over verbatim, the organizer
    supplies the answer."""
    q = db.get(models.FaqQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found")
    if q.status == "promoted":
        raise HTTPException(409, "This question has already been promoted")
    item = models.Faq(
        question=q.question,
        answer=payload.answer,
        category=payload.category,
        sequence=payload.sequence,
        is_published=payload.is_published,
    )
    db.add(item)
    db.flush()
    q.status = "promoted"
    q.promoted_faq_id = item.id
    db.commit()
    db.refresh(item)
    return item


@router.post("/questions/{question_id}/dismiss", response_model=schemas.FaqQuestionRead)
def dismiss_question(question_id: int, db: Session = Depends(get_db)):
    q = db.get(models.FaqQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found")
    q.status = "dismissed"
    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{question_id}", status_code=204)
def delete_question(question_id: int, db: Session = Depends(get_db)):
    q = db.get(models.FaqQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found")
    db.delete(q)
    db.commit()
