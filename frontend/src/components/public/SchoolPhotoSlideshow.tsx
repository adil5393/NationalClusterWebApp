import { useEffect, useState } from "react";
import { Building, Images, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSchoolPhotos, type SchoolCategoryMeta } from "@/utils/schoolPhotos";

interface SchoolPhotoSlideshowProps {
  meta: SchoolCategoryMeta;
  className?: string;
  interval?: number;
  onClick?: (activeIndex: number) => void;
}

export function SchoolPhotoSlideshow({
  meta,
  className,
  interval = 2000,
  onClick,
}: SchoolPhotoSlideshowProps) {
  const photos = getSchoolPhotos(meta.category);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Tracks whether the CURRENT image has finished loading, so it fades in
  // instead of popping in — only one <img> is ever mounted at a time (see
  // render below), rather than stacking every photo in the category, which
  // used to make the browser download all of them the moment this card
  // mounted.
  const [loaded, setLoaded] = useState(false);

  // Rotate images automatically if more than 1 image is discovered
  useEffect(() => {
    if (photos.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, interval);

    return () => clearInterval(timer);
  }, [photos.length, interval]);

  useEffect(() => {
    setLoaded(false);
  }, [currentIndex]);

  // Preload the next photo so its fade-in is instant once it becomes current
  useEffect(() => {
    if (photos.length > 1) {
      const nextIdx = (currentIndex + 1) % photos.length;
      const img = new Image();
      img.src = photos[nextIdx];
    }
  }, [currentIndex, photos]);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(currentIndex)}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(currentIndex);
        }
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-obsidian-900 shadow-card-subtle transition-all duration-300 hover:border-gold/50 hover:shadow-gold-glow cursor-pointer select-none",
        className,
      )}
      aria-label={`View ${meta.title} gallery`}
    >
      {/* 1. Fallback Pure-CSS stylized background (always present behind images or displayed if 0 photos) */}
      <div className="absolute inset-0 bg-gradient-to-br from-obsidian-800 via-obsidian-900 to-obsidian-950 flex flex-col items-center justify-center p-6 text-center z-0 pointer-events-none">
        <div className="h-16 w-16 rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center mb-3">
          <Building className="h-8 w-8 text-gold" />
        </div>
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold mb-1">
          {meta.tag}
        </span>
        <span className="text-sm font-heading font-bold text-white max-w-xs">
          {meta.title}
        </span>
      </div>

      {/* 2. Active Photo (only ever one <img> mounted — fades in once loaded; the
          next photo is separately preloaded above so this is instant in practice) */}
      {photos.length > 0 && (
        <div
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-500 ease-in-out pointer-events-none z-10",
            loaded ? "opacity-100" : "opacity-0",
          )}
        >
          <img
            key={photos[currentIndex]}
            src={photos[currentIndex]}
            alt={`${meta.title} - photo ${currentIndex + 1}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
          />
        </div>
      )}

      {/* 3. Dark gradient overlay for text legibility */}
      <div className="absolute inset-0 z-20 bg-gradient-to-t from-obsidian-950/95 via-obsidian-950/40 to-transparent pointer-events-none" />

      {/* 4. Top Right Indicators */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2 pointer-events-none">
        {photos.length > 1 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-obsidian-900/80 border border-white/15 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300 backdrop-blur-md">
            <Images className="h-3 w-3 text-gold" />
            {currentIndex + 1} / {photos.length}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-md bg-obsidian-900/90 border border-white/20 px-2 py-1 text-[11px] font-heading font-bold text-white shadow-md backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Maximize2 className="h-3 w-3 text-gold" /> View Photos
        </span>
      </div>

      {/* 5. Badges & Captions */}
      <div className="absolute inset-x-0 bottom-0 z-30 p-4 sm:p-5 flex flex-col justify-end pointer-events-none">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/15 px-2 py-0.5 text-[10px] font-heading font-extrabold uppercase tracking-wider text-gold backdrop-blur-md">
            {meta.tag}
          </span>
          <span className="text-[11px] font-heading font-semibold text-slate-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hidden sm:inline-flex items-center gap-1">
            <Building className="h-3 w-3 text-gold" /> New Angels
          </span>
        </div>
        <h4
          className={cn(
            "font-heading font-bold text-white tracking-tight leading-snug group-hover:text-gold transition-colors",
            meta.featured ? "text-lg sm:text-2xl font-black" : "text-sm sm:text-base",
          )}
        >
          {meta.title}
        </h4>
        <p className="mt-1 text-xs text-slate-300 font-body line-clamp-2 leading-relaxed">
          {meta.subtitle}
        </p>
      </div>
    </div>
  );
}
