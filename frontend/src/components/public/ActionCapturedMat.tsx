import { useEffect, useMemo, useState } from "react";
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Images,
} from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface GalleryPhotoT {
  id: number;
  url: string;
  tag: string;
}

// Grid shows this many photos at first, then "Show more" adds this many again
// — keeps the Live page short (and light on mobile data: tiles load the
// full-size photo, lazily, as they scroll into view).
const GRID_PAGE_SIZE = 12;

export function ActionCapturedMat() {
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhotoT[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(GRID_PAGE_SIZE);
  // Index into `shown` (the tag-filtered list), not galleryPhotos.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    setGalleryLoading(true);
    api
      .get<GalleryPhotoT[]>("/public/gallery")
      .then((r) => {
        if (Array.isArray(r.data)) {
          setGalleryPhotos(r.data);
        }
      })
      .catch(() => {})
      .finally(() => setGalleryLoading(false));
  }, []);

  const tags = useMemo(
    () => Array.from(new Set(galleryPhotos.map((p) => p.tag).filter(Boolean))),
    [galleryPhotos],
  );
  const shown = useMemo(
    () => (activeTag ? galleryPhotos.filter((p) => p.tag === activeTag) : galleryPhotos),
    [galleryPhotos, activeTag],
  );
  const gridPhotos = shown.slice(0, visibleCount);

  const selectTag = (tag: string | null) => {
    setActiveTag(tag);
    setVisibleCount(GRID_PAGE_SIZE);
  };

  const step = (delta: number) =>
    setLightboxIndex((prev) => (prev !== null ? (prev + delta + shown.length) % shown.length : null));

  // Keyboard navigation for the lightbox (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, shown.length]);

  // Stop the page behind the lightbox from scrolling while it's open.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxIndex]);

  // Preload the photos either side of the open one so arrowing is instant.
  useEffect(() => {
    if (lightboxIndex === null || shown.length < 2) return;
    for (const d of [1, -1]) {
      const img = new Image();
      img.src = assetUrl(shown[(lightboxIndex + d + shown.length) % shown.length].url);
    }
  }, [lightboxIndex, shown]);

  // Mobile swipe gestures for the lightbox
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40 && lightboxIndex !== null) step(diff > 0 ? 1 : -1);
    setTouchStartX(null);
  };

  const current = lightboxIndex !== null ? shown[lightboxIndex] : null;

  return (
    <>
      {/* -------------------------------------------------------------------------- */}
      {/* OFFICIAL PHOTOGRAPHY / ACTION CAPTURED ON THE MAT                          */}
      {/* -------------------------------------------------------------------------- */}
      <section className="border-t border-white/10 pt-8 pb-4 relative space-y-6">
        <div className="flex flex-col items-center text-center gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-gold animate-pulse shadow-[0_0_8px_#f59e0b]" />
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              OFFICIAL PHOTOGRAPHY
            </span>
            {galleryPhotos.length > 0 && (
              <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-300">
                {galleryPhotos.length} {galleryPhotos.length === 1 ? "Photograph" : "Photographs"}
              </span>
            )}
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
            Action Captured on the Mat
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-body max-w-xl">
            High-resolution moments of athleticism, victory celebrations, tactical timeouts, and the sportsmanship of the CBSE National Championship.
          </p>
        </div>

        {galleryLoading ? (
          <div className="mx-auto max-w-5xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-white/5 border border-white/10 animate-pulse" />
            ))}
          </div>
        ) : galleryPhotos.length === 0 ? (
          <div className="mx-auto max-w-4xl rounded-2xl border border-dashed border-white/15 bg-obsidian-900/60 p-10 sm:p-14 text-center space-y-4 shadow-lg">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold/10 text-gold border border-gold/20">
              <Trophy className="h-7 w-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="font-heading text-lg font-bold text-white">Championship Photo Gallery</h3>
              <p className="text-xs sm:text-sm text-slate-400 font-body leading-relaxed">
                Official tournament photographs from opening ceremonies, mat action, and podium presentations will be served directly here during match days.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            {/* TAG FILTER CHIPS — only when photos carry more than one tag */}
            {tags.length > 1 && (
              <div className="flex flex-wrap justify-center gap-1.5" data-testid="live-gallery-tags">
                {[null, ...tags].map((tag) => {
                  const on = activeTag === tag;
                  const count = tag ? galleryPhotos.filter((p) => p.tag === tag).length : galleryPhotos.length;
                  return (
                    <button
                      key={tag ?? "all"}
                      type="button"
                      onClick={() => selectTag(tag)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-heading font-bold transition-colors",
                        on
                          ? "border-gold/60 bg-gold/15 text-gold"
                          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      {tag ?? "All"} <span className="font-mono text-[10px] opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* PHOTO GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3" data-testid="live-gallery-grid">
              {gridPhotos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-obsidian-950 shadow-md transition-all hover:border-gold/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  aria-label={`Open photo ${i + 1}${p.tag ? ` (${p.tag})` : ""}`}
                  data-testid={`live-gallery-photo-${p.id}`}
                >
                  <img
                    src={assetUrl(p.url)}
                    alt={p.tag || `Championship photo ${i + 1}`}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.visibility = "hidden";
                    }}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Maximize2 className="absolute top-2 right-2 h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  {p.tag && !activeTag && tags.length > 1 && (
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-heading font-bold text-white backdrop-blur-sm">
                      {p.tag}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {shown.length > gridPhotos.length && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + GRID_PAGE_SIZE)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-heading font-bold text-white hover:bg-white/10 transition-colors"
                  data-testid="live-gallery-show-more"
                >
                  <Images className="h-3.5 w-3.5 text-gold" /> Show more ({shown.length - gridPhotos.length} left)
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* FULL-SCREEN PHOTO VIEWER */}
      {current && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col p-3 sm:p-5 select-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxIndex(null);
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
        >
          {/* TOP BAR */}
          <div className="flex items-center justify-between gap-4 pb-2 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-300 min-w-0">
              {current.tag && (
                <span className="font-heading font-extrabold uppercase text-gold truncate">{current.tag}</span>
              )}
              <span className="font-mono text-slate-400 shrink-0">
                {lightboxIndex + 1} / {shown.length}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline-block text-[11px] text-slate-500 font-mono">← → to browse · Esc to close</span>
              <button
                onClick={() => setLightboxIndex(null)}
                className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* PHOTO — as large as the screen allows */}
          <div
            className="relative flex-1 flex items-center justify-center min-h-0"
            onClick={(e) => {
              if (e.target === e.currentTarget) setLightboxIndex(null);
            }}
          >
            {shown.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-0 sm:left-2 z-20 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-obsidian-900/80 border border-white/20 text-white flex items-center justify-center hover:bg-gold hover:text-obsidian transition-all shadow-xl"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <img
              key={current.id}
              src={assetUrl(current.url)}
              alt={current.tag || "Championship photograph"}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
            />

            {shown.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-0 sm:right-2 z-20 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-obsidian-900/80 border border-white/20 text-white flex items-center justify-center hover:bg-gold hover:text-obsidian transition-all shadow-xl"
                aria-label="Next photo"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* THUMBNAIL STRIP — hidden on phones to give the photo the room */}
          {shown.length > 1 && (
            <div className="hidden sm:block shrink-0 pt-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none justify-start md:justify-center">
                {shown.map((photo, idx) => (
                  <button
                    key={photo.id}
                    onClick={() => setLightboxIndex(idx)}
                    className={cn(
                      "relative h-12 w-16 shrink-0 rounded-md overflow-hidden border transition-all",
                      idx === lightboxIndex
                        ? "border-gold ring-2 ring-gold opacity-100"
                        : "border-white/15 opacity-50 hover:opacity-100",
                    )}
                    aria-label={`View photo ${idx + 1}`}
                  >
                    <img src={assetUrl(photo.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default ActionCapturedMat;
