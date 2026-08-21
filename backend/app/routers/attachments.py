"""Knowledge attachments: comments + documents (uploaded files or external links)."""
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api", tags=["attachments"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def _doc_dict(d: models.Document):
    return {
        "id": d.id,
        "title": d.title,
        "description": d.description,
        "category": d.category,
        "file_name": d.file_name,
        "is_upload": bool(d.is_upload),
        "external_url": None if d.is_upload else d.file_url,
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "knowledge_item_id": d.knowledge_item_id,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


# ---------- Comments ----------
@router.get("/knowledge/{item_id}/comments")
def list_comments(item_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.Comment)
        .filter_by(knowledge_item_id=item_id)
        .order_by(models.Comment.created_at.asc())
        .all()
    )
    return [
        {"id": c.id, "author": c.author, "body": c.body, "created_at": c.created_at.isoformat() if c.created_at else None}
        for c in rows
    ]


@router.post("/knowledge/{item_id}/comments", status_code=201)
def add_comment(item_id: int, payload: schemas.CommentCreate, db: Session = Depends(get_db)):
    if not db.get(models.KnowledgeItem, item_id):
        raise HTTPException(404, "Knowledge item not found")
    c = models.Comment(knowledge_item_id=item_id, author=payload.author or "Organizer", body=payload.body)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "author": c.author, "body": c.body, "created_at": c.created_at.isoformat() if c.created_at else None}


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, db: Session = Depends(get_db)):
    c = db.get(models.Comment, comment_id)
    if not c:
        raise HTTPException(404, "Comment not found")
    db.delete(c)
    db.commit()


# ---------- Documents ----------
@router.get("/knowledge/{item_id}/documents")
def list_documents(item_id: int, db: Session = Depends(get_db)):
    rows = db.query(models.Document).filter_by(knowledge_item_id=item_id).order_by(models.Document.id.desc()).all()
    return [_doc_dict(d) for d in rows]


@router.post("/documents", status_code=201)
async def create_document(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    external_url: Optional[str] = Form(None),
    knowledge_item_id: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    if knowledge_item_id and not db.get(models.KnowledgeItem, knowledge_item_id):
        raise HTTPException(404, "Knowledge item not found")
    if not file and not external_url:
        raise HTTPException(400, "Provide either a file upload or an external link")

    doc = models.Document(
        title=title, description=description, category=category, knowledge_item_id=knowledge_item_id
    )
    if file:
        ext = Path(file.filename or "").suffix
        stored = f"{uuid.uuid4().hex}{ext}"
        dest = UPLOAD_DIR / stored
        content = await file.read()
        dest.write_bytes(content)
        doc.is_upload = True
        doc.file_name = file.filename
        doc.storage_path = str(dest)
        doc.content_type = file.content_type
        doc.size_bytes = len(content)
    else:
        doc.is_upload = False
        doc.file_url = external_url
        doc.file_name = title

    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _doc_dict(doc)


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db)):
    d = db.get(models.Document, doc_id)
    if not d or not d.is_upload or not d.storage_path or not Path(d.storage_path).exists():
        raise HTTPException(404, "File not found")
    return FileResponse(d.storage_path, filename=d.file_name or "document", media_type=d.content_type or "application/octet-stream")


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    d = db.get(models.Document, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    if d.is_upload and d.storage_path:
        Path(d.storage_path).unlink(missing_ok=True)
    db.delete(d)
    db.commit()
