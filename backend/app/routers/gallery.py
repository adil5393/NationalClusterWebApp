"""Championship Photo Gallery admin management — bulk upload from the admin
panel or camera capture from the mobile app both land in the same
backend/assets/about/ directory the public About page already scans (see
public.py's public_about_images), so no change was needed there: a new file
here is automatically picked up next time that endpoint is called."""
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from .public import ASSETS_ABOUT_DIR, VALID_IMAGE_EXTENSIONS, _natural_sort_key

router = APIRouter(prefix="/api/gallery", tags=["gallery"])

_SAFE_STEM_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _list_photos() -> list[dict]:
    if not ASSETS_ABOUT_DIR.exists():
        return []
    files = [
        f
        for f in ASSETS_ABOUT_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in VALID_IMAGE_EXTENSIONS and not f.name.startswith(".")
    ]
    files.sort(key=_natural_sort_key)
    return [{"filename": f.name, "url": f"/assets/about/{f.name}"} for f in files]


@router.get("/photos")
def list_photos():
    return _list_photos()


@router.post("/photos", status_code=201)
async def upload_photos(files: list[UploadFile] = File(...)):
    """Accepts one or many files in one request — the same endpoint serves
    both the admin panel's bulk-upload picker and the mobile app's
    take-a-photo button (which just uploads a single captured image)."""
    ASSETS_ABOUT_DIR.mkdir(parents=True, exist_ok=True)
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
        content = await f.read()
        (ASSETS_ABOUT_DIR / name).write_bytes(content)
        uploaded.append({"filename": name, "url": f"/assets/about/{name}"})
    return {"uploaded": uploaded, "errors": errors}


@router.delete("/photos/{filename}", status_code=204)
def delete_photo(filename: str):
    if "/" in filename or "\\" in filename or filename in (".", ".."):
        raise HTTPException(400, "Invalid filename")
    path = ASSETS_ABOUT_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Photo not found")
    path.unlink()
