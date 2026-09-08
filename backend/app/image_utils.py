"""Shared image re-encoding used by every user-facing photo upload (gallery
photos, participant photos, ...). Lives outside routers/ so both public.py
and gallery.py can import it without a circular import between them."""
import io

from PIL import Image, ImageOps

# A modern phone camera shoots 4000px+/8-12MB JPEGs — full resolution buys
# nothing on a gallery grid, lightbox, or a participant's small profile photo,
# so every upload is downsized to this before hitting disk. Keeps storage and
# public-page load times sane without a visible quality hit (this is also
# what made bright/detailed photos look "broken" in the gallery — they were
# the ones landing over nginx's request-size limit).
MAX_DIMENSION = 2000
JPEG_QUALITY = 82
WEBP_QUALITY = 82


def optimize_image(content: bytes, ext: str) -> bytes:
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

    if max(img.size) > MAX_DIMENSION:
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    out = io.BytesIO()
    try:
        if ext in (".jpg", ".jpeg"):
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        elif ext == ".webp":
            img.save(out, format="WEBP", quality=WEBP_QUALITY)
        else:  # .png — lossless, so the resize above is the whole size win
            img.save(out, format="PNG", optimize=True)
    except Exception:  # noqa: BLE001
        return content
    return out.getvalue()
