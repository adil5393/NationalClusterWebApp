"""Championship Photo Gallery admin management — bulk upload from the admin
panel or camera capture from the mobile app both land in the same
backend/assets/about/ directory the public About page already scans (see
public.py's public_about_images), so no change was needed there: a new file
here is automatically picked up next time that endpoint is called. Each
upload is also tracked in the gallery_photos table with a day/group tag, so
the public homepage's album view can group them (see public.py's
public_gallery)."""
import io
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .public import ASSETS_ABOUT_DIR, VALID_IMAGE_EXTENSIONS

router = APIRouter(prefix="/api/gallery", tags=["gallery"])

_SAFE_STEM_RE = re.compile(r"[^A-Za-z0-9._-]+")

# A modern phone camera shoots 4000px+/8-12MB JPEGs — full resolution buys
# nothing on a gallery grid or lightbox, so every upload is downsized to this
# before hitting disk. Keeps storage and public-page load times sane without
# a visible quality hit (this is also what made bright/detailed photos look
# "broken" — they were the ones landing over nginx's request-size limit).
_MAX_DIMENSION = 2000
_JPEG_QUALITY = 82
_WEBP_QUALITY = 82


def _optimize_image(content: bytes, ext: str) -> bytes:
    """Re-encodes an uploaded image at a capped resolution/quality. Falls
    back to the original bytes if Pillow can't decode it (corrupt upload, or
    a format PIL doesn't recognize despite the extension) — better to store
    the original than to reject an otherwise-valid upload."""
    try:
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)  # bake in rotation before EXIF is dropped
        img.load()
    except Exception:  # noqa: BLE001
        return content

    if max(img.size) > _MAX_DIMENSION:
        img.thumbnail((_MAX_DIMENSION, _MAX_DIMENSION), Image.LANCZOS)

    out = io.BytesIO()
    try:
        if ext in (".jpg", ".jpeg"):
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            img.save(out, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
        elif ext == ".webp":
            img.save(out, format="WEBP", quality=_WEBP_QUALITY)
        else:  # .png — lossless, so the resize above is the whole size win
            img.save(out, format="PNG", optimize=True)
    except Exception:  # noqa: BLE001
        return content
    return out.getvalue()


@router.get("/photos", response_model=list[schemas.GalleryPhotoRead])
def list_photos(db: Session = Depends(get_db)):
    return (
        db.query(models.GalleryPhoto)
        .order_by(models.GalleryPhoto.tag.asc(), models.GalleryPhoto.created_at.asc())
        .all()
    )


@router.post("/photos", status_code=201)
async def upload_photos(files: list[UploadFile] = File(...), tag: str = Form("General"), db: Session = Depends(get_db)):
    """Accepts one or many files in one request — the same endpoint serves
    both the admin panel's bulk-upload picker and the mobile app's
    take-a-photo button (which just uploads a single captured image), each
    tagged with the same day/group label."""
    ASSETS_ABOUT_DIR.mkdir(parents=True, exist_ok=True)
    tag = tag.strip() or "General"
    uploaded = []
    errors = []
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in VALID_IMAGE_EXTENSIONS:
            errors.append(f"{f.filename}: unsupported file type (use JPG, PNG, or WEBP)")
            continue
        stem = _SAFE_STEM_RE.sub("_", Path(f.filename or "photo").stem)[:60] or "photo"
        # A random suffix, not the original name, is what actually goes on
        # disk — sidesteps both collisions (two "IMG_0001.jpg" from
        # different phones) and path-traversal-via-filename entirely.
        name = f"{stem}-{uuid.uuid4().hex[:8]}{ext}"
        content = _optimize_image(await f.read(), ext)
        (ASSETS_ABOUT_DIR / name).write_bytes(content)
        photo = models.GalleryPhoto(filename=name, tag=tag)
        db.add(photo)
        db.flush()
        uploaded.append({"id": photo.id, "filename": name, "url": photo.url, "tag": tag})
    db.commit()
    return {"uploaded": uploaded, "errors": errors}


@router.put("/photos/{photo_id}", response_model=schemas.GalleryPhotoRead)
def update_photo(photo_id: int, payload: schemas.GalleryPhotoUpdate, db: Session = Depends(get_db)):
    photo = db.get(models.GalleryPhoto, photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(photo, key, value)
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/photos/{photo_id}", status_code=204)
def delete_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = db.get(models.GalleryPhoto, photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found")
    path = ASSETS_ABOUT_DIR / photo.filename
    if path.exists() and path.is_file():
        path.unlink()
    db.delete(photo)
    db.commit()
