import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  CalendarDays,
  MapPin,
  ArrowRight,
  BedDouble,
  Bus,
  UtensilsCrossed,
  Radio,
  Trophy,
  Shield,
  Search,
  Megaphone,
  HelpCircle,
  PhoneCall,
  Activity,
  Award,
  Images,
  Building,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
} from "lucide-react";
import { api, assetUrl } from "@/lib/api";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { formatDate, priorityTone } from "@/lib/meta";
import { cn } from "@/lib/utils";

interface LiveMatch {
  id: number;
  tournament_name?: string;
  round_name?: string;
  team_a_name?: string;
  team_b_name?: string;
  team_a_score: number;
  team_b_score: number;
  status: string;
  venue_name?: string;
}

interface Announcement {
  id: number;
  title: string;
  message: string;
  priority: string;
  published_at?: string | null;
}

interface Team {
  id: number;
  name: string;
  school_code?: string | null;
  affiliation_number?: string | null;
}

interface GalleryPhotoT {
  id: number;
  url: string;
  tag: string;
}

const TOURNAMENT_SECTIONS = [
  {
    to: "/live",
    icon: Radio,
    title: "Live Match Arena",
    desc: "Real-time Kabaddi scoring, active court feeds, pool tables & knockout bracket.",
    badge: "LIVE NOW",
    badgeTone: "live" as const,
    highlight: true,
  },
  {
    to: "/teams",
    icon: Users,
    title: "Participating Teams",
    desc: "State champions from across India and guest delegations from Saudi Arabia.",
  },
  {
    to: "/schedule",
    icon: CalendarDays,
    title: "Tournament Schedule",
    desc: "Daily fixture timetables, opening ceremony, knockouts & championship finals.",
  },
  {
    to: "/campus",
    icon: MapPin,
    title: "Campus & Court Map",
    desc: "Interactive venue blueprint, match court pins, and room locator.",
  },
  {
    to: "/accommodation",
    icon: BedDouble,
    title: "Accommodation & Hostels",
    desc: "Hostel block assignments, floor arrangements, and team room guidelines.",
  },
  {
    to: "/food",
    icon: UtensilsCrossed,
    title: "Food & Dining Schedule",
    desc: "Athlete meal timings, nutritional dining arrangements, and dining hall location.",
  },
  {
    to: "/transport",
    icon: Bus,
    title: "Transport & Transit Routes",
    desc: "Airport / railway station pickups, team shuttles, and route coordinates.",
  },
  {
    to: "/contacts",
    icon: PhoneCall,
    title: "Emergency & Helpdesk",
    desc: "24/7 medical response, security control room, and organizing committee contacts.",
  },
  {
    to: "/faq",
    icon: HelpCircle,
    title: "Tournament FAQ",
    desc: "Protest rules, eligibility requirements, meal passes, and event guidelines.",
  },
];

import {
  SCHOOL_CATEGORY_METAS,
  getSchoolPhotos,
  type SchoolCategory,
} from "@/utils/schoolPhotos";
import { SchoolPhotoSlideshow } from "@/components/public/SchoolPhotoSlideshow";

export default function Home() {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [quickCode, setQuickCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhotoT[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [schoolModal, setSchoolModal] = useState<{
    category: SchoolCategory;
    photoIndex: number;
  } | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const navigate = useNavigate();

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
    if (galleryPhotos.length < 2 || lightboxIndex !== null || schoolModal !== null) return;
    const timer = setInterval(() => {
      setGalleryIndex((i) => (i + 1) % galleryPhotos.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [galleryPhotos.length, lightboxIndex, schoolModal]);

  // Preload adjacent next photo
  useEffect(() => {
    if (galleryPhotos.length > 1) {
      const nextIdx = (galleryIndex + 1) % galleryPhotos.length;
      const img = new Image();
      img.src = assetUrl(galleryPhotos[nextIdx].url);
    }
  }, [galleryIndex, galleryPhotos]);

  // Keyboard navigation for Lightbox modals (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (lightboxIndex === null && schoolModal === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
        setSchoolModal(null);
      }
      if (e.key === "ArrowLeft") {
        if (lightboxIndex !== null) {
          setLightboxIndex((prev) =>
            prev !== null ? (prev - 1 + galleryPhotos.length) % galleryPhotos.length : null,
          );
        } else if (schoolModal !== null) {
          const photos = getSchoolPhotos(schoolModal.category);
          if (photos.length > 1) {
            setSchoolModal((prev) =>
              prev ? { ...prev, photoIndex: (prev.photoIndex - 1 + photos.length) % photos.length } : null,
            );
          }
        }
      }
      if (e.key === "ArrowRight") {
        if (lightboxIndex !== null) {
          setLightboxIndex((prev) =>
            prev !== null ? (prev + 1) % galleryPhotos.length : null,
          );
        } else if (schoolModal !== null) {
          const photos = getSchoolPhotos(schoolModal.category);
          if (photos.length > 1) {
            setSchoolModal((prev) =>
              prev ? { ...prev, photoIndex: (prev.photoIndex + 1) % photos.length } : null,
            );
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, schoolModal, galleryPhotos.length]);

  // Mobile swipe gestures for lightbox
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (lightboxIndex !== null) {
        if (diff > 0) {
          setLightboxIndex((lightboxIndex + 1) % galleryPhotos.length);
        } else {
          setLightboxIndex((lightboxIndex - 1 + galleryPhotos.length) % galleryPhotos.length);
        }
      } else if (schoolModal !== null) {
        const photos = getSchoolPhotos(schoolModal.category);
        if (photos.length > 1) {
          if (diff > 0) {
            setSchoolModal((prev) =>
              prev ? { ...prev, photoIndex: (prev.photoIndex + 1) % photos.length } : null,
            );
          } else {
            setSchoolModal((prev) =>
              prev ? { ...prev, photoIndex: (prev.photoIndex - 1 + photos.length) % photos.length } : null,
            );
          }
        }
      }
    }
    setTouchStartX(null);
  };

  useEffect(() => {
    const loadLiveMatches = () => {
      api
        .get<LiveMatch[]>("/public/matches/live")
        .then((r) => setLiveMatches(r.data))
        .catch(() => {});
    };

    // Fetch live matches, then keep polling — this card has no single
    // tournament to subscribe a WebSocket to (it's whichever match is live
    // across ALL tournaments), so a lightweight interval is the right fit.
    loadLiveMatches();
    const interval = setInterval(loadLiveMatches, 15000);

    // Fetch announcements
    api
      .get<Announcement[]>("/public/announcements")
      .then((r) => setAnnouncements(r.data.slice(0, 2)))
      .catch(() => {});

    // Fetch teams for fast lookup
    api
      .get<Team[]>("/public/teams")
      .then((r) => setTeams(r.data))
      .catch(() => {});

    return () => clearInterval(interval);
  }, []);

  const handleQuickLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const query = quickCode.trim().toLowerCase();
    if (!query) return;

    const match = teams.find(
      (t) =>
        (t.school_code && t.school_code.toLowerCase() === query) ||
        (t.affiliation_number && t.affiliation_number.toLowerCase() === query) ||
        t.name.toLowerCase().includes(query),
    );

    if (match) {
      setCodeError("");
      navigate(`/teams/${match.id}`);
    } else {
      setCodeError(`No team found matching "${quickCode}". Try browsing all teams.`);
    }
  };

  return (
    <div data-testid="public-home" className="min-h-screen bg-obsidian text-slate-100 bg-kabaddi-court">
      {/* HERO SECTION */}
      <section className="relative isolate overflow-hidden border-b border-white/10 bg-arena-glow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 pt-12 pb-16 md:pt-16 md:pb-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            {/* LEFT HERO TEXT: DUAL PRIMARY BRANDING (HOST SCHOOL × NATIONAL CHAMPIONSHIP) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* PRIMARY BRANDING CONTAINER */}
              <div className="space-y-4">
                
                {/* 1. HOST SCHOOL IDENTITY */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[11px] font-heading font-extrabold uppercase tracking-widest text-gold shadow-sm">
                      <Building className="h-3.5 w-3.5 text-gold" /> Host Institution &amp; Venue
                    </span>
                  </div>
                  
                  <h1 className="font-heading text-2xl sm:text-4xl lg:text-[2.6rem] font-black leading-[1.1] tracking-tight text-white uppercase">
                    New Angels Senior Secondary School
                  </h1>
                  
                  <div className="flex items-center gap-1.5 text-sm sm:text-base font-semibold text-coral">
                    <MapPin className="h-4 w-4 text-coral shrink-0" />
                    <span>Pratapgarh, Uttar Pradesh</span>
                  </div>
                </div>

                {/* 2. ELEGANT CONNECTOR / RELATIONSHIP DIVIDER */}
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-gold/40 via-gold/20 to-transparent" />
                  <span className="text-[11px] sm:text-xs font-heading font-extrabold uppercase tracking-widest text-gold bg-gold/10 border border-gold/30 px-3 py-0.5 rounded-full shadow-inner">
                    Proud Host Of
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/20 to-gold/40" />
                </div>

                {/* 3. CHAMPIONSHIP EVENT IDENTITY */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                      <Shield className="h-3.5 w-3.5 text-gold" /> CBSE National Event
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                      <Award className="h-3.5 w-3.5 text-coral" /> October 2026
                    </span>
                  </div>

                  <h2 className="font-heading text-2xl sm:text-4xl lg:text-5xl font-black leading-[1.08] tracking-tight text-white">
                    CBSE NATIONAL <br className="hidden sm:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold via-amber-300 to-coral">
                      KABADDI CHAMPIONSHIP
                    </span>{" "}
                    <span className="inline-block sm:block text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-200 mt-0.5">
                      2026–27
                    </span>
                  </h2>
                </div>

              </div>

              {/* SECONDARY: PORTAL DESCRIPTION */}
              <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-slate-300 font-body">
                Official digital tournament portal for the Cluster Nationals hosted at New Angels Senior Secondary School in Pratapgarh, UP. Featuring around{" "}
                <strong className="text-white font-bold">800 elite student athletes</strong>, coaches, and delegations representing schools across India and international guest squads from Saudi Arabia.
              </p>

              {/* TERTIARY: ACTION BUTTONS */}
              <div className="pt-1 flex flex-wrap items-center gap-3">
                <Link
                  to="/live"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-heading font-black tracking-wide text-obsidian transition-all hover:bg-emerald-400 hover:shadow-live-glow active:scale-95 shadow-md"
                >
                  <span className="h-2 w-2 rounded-full bg-obsidian animate-live-dot" />
                  Live Match Center <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/teams"
                  data-testid="hero-teams-btn"
                  className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/15 px-5 py-3 text-sm font-heading font-bold text-gold transition-all hover:bg-gold/25 hover:border-gold active:scale-95"
                >
                  <Users className="h-4 w-4" />
                  Explore Teams
                </Link>
                <Link
                  to="/announcements"
                  data-testid="hero-announcements-btn"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm font-heading font-semibold text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                >
                  <Megaphone className="h-4 w-4 text-slate-400" />
                  Announcements
                </Link>
              </div>
            </div>

            {/* RIGHT HERO CARD: FAST TEAM LOOKUP & LIVE HIGHLIGHT */}
            <div className="lg:col-span-5 space-y-4 min-w-0 w-full max-w-full">
              {/* LIVE MATCH HIGHLIGHT CARD (if any live matches exist) */}
              {liveMatches.length > 0 ? (
                <div
                  className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-emerald-500/40 bg-obsidian-900/90 p-3.5 sm:p-5 shadow-live-glow backdrop-blur-md"
                  data-testid="homepage-live-match-card"
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <LiveBadge label="MATCH IN PROGRESS" className="shrink-0 text-[10px] sm:text-xs px-2 py-0.5" />
                    {liveMatches[0].venue_name && (
                      <span className="flex min-w-0 items-center justify-end gap-1 text-[11px] sm:text-xs font-mono text-emerald-400 font-bold truncate">
                        <MapPin className="h-3 w-3 text-gold shrink-0" />
                        <span className="truncate">{liveMatches[0].venue_name}</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-3 space-y-1.5 sm:space-y-2 min-w-0">
                    {/* Team A */}
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2 rounded-lg bg-white/[0.03] border border-white/5 p-2 sm:px-3 sm:py-2 min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 flex-1">
                        <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                        <span className="font-heading text-xs sm:text-sm font-bold text-white truncate min-w-0 flex-1" title={liveMatches[0].team_a_name || "Team A"}>
                          {liveMatches[0].team_a_name || "Team A"}
                        </span>
                        {liveMatches[0].team_a_score > liveMatches[0].team_b_score && (
                          <span className="shrink-0 rounded bg-emerald-500/20 text-emerald-400 text-[9px] sm:text-[10px] font-heading font-extrabold px-1.5 py-0.5">
                            LEADING
                          </span>
                        )}
                      </div>
                      <span className="font-heading text-base sm:text-xl font-black text-gold tabular-nums shrink-0 ml-2">
                        {liveMatches[0].team_a_score}
                      </span>
                    </div>

                    {/* Team B */}
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2 rounded-lg bg-white/[0.03] border border-white/5 p-2 sm:px-3 sm:py-2 min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 flex-1">
                        <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        <span className="font-heading text-xs sm:text-sm font-bold text-white truncate min-w-0 flex-1" title={liveMatches[0].team_b_name || "Team B"}>
                          {liveMatches[0].team_b_name || "Team B"}
                        </span>
                        {liveMatches[0].team_b_score > liveMatches[0].team_a_score && (
                          <span className="shrink-0 rounded bg-emerald-500/20 text-emerald-400 text-[9px] sm:text-[10px] font-heading font-extrabold px-1.5 py-0.5">
                            LEADING
                          </span>
                        )}
                      </div>
                      <span className="font-heading text-base sm:text-xl font-black text-gold tabular-nums shrink-0 ml-2">
                        {liveMatches[0].team_b_score}
                      </span>
                    </div>
                  </div>

                  <Link
                    to="/live"
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 py-2 sm:py-2.5 text-xs font-heading font-extrabold text-emerald-300 hover:bg-emerald-500/30 transition-colors w-full"
                  >
                    View Scorecard &amp; Commentary →
                  </Link>
                </div>
              ) : null}

              {/* COACH / SQUAD PORTAL LOOKUP */}
              <div className="rounded-xl border border-white/10 bg-obsidian-900/80 p-5 shadow-card-subtle backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
                    <Search className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="font-heading text-sm font-bold text-white">
                      Coach & Squad Portal
                    </h3>
                    <p className="text-[11px] text-slate-400 font-body">
                      Search team name or school code for room & transit details
                    </p>
                  </div>
                </div>

                <form onSubmit={handleQuickLookup} className="mt-4 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={quickCode}
                      onChange={(e) => setQuickCode(e.target.value)}
                      placeholder="e.g. DPS, KV, 104..."
                      className="h-10 text-xs"
                    />
                    <Button type="submit" variant="gold" className="h-10 text-xs px-4 shrink-0">
                      Lookup
                    </Button>
                  </div>
                  {codeError && <p className="text-xs text-red-400 font-medium">{codeError}</p>}
                </form>

                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-white/10">
                  <span>Host Campus: Main Sports Complex</span>
                  <Link to="/campus" className="text-gold hover:underline font-semibold">
                    Open Map →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="border-b border-white/10 bg-obsidian-950/90">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-white/5 md:grid-cols-4">
          {[
            { k: "~800", v: "Participants & Officials", icon: Users, tone: "gold" },
            { k: "India + KSA", v: "National & Int'l Teams", icon: Shield, tone: "coral" },
            { k: "3 Mats", v: "Official Kabaddi Courts", icon: Trophy, tone: "gold" },
            { k: "Real-time", v: "Live Digital Scoring", icon: Activity, tone: "live" },
          ].map((s) => (
            <div key={s.v} className="bg-obsidian-950 px-5 py-6 sm:px-6">
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-gold/80" />
                <p className="font-heading text-2xl font-black text-white sm:text-3xl tabular-nums">
                  {s.k}
                </p>
              </div>
              <p className="mt-1 text-xs font-heading font-bold uppercase tracking-wider text-slate-400">
                {s.v}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* RECENT ANNOUNCEMENTS BANNER (if any) */}
      {announcements.length > 0 && (
        <section className="border-b border-white/10 bg-gold/5 py-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="rounded bg-gold px-2 py-0.5 font-heading text-[10px] font-black uppercase text-obsidian tracking-wider shrink-0">
                  LATEST NOTICE
                </span>
                <p className="truncate text-xs text-slate-200 font-body">
                  <strong className="text-white font-bold">{announcements[0].title}:</strong>{" "}
                  {announcements[0].message}
                </p>
              </div>
              <Link
                to="/announcements"
                className="inline-flex items-center gap-1 text-xs font-bold text-gold hover:underline shrink-0"
              >
                All Notices ({announcements.length}) →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* HOST SCHOOL SHOWCASE & CAMPUS PHOTOS */}
      <section className="border-b border-white/10 bg-gradient-to-b from-obsidian-950 via-obsidian-900/70 to-obsidian-950 py-14 md:py-20 relative overflow-hidden">
        {/* Ambient background court lines */}
        <div className="absolute inset-0 bg-kabaddi-court-subtle pointer-events-none opacity-40" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 md:px-8 space-y-10">
          {/* SECTION HEADER */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-heading font-extrabold uppercase tracking-widest text-gold shadow-sm">
                  <Building className="h-3.5 w-3.5 text-gold" /> HOST SCHOOL
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-coral shrink-0" /> Pratapgarh, Uttar Pradesh
                </span>
              </div>

              <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
                Welcome to New Angels Senior Secondary School
              </h2>

              <p className="text-sm sm:text-base text-slate-300 font-body leading-relaxed pt-1">
                Proud host of the CBSE National Kabaddi Championship 2026–27 in Pratapgarh, Uttar Pradesh.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/campus"
                className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/15 px-4 py-2.5 text-xs sm:text-sm font-heading font-bold text-gold hover:bg-gold/25 hover:border-gold transition-colors shadow-sm"
              >
                <MapPin className="h-4 w-4" /> Interactive Campus Map
              </Link>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-xs sm:text-sm font-heading font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                About Host Institution →
              </Link>
            </div>
          </div>

          {/* CAMPUS HIGHLIGHT CHIPS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: "AKFI Synthetic Courts", desc: "4 Mats with electronic consoles", icon: Trophy },
              { label: "Athlete Hostels", desc: "24/7 Secure residential campus", icon: BedDouble },
              { label: "Sports Nutrition Hall", desc: "Audited athlete dining & catering", icon: UtensilsCrossed },
              { label: "Medical & Recovery", desc: "Doctors, physios & recovery bays", icon: Shield },
            ].map((chip) => (
              <div
                key={chip.label}
                className="rounded-xl border border-white/10 bg-obsidian-900/80 p-3.5 sm:p-4 backdrop-blur-sm shadow-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <chip.icon className="h-4 w-4 text-gold shrink-0" />
                  <span className="font-heading text-xs sm:text-sm font-bold text-white truncate">
                    {chip.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-body truncate">
                  {chip.desc}
                </p>
              </div>
            ))}
          </div>

          {/* MODERN RESPONSIVE PHOTO GALLERY */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Featured Large Card: Left Column (7 cols on lg) */}
            <div className="lg:col-span-7">
              <SchoolPhotoSlideshow
                meta={SCHOOL_CATEGORY_METAS[0]}
                onClick={(activeIndex) =>
                  setSchoolModal({ category: "main", photoIndex: activeIndex })
                }
                className="h-72 sm:h-96 lg:h-full min-h-[300px] sm:min-h-[380px]"
              />
            </div>

            {/* 4 Supporting Image Cards: Right 2x2 Grid (5 cols on lg) */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SCHOOL_CATEGORY_METAS.slice(1).map((meta) => (
                <SchoolPhotoSlideshow
                  key={meta.category}
                  meta={meta}
                  onClick={(activeIndex) =>
                    setSchoolModal({ category: meta.category, photoIndex: activeIndex })
                  }
                  className="h-52 sm:h-56"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TOURNAMENT DIRECTORY HUB */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 md:py-20">
        <div className="max-w-2xl space-y-1.5">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            Information Architecture
          </span>
          <h2 className="font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Everything for the championship, in one place
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed font-body">
            Fast access to schedules, court blueprints, team rosters, and accommodation services for athletes and visitors.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOURNAMENT_SECTIONS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              data-testid={`feature-${item.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={`group relative flex flex-col justify-between rounded-xl border p-5 transition-all duration-200 hover:-translate-y-1 ${
                item.highlight
                  ? "border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 via-obsidian-900 to-obsidian hover:border-emerald-400 hover:shadow-live-glow"
                  : "border-white/10 bg-obsidian-900/80 hover:border-gold/50 hover:bg-obsidian-800"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-lg border transition-colors ${
                      item.highlight
                        ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                        : "border-white/10 bg-white/5 text-gold group-hover:bg-gold group-hover:text-obsidian"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                  </div>
                  {item.badge && (
                    <Badge tone={item.badgeTone || "gold"}>{item.badge}</Badge>
                  )}
                </div>

                <h3 className="mt-4 font-heading text-base font-bold tracking-tight text-white group-hover:text-gold transition-colors">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400 font-body">
                  {item.desc}
                </p>
              </div>

              <div className="mt-5 flex items-center gap-1 text-xs font-heading font-extrabold text-gold">
                <span>View Section</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* OFFICIAL PHOTOGRAPHY / ACTION CAPTURED ON THE MAT                          */}
      {/* -------------------------------------------------------------------------- */}
      <section className="border-t border-white/10 bg-obsidian-950/70 py-14 md:py-20 relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <div className="flex flex-col items-center text-center gap-2 mb-8 sm:mb-10">
            <div className="flex items-center gap-2">
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
              data-testid="homepage-gallery-slideshow"
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
        </div>
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

      {/* HOST SCHOOL PHOTOS LIGHTBOX MODAL */}
      {schoolModal !== null && (() => {
        const meta =
          SCHOOL_CATEGORY_METAS.find((m) => m.category === schoolModal.category) ||
          SCHOOL_CATEGORY_METAS[0];
        const photos = getSchoolPhotos(schoolModal.category);
        const photoIndex =
          photos.length > 0
            ? Math.min(schoolModal.photoIndex, photos.length - 1)
            : 0;
        const currentSrc = photos[photoIndex];

        return (
          <div
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 select-none animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSchoolModal(null);
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* TOP MODAL BAR */}
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold border border-gold/30 shrink-0">
                  <Building className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-heading text-sm sm:text-base font-bold text-white truncate">
                    {meta.title} — New Angels Senior Secondary School
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-heading font-extrabold uppercase text-gold">
                      {meta.tag}
                    </span>
                    {photos.length > 0 && (
                      <>
                        <span>·</span>
                        <span>
                          Photo {photoIndex + 1} of {photos.length}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Category switcher pills */}
              <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto">
                {SCHOOL_CATEGORY_METAS.map((cm) => (
                  <button
                    key={cm.category}
                    onClick={() => setSchoolModal({ category: cm.category, photoIndex: 0 })}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-heading font-bold transition-colors whitespace-nowrap",
                      cm.category === schoolModal.category
                        ? "bg-gold text-obsidian shadow-sm"
                        : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {cm.category.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="hidden sm:inline-block text-[11px] text-slate-500 font-mono">
                  Use ← → arrows / Esc
                </span>
                <button
                  onClick={() => setSchoolModal(null)}
                  className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* CENTER VIEWPORT: MAIN LARGE IMAGE & CONTROLS */}
            <div
              className="relative flex-1 flex flex-col items-center justify-center py-4 min-h-0"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSchoolModal(null);
              }}
            >
              {/* Prev Button */}
              {photos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSchoolModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            photoIndex: (prev.photoIndex - 1 + photos.length) % photos.length,
                          }
                        : null
                    );
                  }}
                  className="absolute left-1 sm:left-4 z-20 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-obsidian-900/90 border border-white/20 text-white flex items-center justify-center hover:bg-gold hover:text-obsidian transition-all shadow-xl backdrop-blur-md"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              {/* Main Photo Display */}
              <div className="relative max-h-[60vh] sm:max-h-[66vh] max-w-full flex flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-obsidian-950 shadow-2xl">
                {currentSrc ? (
                  <img
                    key={currentSrc}
                    src={currentSrc}
                    alt={`${meta.title} photo`}
                    className="max-h-[52vh] sm:max-h-[60vh] w-auto max-w-full object-contain rounded-lg"
                  />
                ) : (
                  <div className="p-12 text-center flex flex-col items-center justify-center">
                    <Building className="h-12 w-12 text-gold/60 mb-2" />
                    <p className="text-sm font-heading font-bold text-white">{meta.title}</p>
                    <p className="text-xs text-slate-400 mt-1">No photographs placed in this folder yet.</p>
                  </div>
                )}
              </div>

              {/* Image Title & Caption below */}
              <div className="mt-3 text-center max-w-xl px-4 pointer-events-none">
                <h4 className="text-sm sm:text-base font-heading font-bold text-white">
                  {meta.title}
                </h4>
                <p className="text-xs text-slate-300 mt-1 font-body">
                  {meta.subtitle}
                </p>
              </div>

              {/* Next Button */}
              {photos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSchoolModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            photoIndex: (prev.photoIndex + 1) % photos.length,
                          }
                        : null
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
            {photos.length > 1 && (
              <div className="shrink-0 border-t border-white/10 pt-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none snap-x justify-start sm:justify-center">
                  {photos.map((src, idx) => (
                    <button
                      key={src}
                      onClick={() =>
                        setSchoolModal((prev) => (prev ? { ...prev, photoIndex: idx } : null))
                      }
                      className={cn(
                        "relative h-12 w-16 sm:h-14 sm:w-20 shrink-0 rounded-lg overflow-hidden border transition-all snap-start",
                        idx === photoIndex
                          ? "border-gold ring-2 ring-gold scale-105 opacity-100"
                          : "border-white/15 opacity-50 hover:opacity-100 hover:border-white/40"
                      )}
                      aria-label={`View photo ${idx + 1}`}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* BOTTOM CTA: COACHES & PARTICIPANTS */}
      <section className="border-t border-white/10 bg-obsidian-950/80 py-14 md:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-obsidian-900 to-obsidian p-8 md:p-12 text-center relative overflow-hidden">
            <div className="relative z-10 max-w-2xl mx-auto space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-xs font-heading font-bold text-gold">
                <Trophy className="h-3.5 w-3.5" /> OFFICIAL PARTICIPANT PORTAL
              </span>
              <h2 className="font-heading text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
                Are you an athlete, coach or team manager?
              </h2>
              <p className="text-sm text-slate-300 font-body leading-relaxed">
                Personalized team portals with dedicated room assignments, shuttle timings, and match lineups are ready. Check your school squad below.
              </p>
              <div className="pt-3 flex flex-wrap justify-center gap-3">
                <Link
                  to="/teams"
                  className="inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-3 text-xs sm:text-sm font-heading font-black text-obsidian hover:bg-gold-400 transition-all shadow-md active:scale-95"
                >
                  <Users className="h-4 w-4" /> Find Your Team Roster
                </Link>
                <Link
                  to="/campus"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-xs sm:text-sm font-heading font-bold text-white hover:bg-white/10 transition-all"
                >
                  <MapPin className="h-4 w-4 text-gold" /> Find Your Room on Map
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
