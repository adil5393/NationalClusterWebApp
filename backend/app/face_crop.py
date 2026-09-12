"""Suggests an initial crop box for a participant's ID-card photo by
detecting the face in it — this only ever seeds the starting position/zoom
of the manual cropper in the upload dialog (frontend/TeamPortal.tsx), it
never crops anything itself. Uses OpenCV's bundled Haar Cascade face
detector (no model file to download/ship — it's packaged inside
opencv-python-headless itself), not a DNN model, since "roughly center the
box on the face" doesn't need DNN-level accuracy and Haar cascades are fast
enough to run synchronously in a request handler.
"""
import io

import cv2
import numpy as np
from PIL import Image, ImageOps

from .id_card import PHOTO_BOX

_TARGET_RATIO = (PHOTO_BOX[2] - PHOTO_BOX[0]) / (PHOTO_BOX[3] - PHOTO_BOX[1])

# How much taller than the detected face height the suggested crop box
# should be (room for hair above and chin/shoulders below), and how far
# from the top of that box the face's vertical center should sit — both
# picked by eye against a handful of test ID photos, not derived from
# anything principled.
_FACE_HEIGHT_MULTIPLIER = 2.6
_FACE_VERTICAL_ANCHOR = 0.42

_face_cascade: "cv2.CascadeClassifier | None" = None


def _get_cascade() -> cv2.CascadeClassifier:
    global _face_cascade
    if _face_cascade is None:
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _face_cascade = cv2.CascadeClassifier(path)
    return _face_cascade


def _fallback_box(img_w: int, img_h: int) -> dict:
    """Same "center-crop to the box's aspect ratio" behaviour id_card.py's
    _paste_photo already falls back to today, expressed as 0-1 fractions."""
    src_ratio = img_w / img_h
    if src_ratio > _TARGET_RATIO:
        w = img_h * _TARGET_RATIO
        h = img_h
    else:
        w = img_w
        h = img_w / _TARGET_RATIO
    x = (img_w - w) / 2
    y = (img_h - h) / 2
    return {"x": x / img_w, "y": y / img_h, "width": w / img_w, "height": h / img_h}


def _clamp_box(cx: float, cy: float, w: float, h: float, img_w: int, img_h: int) -> tuple[float, float, float, float]:
    """Shrinks (w, h) to fit inside the image if needed (keeping aspect
    ratio), then clamps the top-left so the box stays fully in-bounds while
    staying centered on (cx, cy) as closely as possible."""
    scale = min(1.0, img_w / w, img_h / h)
    w *= scale
    h *= scale
    x = min(max(cx - w / 2, 0), img_w - w)
    y = min(max(cy - h / 2, 0), img_h - h)
    return x, y, w, h


def suggest_crop(content: bytes) -> dict:
    """Returns {x, y, width, height} as 0-1 fractions of the (EXIF-oriented)
    image, matching the ID card photo box's aspect ratio and centered on the
    largest detected face — or a plain center box if no face is confidently
    found. Never raises: any decode/detection failure just falls through to
    the safest possible fallback."""
    try:
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)  # match the orientation the browser will display
        img = img.convert("RGB")
    except Exception:  # noqa: BLE001
        return {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}

    img_w, img_h = img.size

    try:
        gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        faces = _get_cascade().detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    except Exception:  # noqa: BLE001
        faces = []

    if len(faces) == 0:
        return _fallback_box(img_w, img_h)

    # Largest detected face = assumed main subject (a solo headshot is what
    # this upload is for; a stray face in the background shouldn't win).
    # detectMultiScale returns numpy int32s — cast to plain ints so every
    # value derived from them below is a JSON-serializable native float.
    fx, fy, fw, fh = (int(v) for v in max(faces, key=lambda f: f[2] * f[3]))
    face_cx = fx + fw / 2
    face_cy = fy + fh / 2

    crop_h = fh * _FACE_HEIGHT_MULTIPLIER
    crop_w = crop_h * _TARGET_RATIO
    crop_cy = face_cy - crop_h * (_FACE_VERTICAL_ANCHOR - 0.5)

    x, y, w, h = _clamp_box(face_cx, crop_cy, crop_w, crop_h, img_w, img_h)
    return {"x": float(x / img_w), "y": float(y / img_h), "width": float(w / img_w), "height": float(h / img_h)}
