"""Resizes and re-encodes src/assets/images/school/** (raw camera photos,
often 8-16MB each) into src/assets/images-optimized/school/** as WebP,
which schoolPhotos.ts actually reads from. Originals are never modified —
re-run this after dropping new photos into src/assets/images/school/.

Requires Pillow: pip install pillow
"""
from pathlib import Path
from PIL import Image, ImageOps

SRC = Path(__file__).resolve().parent.parent / "src" / "assets" / "images" / "school"
DST = Path(__file__).resolve().parent.parent / "src" / "assets" / "images-optimized" / "school"

MAX_WIDTH = 1600
QUALITY = 80


def main() -> None:
    total_before = total_after = count = 0
    for src_path in SRC.rglob("*"):
        if not src_path.is_file() or src_path.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        rel = src_path.relative_to(SRC)
        dst_path = (DST / rel).with_suffix(".webp")
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        img = Image.open(src_path)
        img = ImageOps.exif_transpose(img)  # bake in camera rotation before resizing
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        if img.width > MAX_WIDTH:
            new_height = round(img.height * (MAX_WIDTH / img.width))
            img = img.resize((MAX_WIDTH, new_height), Image.LANCZOS)

        img.save(dst_path, "WEBP", quality=QUALITY, method=6)

        before, after = src_path.stat().st_size, dst_path.stat().st_size
        total_before += before
        total_after += after
        count += 1
        print(f"{rel} : {before / 1024 / 1024:.1f}MB -> {after / 1024:.0f}KB")

    print(f"\n{count} images optimized")
    print(f"Total: {total_before / 1024 / 1024:.1f}MB -> {total_after / 1024 / 1024:.1f}MB")


if __name__ == "__main__":
    main()
