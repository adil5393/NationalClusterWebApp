import { useEffect, useState } from "react";
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
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, priorityTone } from "@/lib/meta";

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

export default function Home() {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [quickCode, setQuickCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const navigate = useNavigate();

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
            {/* LEFT HERO TEXT */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-heading font-extrabold tracking-widest text-gold shadow-sm">
                  <Shield className="h-3.5 w-3.5 text-gold" /> CBSE NATIONAL EVENT
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                  <Award className="h-3.5 w-3.5 text-coral" /> October 2026
                </span>
              </div>

              <div className="space-y-2">
                <h1 className="font-heading text-3xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl text-white">
                  CBSE NATIONAL <br className="hidden sm:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold via-amber-400 to-coral">
                    KABADDI CHAMPIONSHIP
                  </span>
                  <span className="block text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-300 mt-1">
                    2026–27
                  </span>
                </h1>
              </div>

              <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-slate-300 font-body">
                Official digital tournament portal for the Cluster Nationals. Featuring around{" "}
                <strong className="text-white font-bold">800 elite student athletes</strong>, coaches, and delegations representing schools across India and international guest squads from Saudi Arabia.
              </p>

              {/* ACTION BUTTONS */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
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
