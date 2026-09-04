import { useState, useEffect, useMemo } from "react";

// Automatic Vite discovery: discover all supported image formats from src/assets/images-optimized/school/background/
const backgroundModules = import.meta.glob<string>(
  "/src/assets/images-optimized/school/background/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}",
  {
    eager: true,
    query: "?url",
    import: "default",
  }
);

// Group and naturally sort photos by filename
function discoverBackgroundPhotos(): string[] {
  const entries: Array<{ path: string; url: string }> = [];

  for (const [rawPath, url] of Object.entries(backgroundModules)) {
    if (typeof url !== "string" || !url) continue;
    entries.push({ path: rawPath.replace(/\\/g, "/"), url });
  }

  // Stable natural numeric sort on paths
  entries.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  return entries.map((e) => e.url);
}

const BACKGROUND_PHOTOS: string[] = discoverBackgroundPhotos();

const SLIDE_INTERVAL_MS = 6000;
const FADE_DURATION_MS = 1500;

export function SiteBackgroundSlideshow() {
  const photos = useMemo(() => BACKGROUND_PHOTOS, []);
  const [activePhoto, setActivePhoto] = useState<string>(photos[0] || "");
  const [incomingPhoto, setIncomingPhoto] = useState<string | null>(null);
  const [incomingOpacity, setIncomingOpacity] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Preload next image helper
  const preloadImage = (url: string) => {
    if (!url) return;
    const img = new Image();
    img.src = url;
  };

  // Preload initial next photo on mount
  useEffect(() => {
    if (photos.length > 1 && photos[1]) {
      preloadImage(photos[1]);
    }
  }, [photos]);

  // Slideshow rotation
  useEffect(() => {
    if (photos.length <= 1) return;

    const intervalTimer = setInterval(() => {
      const nextIdx = (photoIndex + 1) % photos.length;
      const nextUrl = photos[nextIdx];

      // Preload the one after next
      const afterNextIdx = (nextIdx + 1) % photos.length;
      if (photos[afterNextIdx]) {
        preloadImage(photos[afterNextIdx]);
      }

      setIncomingPhoto(nextUrl);
      setIncomingOpacity(false);

      // Trigger opacity transition on next animation frame
      const rAF1 = requestAnimationFrame(() => {
        const rAF2 = requestAnimationFrame(() => {
          setIncomingOpacity(true);
        });
        return () => cancelAnimationFrame(rAF2);
      });

      // Complete crossfade after FADE_DURATION_MS
      const timeout = setTimeout(() => {
        setActivePhoto(nextUrl);
        setIncomingPhoto(null);
        setIncomingOpacity(false);
        setPhotoIndex(nextIdx);
      }, FADE_DURATION_MS);

      return () => {
        cancelAnimationFrame(rAF1);
        clearTimeout(timeout);
      };
    }, SLIDE_INTERVAL_MS);

    return () => clearInterval(intervalTimer);
  }, [photos, photoIndex]);

  if (photos.length === 0 || !activePhoto) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden select-none z-0"
      aria-hidden="true"
    >
      {/* BASE ACTIVE IMAGE (VIEWPORT CONSTRAINED) */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          key={activePhoto}
          src={activePhoto}
          alt=""
          className={`h-full w-full object-cover object-center ${
            reducedMotion
              ? "scale-100"
              : photoIndex % 2 === 0
              ? "animate-ken-burns-slow"
              : "animate-ken-burns-pan"
          }`}
          style={{
            animationDuration: `${SLIDE_INTERVAL_MS + 1000}ms`,
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
      </div>

      {/* INCOMING OVERLAY IMAGE (FADING IN) */}
      {incomingPhoto && (
        <div
          className={`absolute inset-0 overflow-hidden transition-opacity ease-in-out ${
            incomingOpacity ? "opacity-100" : "opacity-0"
          }`}
          style={{
            transitionDuration: `${FADE_DURATION_MS}ms`,
          }}
        >
          <img
            key={incomingPhoto}
            src={incomingPhoto}
            alt=""
            className={`h-full w-full object-cover object-center ${
              reducedMotion
                ? "scale-100"
                : (photoIndex + 1) % 2 === 0
                ? "animate-ken-burns-slow"
                : "animate-ken-burns-pan"
            }`}
            style={{
              animationDuration: `${SLIDE_INTERVAL_MS + 1000}ms`,
              objectFit: "cover",
              objectPosition: "center",
            }}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* GLOBAL CINEMATIC DARK GRADIENTS & MULTI-LAYER OVERLAYS        */}
      {/* ------------------------------------------------------------- */}

      {/* 1. Base dark tint overlay (74% deep obsidian tint for maximum site-wide readability) */}
      <div className="absolute inset-0 bg-obsidian-950/74 backdrop-brightness-[0.52]" />

      {/* 2. Top vignette (seamless blend with sticky navigation header) */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-obsidian-950/95 via-obsidian-950/60 to-transparent" />

      {/* 3. Bottom vignette (seamless blend with footer) */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-obsidian-950/95 via-obsidian-950/60 to-transparent" />

      {/* 4. Left radial reading spotlight for headings & metadata */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_25%_25%,rgba(10,15,29,0.85),rgba(10,15,29,0.50))]" />

      {/* 5. Subtle ambient gold glow & court line texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_10%,rgba(245,158,11,0.06),transparent)]" />
      <div className="absolute inset-0 bg-kabaddi-court-subtle opacity-25 mix-blend-overlay" />
    </div>
  );
}
