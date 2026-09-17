import { useEffect, useState } from "react";
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Images,
} from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface GalleryPhotoT {
  id: number;
  url: string;
  tag: string;
}

export function ActionCapturedMat() {
  // Championship gallery photos state
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhotoT[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Fetch championship gallery photos from backend
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

  // Automatic slideshow loop (4-second interval, paused when lightbox is open)
  useEffect(() => {
    if (galleryPhotos.length < 2 || lightboxIndex !== null) return;
    const timer = setInterval(() => {
      setGalleryIndex((i) => (i + 1) % galleryPhotos.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [galleryPhotos.length, lightboxIndex]);

  // Preload adjacent next photo
  useEffect(() => {
    if (galleryPhotos.length > 1) {
      const nextIdx = (galleryIndex + 1) % galleryPhotos.length;
      const img = new Image();
      img.src = assetUrl(galleryPhotos[nextIdx].url);
    }
  }, [galleryIndex, galleryPhotos]);

  // Keyboard navigation for Lightbox modal (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) =>
          prev !== null ? (prev - 1 + galleryPhotos.length) % galleryPhotos.length : null,
        );
      }
      if (e.key === "ArrowRight") {
        setLightboxIndex((prev) =>
          prev !== null ? (prev + 1) % galleryPhotos.length : null,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, galleryPhotos.length]);

  // Mobile swipe gestures for lightbox
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40 && lightboxIndex !== null) {
      if (diff > 0) {
        setLightboxIndex((lightboxIndex + 1) % galleryPhotos.length);
      } else {
        setLightboxIndex((lightboxIndex - 1 + galleryPhotos.length) % galleryPhotos.length);
      }
    }
    setTouchStartX(null);
  };

  return (
    <>
      {/* -------------------------------------------------------------------------- */}
      {/* OFFICIAL PHOTOGRAPHY / ACTION CAPTURED ON THE MAT                          */}
      {/* -------------------------------------------------------------------------- */}
      <section className="border-t border-white/10 pt-8 pb-4 relative overflow-hidden space-y-6">
        <div className="flex flex-col items-center text-center gap-2 mb-4">
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

        {/* LOADING STATE */}
        {galleryLoading ? (
          <div className="mx-auto max-w-4xl h-72 sm:h-96 md:h-[460px] rounded-2xl border border-white/10 bg-obsidian-900/60 flex flex-col items-center justify-center p-8 text-center shadow-lg">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent mb-3" />
            <p className="text-xs sm:text-sm font-heading font-bold text-slate-300">
              Discovering championship photographs…
            </p>
          </div>
        ) : galleryPhotos.length === 0 ? (
          /* EMPTY STATE: WHEN 0 PHOTOS ARE AVAILABLE */
          <div className="mx-auto max-w-4xl rounded-2xl border border-dashed border-white/15 bg-obsidian-900/60 p-10 sm:p-14 text-center space-y-4 shadow-lg">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold/10 text-gold border border-gold/20">
              <Trophy className="h-7 w-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="font-heading text-lg font-bold text-white">
                Championship Photo Gallery
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 font-body leading-relaxed">
                Official tournament photographs from opening ceremonies, mat action, and podium presentations will be served directly here during match days.
              </p>
            </div>
          </div>
        ) : (
          /* ACTIVE AUTOMATIC SLIDESHOW FRAME */
          <div
            onClick={() => setLightboxIndex(galleryIndex)}
            className="group relative mx-auto block w-full max-w-4xl h-72 sm:h-96 md:h-[460px] overflow-hidden rounded-2xl border border-white/15 bg-obsidian-950 shadow-2xl transition-all duration-300 hover:border-gold/50 hover:shadow-gold-glow cursor-pointer select-none"
            data-testid="live-gallery-slideshow"
            role="button"
            tabIndex={0}
            aria-label="Open photo gallery lightbox"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setLightboxIndex(galleryIndex);
              }
            }}
          >
            {/* Photo Slides (Smooth crossfade transition) */}
            {galleryPhotos.map((p, i) => (
              <div
                key={p.id}
                className={cn(
                  "absolute inset-0 h-full w-full transition-opacity duration-700 ease-in-out pointer-events-none",
                  i === galleryIndex ? "opacity-100 z-10" : "opacity-0 z-0",
                )}
              >
                <img
                  src={assetUrl(p.url)}
                  alt={p.tag || `Championship photo ${i + 1}`}
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                  className="h-full w-full object-cover object-center"
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
              </div>
            ))}

            {/* Subtle bottom gradient overlay for readability */}
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-obsidian-950/90 via-obsidian-950/20 to-transparent pointer-events-none" />

            {/* Top-Right "Open Lightbox" hint on hover */}
            <div className="absolute top-3.5 right-3.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-obsidian-900/90 border border-white/15 px-2.5 py-1 text-xs font-heading font-bold text-white shadow-md backdrop-blur-md">
                <Maximize2 className="h-3.5 w-3.5 text-gold" /> Open Lightbox
              </span>
            </div>

            {/* Bottom Information & Pagination Bar */}
            <div className="absolute inset-x-0 bottom-0 z-30 p-4 sm:p-5 flex items-center justify-between gap-3 pointer-events-none">
              <div className="flex items-center gap-2">
                {galleryPhotos[galleryIndex]?.tag && (
                  <Badge tone="gold" size="sm" className="backdrop-blur-md">
                    {galleryPhotos[galleryIndex].tag}
                  </Badge>
                )}
                <span className="rounded bg-obsidian-900/80 border border-white/10 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-300 backdrop-blur-md">
                  {String(galleryIndex + 1).padStart(2, "0")} / {String(galleryPhotos.length).padStart(2, "0")}
                </span>
              </div>

              {/* Tiny pagination dots */}
              {galleryPhotos.length > 1 && (
                <div className="hidden sm:flex items-center gap-1.5 pointer-events-auto">
                  {galleryPhotos.slice(0, 10).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGalleryIndex(idx);
                      }}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        idx === galleryIndex ? "w-6 bg-gold" : "w-1.5 bg-white/40 hover:bg-white/70",
                      )}
                      aria-label={`Go to slide ${idx + 1}`}
                    />
                  ))}
                  {galleryPhotos.length > 10 && (
                    <span className="text-[10px] text-slate-400 font-mono pl-1">
                      +{galleryPhotos.length - 10}
                    </span>
                  )}
                </div>
              )}

              <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 border border-white/15 px-3 py-1.5 text-xs font-heading font-bold text-white backdrop-blur-md">
                <Images className="h-3.5 w-3.5 text-gold" /> Browse All
              </span>
            </div>

            {/* Subtle Prev / Next controls appearing on hover */}
            {galleryPhotos.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setGalleryIndex((prev) => (prev - 1 + galleryPhotos.length) % galleryPhotos.length);
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-30 h-10 w-10 rounded-full bg-obsidian-900/80 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gold hover:text-obsidian transition-all duration-200 shadow-lg backdrop-blur-md"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setGalleryIndex((prev) => (prev + 1) % galleryPhotos.length);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-30 h-10 w-10 rounded-full bg-obsidian-900/80 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gold hover:text-obsidian transition-all duration-200 shadow-lg backdrop-blur-md"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* FULL GALLERY LIGHTBOX MODAL */}
      {lightboxIndex !== null && galleryPhotos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 select-none animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxIndex(null);
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* TOP MODAL BAR */}
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold border border-gold/30 shrink-0">
                <Images className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="font-heading text-sm sm:text-base font-bold text-white truncate">
                  Championship Photo Gallery
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {galleryPhotos[lightboxIndex].tag && (
                    <span className="font-heading font-extrabold uppercase text-gold">
                      {galleryPhotos[lightboxIndex].tag}
                    </span>
                  )}
                  <span>·</span>
                  <span>
                    Photo {lightboxIndex + 1} of {galleryPhotos.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline-block text-[11px] text-slate-500 font-mono">
                Use ← → arrows / Esc
              </span>
              <button
                onClick={() => setLightboxIndex(null)}
                className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* CENTER VIEWPORT: MAIN LARGE IMAGE & CONTROLS */}
          <div
            className="relative flex-1 flex items-center justify-center py-4 min-h-0"
            onClick={(e) => {
              if (e.target === e.currentTarget) setLightboxIndex(null);
            }}
          >
            {/* Prev Button */}
            {galleryPhotos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev - 1 + galleryPhotos.length) % galleryPhotos.length : null,
                  );
                }}
                className="absolute left-1 sm:left-4 z-20 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-obsidian-900/90 border border-white/20 text-white flex items-center justify-center hover:bg-gold hover:text-obsidian transition-all shadow-xl backdrop-blur-md"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Main Photo Display */}
            <div className="relative max-h-full max-w-full flex items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-obsidian-950 shadow-2xl">
              <img
                src={assetUrl(galleryPhotos[lightboxIndex].url)}
                alt={galleryPhotos[lightboxIndex].tag || "Championship photograph"}
                className="max-h-[58vh] sm:max-h-[66vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>

            {/* Next Button */}
            {galleryPhotos.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev + 1) % galleryPhotos.length : null,
                  );
                }}
                className="absolute right-1 sm:right-4 z-20 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-obsidian-900/90 border border-white/20 text-white flex items-center justify-center hover:bg-gold hover:text-obsidian transition-all shadow-xl backdrop-blur-md"
                aria-label="Next photo"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* BOTTOM THUMBNAIL STRIP */}
          <div className="shrink-0 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none snap-x justify-start sm:justify-center">
              {galleryPhotos.map((photo, idx) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxIndex(idx)}
                  className={cn(
                    "relative h-12 w-16 sm:h-14 sm:w-20 shrink-0 rounded-lg overflow-hidden border transition-all snap-start",
                    idx === lightboxIndex
                      ? "border-gold ring-2 ring-gold scale-105 opacity-100"
                      : "border-white/15 opacity-50 hover:opacity-100 hover:border-white/40",
                  )}
                  aria-label={`View photo ${idx + 1}`}
                >
                  <img
                    src={assetUrl(photo.url)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ActionCapturedMat;
