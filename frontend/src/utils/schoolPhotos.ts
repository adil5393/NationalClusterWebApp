// frontend/src/utils/schoolPhotos.ts

export type SchoolCategory = "main" | "ground" | "campus" | "building" | "entrance";

export const SCHOOL_CATEGORIES: readonly SchoolCategory[] = [
  "main",
  "ground",
  "campus",
  "building",
  "entrance",
] as const;

// Vite automatic discovery: find all photos under src/assets/images-optimized/school/
// — resized (max 1600px wide) and re-encoded as WebP by
// scripts/optimize-school-photos.py, since the raw camera originals in
// src/assets/images/school/ run 8-16MB each (~196MB total) and were making
// the homepage download every one of them at once. Originals are untouched;
// re-run that script after adding new photos there.
const photoModules = import.meta.glob<string>(
  "/src/assets/images-optimized/school/**/*.webp",
  {
    eager: true,
    query: "?url",
    import: "default",
  }
);

// Group and naturally sort photos by category folder
function discoverSchoolPhotos(): Record<SchoolCategory, string[]> {
  const grouped: Record<SchoolCategory, Array<{ path: string; url: string }>> = {
    main: [],
    ground: [],
    campus: [],
    building: [],
    entrance: [],
  };

  for (const [rawPath, url] of Object.entries(photoModules)) {
    if (typeof url !== "string" || !url) continue;

    const normalizedPath = rawPath.replace(/\\/g, "/");
    const match = normalizedPath.match(/\/school\/([^/]+)\//i);
    if (!match) continue;

    const categoryKey = match[1].toLowerCase() as SchoolCategory;
    if (categoryKey in grouped) {
      grouped[categoryKey].push({ path: normalizedPath, url });
    }
  }

  // Stable natural numeric sort on paths (e.g. 1.jpg, 2.jpg, 10.jpg)
  const result: Record<SchoolCategory, string[]> = {
    main: [],
    ground: [],
    campus: [],
    building: [],
    entrance: [],
  };

  for (const category of SCHOOL_CATEGORIES) {
    const items = grouped[category];
    items.sort((a, b) =>
      a.path.localeCompare(b.path, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
    result[category] = items.map((item) => item.url);
  }

  return result;
}

export const schoolPhotos: Record<SchoolCategory, string[]> = discoverSchoolPhotos();

export function getSchoolPhotos(category: SchoolCategory): string[] {
  return schoolPhotos[category] || [];
}

export interface SchoolCategoryMeta {
  category: SchoolCategory;
  title: string;
  subtitle: string;
  tag: string;
  featured?: boolean;
}

export const SCHOOL_CATEGORY_METAS: SchoolCategoryMeta[] = [
  {
    category: "main",
    title: "Main Campus & Administrative Block",
    subtitle: "Central administrative building, accreditation offices & tournament reception at New Angels Sr. Sec. School",
    tag: "FEATURED CAMPUS",
    featured: true,
  },
  {
    category: "ground",
    title: "Championship Sports Arena",
    subtitle: "AKFI-standard synthetic Kabaddi courts, electronic scoreboards & spectator galleries",
    tag: "SPORTS ARENA",
  },
  {
    category: "campus",
    title: "Lush Green Campus Environment",
    subtitle: "Spacious, secure grounds welcoming visiting athletes from across India and Saudi Arabia",
    tag: "CAMPUS GROUNDS",
  },
  {
    category: "building",
    title: "Academic & Tech Pavilion",
    subtitle: "Modern facilities, briefing halls & athlete control rooms",
    tag: "FACILITIES",
  },
  {
    category: "entrance",
    title: "Main Entrance & Welcome Gate",
    subtitle: "Official gateway welcoming participating state delegations to Pratapgarh",
    tag: "WELCOME GATE",
  },
];
