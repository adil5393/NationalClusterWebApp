import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Trophy,
  Shield,
  Award,
  Users,
  CalendarDays,
  Radio,
  Sparkles,
  Compass,
  Building,
  HeartHandshake,
  CheckCircle2,
  Flame,
  ArrowRight,
  MapPin,
  Cpu,
  QrCode,
  Zap,
  Globe2,
  FileCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Team {
  id: number;
  name: string;
  school?: string | null;
  region?: string | null;
  country?: string | null;
  member_count?: number | null;
  is_active?: boolean;
}

interface Tournament {
  id: number;
  name: string;
  sport?: string | null;
  status: string;
}

interface ScheduleEvent {
  id: number;
  title: string;
  start_time?: string | null;
}

export default function About() {
  // Real backend statistics state
  const [teams, setTeams] = useState<Team[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch real tournament data for "Championship at a Glance"
  useEffect(() => {
    setStatsLoading(true);
    Promise.allSettled([
      api.get<Team[]>("/public/teams"),
      api.get<Tournament[]>("/public/tournaments"),
      api.get<ScheduleEvent[]>("/public/schedule"),
    ]).then(([teamsRes, tournsRes, schedRes]) => {
      if (teamsRes.status === "fulfilled" && Array.isArray(teamsRes.value.data)) {
        // The public teams endpoint now returns inactive teams too (so
        // Teams.tsx can show them in their own section) — these stats stay
        // scoped to who's actually competing, same as before that change.
        setTeams(teamsRes.value.data.filter((t) => t.is_active !== false));
      }
      if (tournsRes.status === "fulfilled" && Array.isArray(tournsRes.value.data)) {
        setTournaments(tournsRes.value.data);
      }
      if (schedRes.status === "fulfilled" && Array.isArray(schedRes.value.data)) {
        setScheduleEvents(schedRes.value.data);
      }
      setStatsLoading(false);
    });
  }, []);

  // Real computed stats from active database records
  const totalTeams = teams.length;
  const uniqueRegions = useMemo(() => {
    const set = new Set(teams.map((t) => (t.region || "").trim()).filter(Boolean));
    return set.size;
  }, [teams]);
  const internationalTeams = useMemo(() => {
    return teams.filter((t) => t.country && t.country.toLowerCase() !== "india").length;
  }, [teams]);
  const totalTournaments = tournaments.length;
  const totalEvents = scheduleEvents.length;

  return (
    <div
      data-testid="public-about"
      className="min-h-screen text-slate-100 overflow-x-hidden"
    >
      {/* -------------------------------------------------------------------------- */}
      {/* 1. CINEMATIC CHAMPIONSHIP HERO                                              */}
      {/* -------------------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden border-b border-white/10 bg-arena-glow/40 pt-12 pb-16 sm:pt-16 sm:pb-24">
        {/* Subtle background court grid & radial spotlight */}
        <div className="absolute inset-0 bg-kabaddi-court-subtle opacity-60 pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6">
            <Link to="/" className="text-xs font-bold text-slate-400 hover:text-gold transition-colors">
              Home
            </Link>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">About</span>
          </div>

          <div className="max-w-4xl space-y-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-heading font-extrabold tracking-widest text-gold shadow-sm">
                <Trophy className="h-3.5 w-3.5 text-gold" /> CBSE NATIONAL CHAMPIONSHIP
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                <Shield className="h-3.5 w-3.5 text-coral" /> AKFI Technical Affiliation
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-mono font-bold text-emerald-400">
                2026–27 EDITION
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-black leading-[1.08] tracking-tight text-white">
                The Crucible of Champions. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold via-amber-400 to-coral">
                  Where Heritage Meets Athletic Grandeur.
                </span>
              </h1>
              <p className="text-base sm:text-lg text-slate-300 font-body leading-relaxed max-w-3xl pt-1">
                The Central Board of Secondary Education (CBSE) National Kabaddi Championship represents the pinnacle of
                school sports in India. Over four days of high-intensity competition, state cluster winners and international
                delegations clash on standard synthetic mats for the most coveted title in junior sport.
              </p>
            </div>

            {/* QUICK NAVIGATION ACTION PILLS */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/live"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs sm:text-sm font-heading font-black tracking-wide text-obsidian transition-all hover:bg-emerald-400 shadow-md active:scale-95"
              >
                <Radio className="h-4 w-4" /> Live Scoreboard Arena
              </Link>
              <Link
                to="/teams"
                className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs sm:text-sm font-heading font-black text-gold hover:bg-gold/20 transition-colors shadow-sm"
              >
                <Users className="h-4 w-4" /> Meet Qualified Teams
              </Link>
              <Link
                to="/schedule"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-xs sm:text-sm font-heading font-bold text-slate-200 hover:border-white/25 hover:text-white transition-colors"
              >
                <CalendarDays className="h-4 w-4 text-slate-400" /> Daily Fixtures
              </Link>
              <Link
                to="/campus"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-xs sm:text-sm font-heading font-bold text-slate-200 hover:border-white/25 hover:text-white transition-colors"
              >
                <MapPin className="h-4 w-4 text-slate-400" /> Campus & Court Map
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 2. "MORE THAN A TOURNAMENT" EDITORIAL SECTION                               */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 sm:py-20 border-b border-white/10">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
                EDITORIAL ESSENCE
              </span>
              <h2 className="font-heading text-2xl sm:text-4xl font-black text-white tracking-tight">
                More Than a Tournament: <br />
                A Celebration of Breath, Courage & Brotherhood
              </h2>
            </div>

            <p className="text-sm sm:text-base text-slate-300 font-body leading-relaxed">
              Kabaddi is India’s indigenous heartbeat—a sport forged in mud and tradition that has evolved into a
              dynamic, high-speed Olympic-style spectacle. In the 30-second duration of a single raid, an athlete must
              command stamina, razor-sharp spatial reflexes, unwavering courage, and absolute tactical synergy with seven
              defenders waiting on the baulk line.
            </p>

            <p className="text-sm sm:text-base text-slate-300 font-body leading-relaxed">
              The CBSE National Championship is not merely about trophies; it is a national stage where young athletes
              from diverse cultures, languages, and geographies forge lifelong bonds of mutual respect and sporting honor.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-white/10 bg-obsidian-900/90 p-4 space-y-2">
                <div className="flex items-center gap-2 text-gold font-heading font-bold text-sm">
                  <Flame className="h-4 w-4 text-gold" /> The Ancient 30-Second Duel
                </div>
                <p className="text-xs text-slate-400 font-body leading-relaxed">
                  Every raid demands holding the single continuous cant of breath while calculating split-second ankle
                  catches and bonus line dives.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-obsidian-900/90 p-4 space-y-2">
                <div className="flex items-center gap-2 text-coral font-heading font-bold text-sm">
                  <Globe2 className="h-4 w-4 text-coral" /> Pan-India & Gulf Unity
                </div>
                <p className="text-xs text-slate-400 font-body leading-relaxed">
                  Uniting champions from every Indian state along with international overseas delegations from Saudi
                  Arabia and the UAE.
                </p>
              </div>
            </div>
          </div>

          {/* EDITORIAL QUOTE & FEATURE CARD */}
          <div className="lg:col-span-6">
            <div className="relative rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-obsidian-900 to-obsidian p-6 sm:p-8 shadow-xl">
              <div className="absolute top-4 right-4 text-gold/20 font-heading text-6xl font-black select-none pointer-events-none">
                ”
              </div>

              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/15 px-3 py-1 text-xs font-heading font-extrabold uppercase tracking-wider text-gold">
                  <Sparkles className="h-3.5 w-3.5" /> Philosophy of Play
                </div>

                <blockquote className="font-heading text-lg sm:text-xl font-bold text-white leading-snug">
                  "When an athlete touches the sacred mat, they leave personal ambition behind and carry the pride of
                  their school, their zone, and the timeless heritage of Kabaddi."
                </blockquote>

                <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                  <div>
                    <p className="font-heading font-bold text-sm text-white">Organizing Committee</p>
                    <p className="text-xs text-slate-400 font-body">CBSE Sports Department & AKFI Panel</p>
                  </div>
                  <Badge tone="gold">National Grade</Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* CHAMPIONSHIP AT A GLANCE (REAL DATABASE DATA ONLY)                         */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 sm:py-20 border-b border-white/10">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-2">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            TOURNAMENT METRICS
          </span>
          <h2 className="font-heading text-2xl sm:text-4xl font-black text-white tracking-tight">
            Championship at a Glance
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-body">
            Real-time aggregate data from the active tournament management database.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-obsidian-900 to-obsidian p-5 text-center space-y-1 shadow-sm">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-gold/20 text-gold mb-2">
              <Trophy className="h-5 w-5" />
            </div>
            <p className="font-heading text-3xl sm:text-4xl font-black text-white tabular-nums">
              {statsLoading ? "…" : totalTeams}
            </p>
            <p className="text-xs font-heading font-bold uppercase tracking-wider text-gold">Qualified Teams</p>
            <p className="text-[11px] text-slate-400 font-body">Cluster winners & delegations</p>
          </div>

          <div className="rounded-2xl border border-coral/30 bg-gradient-to-br from-coral/10 via-obsidian-900 to-obsidian p-5 text-center space-y-1 shadow-sm">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-coral/20 text-coral mb-2">
              <Compass className="h-5 w-5" />
            </div>
            <p className="font-heading text-3xl sm:text-4xl font-black text-white tabular-nums">
              {statsLoading ? "…" : uniqueRegions || "Pan-India"}
            </p>
            <p className="text-xs font-heading font-bold uppercase tracking-wider text-coral">Regional Zones</p>
            <p className="text-[11px] text-slate-400 font-body">CBSE Clusters represented</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-obsidian-900 to-obsidian p-5 text-center space-y-1 shadow-sm">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 mb-2">
              <Globe2 className="h-5 w-5" />
            </div>
            <p className="font-heading text-3xl sm:text-4xl font-black text-white tabular-nums">
              {statsLoading ? "…" : internationalTeams > 0 ? internationalTeams : "Gulf Zone"}
            </p>
            <p className="text-xs font-heading font-bold uppercase tracking-wider text-emerald-400">
              International Squads
            </p>
            <p className="text-[11px] text-slate-400 font-body">Saudi Arabia & UAE</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-5 text-center space-y-1 shadow-sm">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-slate-200 mb-2">
              <Award className="h-5 w-5 text-gold" />
            </div>
            <p className="font-heading text-3xl sm:text-4xl font-black text-white tabular-nums">
              {statsLoading ? "…" : totalTournaments > 0 ? totalTournaments : "U-17 / U-19"}
            </p>
            <p className="text-xs font-heading font-bold uppercase tracking-wider text-slate-300">
              Tournament Brackets
            </p>
            <p className="text-[11px] text-slate-400 font-body">Boys & Girls age divisions</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-5 text-center space-y-1 shadow-sm col-span-2 sm:col-span-1">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-slate-200 mb-2">
              <CalendarDays className="h-5 w-5 text-emerald-400" />
            </div>
            <p className="font-heading text-3xl sm:text-4xl font-black text-white tabular-nums">
              {statsLoading ? "…" : totalEvents > 0 ? totalEvents : "4 Days"}
            </p>
            <p className="text-xs font-heading font-bold uppercase tracking-wider text-slate-300">Official Programme</p>
            <p className="text-[11px] text-slate-400 font-body">Matches, weigh-ins & finals</p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 6. CHAMPIONSHIP JOURNEY (ROAD TO NATIONALS)                                */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 sm:py-20 border-b border-white/10">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-2">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            COMPETITION PROGRESSION
          </span>
          <h2 className="font-heading text-2xl sm:text-4xl font-black text-white tracking-tight">
            The Road to the Nationals
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-body">
            How champion teams qualify through the rigorous multi-tiered CBSE sports pathway.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 relative">
          {/* STEP 1 */}
          <div className="relative rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-gold bg-gold/10 px-2 py-0.5 rounded">STEP 01</span>
              <span className="text-xs font-bold text-slate-500 font-body">Intra-School</span>
            </div>
            <h3 className="font-heading text-lg font-bold text-white">School Trials & Team Selection</h3>
            <p className="text-xs text-slate-300 font-body leading-relaxed">
              Schools across India and CBSE Gulf chapters conduct rigorous intra-mural trials, selecting squad rosters
              within official AKFI age and weight categories.
            </p>
          </div>

          {/* STEP 2 */}
          <div className="relative rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-coral bg-coral/10 px-2 py-0.5 rounded">STEP 02</span>
              <span className="text-xs font-bold text-slate-500 font-body">Cluster Level</span>
            </div>
            <h3 className="font-heading text-lg font-bold text-white">CBSE Regional Cluster Meets</h3>
            <p className="text-xs text-slate-300 font-body leading-relaxed">
              Hundreds of schools battle in regional clusters across North, South, East, and West zones. Only the gold
              medalist school in each cluster earns national qualification.
            </p>
          </div>

          {/* STEP 3 */}
          <div className="relative rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                STEP 03
              </span>
              <span className="text-xs font-bold text-slate-500 font-body">Accreditation</span>
            </div>
            <h3 className="font-heading text-lg font-bold text-white">Weigh-in & Technical Seedings</h3>
            <p className="text-xs text-slate-300 font-body leading-relaxed">
              Arriving at the National venue, athletes undergo official electronic weigh-ins, biometric verifications,
              and coaches technical draw meetings.
            </p>
          </div>

          {/* STEP 4 */}
          <div className="relative rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-obsidian-900 p-6 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-obsidian bg-gold px-2 py-0.5 rounded">STEP 04</span>
              <span className="text-xs font-bold text-gold font-body">Grand Stage</span>
            </div>
            <h3 className="font-heading text-lg font-black text-white">The National Championship</h3>
            <p className="text-xs text-slate-300 font-body leading-relaxed">
              Pool round-robins transition into high-stakes knockout quarterfinals, semifinals, and the live-streamed
              Grand Final match for national glory.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 7. HOST SCHOOL SECTION                                                     */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 sm:py-20 border-b border-white/10">
        <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-obsidian-900 via-obsidian to-obsidian-950 p-6 sm:p-10 lg:p-12 shadow-2xl">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
                  <Building className="h-4 w-4 text-gold" /> HOST INSTITUTION & CAMPUS
                </span>
              </div>

              <h2 className="font-heading text-2xl sm:text-4xl font-black text-white tracking-tight">
                World-Class Sporting Infrastructure & Warm Hospitality
              </h2>

              <p className="text-sm sm:text-base text-slate-300 font-body leading-relaxed">
                The host school campus is equipped with Olympic-standard facilities designed to provide visiting athletes,
                coaches, and CBSE technical observers with an unforgettable championship experience.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                  <CheckCircle2 className="h-5 w-5 text-gold shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-heading text-sm font-bold text-white">4 Synthetic Match Courts</h4>
                    <p className="text-xs text-slate-400 font-body">
                      AKFI-approved non-abrasive mats with official boundary markings and electronic score consoles.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                  <CheckCircle2 className="h-5 w-5 text-coral shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-heading text-sm font-bold text-white">24/7 Medical & Ice Recovery</h4>
                    <p className="text-xs text-slate-400 font-body">
                      On-site doctors, certified physiotherapists, ice baths, and dedicated ambulance response.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-heading text-sm font-bold text-white">High-Nutrition Athlete Dining</h4>
                    <p className="text-xs text-slate-400 font-body">
                      Specialized high-protein sports catering prepared in hygienic, audited kitchen facilities.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                  <CheckCircle2 className="h-5 w-5 text-gold shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-heading text-sm font-bold text-white">Secure Athlete Hostels</h4>
                    <p className="text-xs text-slate-400 font-body">
                      Comfortable room allocations with 24/7 security, hot water, and dedicated resident wardens.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Link to="/campus">
                  <Button variant="gold" size="sm">
                    <MapPin className="h-4 w-4" /> Explore Interactive Campus Map
                  </Button>
                </Link>
              </div>
            </div>

            {/* HOST HIGHLIGHT STAT CARD */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-obsidian-900/90 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className="text-xs font-heading font-bold uppercase tracking-wider text-slate-400">
                    CAMPUS HIGHLIGHTS
                  </span>
                  <Badge tone="gold">Certified Venue</Badge>
                </div>

                <ul className="space-y-3 text-xs sm:text-sm text-slate-300 font-body">
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">Main Stadium Seating</span>
                    <span className="font-bold text-white font-mono">1,500+ Spectators</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">Broadcast Camera Setup</span>
                    <span className="font-bold text-white font-mono">Multi-Angle HD Feeds</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">Transit Shuttle Service</span>
                    <span className="font-bold text-white font-mono">Airport / Station / Courts</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">Technical Jury Desk</span>
                    <span className="font-bold text-white font-mono">Electronic Video Review</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 8. "A CHAMPIONSHIP, CONNECTED" (DIGITAL INNOVATIONS)                        */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 sm:py-20 border-b border-white/10">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-2">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            DIGITAL TOURNAMENT ARCHITECTURE
          </span>
          <h2 className="font-heading text-2xl sm:text-4xl font-black text-white tracking-tight">
            A Championship, Connected
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-body">
            State-of-the-art web technology delivering real-time transparency for athletes, coaches, and spectators.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">Live WebSocket Scoring</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              Every raid point, bonus touch, super tackle, and all-out is broadcast to thousands of fans online within
              milliseconds.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold/15 text-gold">
              <QrCode className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">QR Delegation Passports</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              Every team receives a unique digital passport QR code providing instant mobile access to their room,
              transit, and schedule.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-coral/15 text-coral">
              <Cpu className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">Automated Bracket Logic</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              AKFI tie-breaker calculations (score difference, points scored, head-to-head) calculate pool standings and
              seed knockout brackets seamlessly.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-purple-500/15 text-purple-400">
              <FileCheck className="h-6 w-6" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">Paperless Desk & Bulletins</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              Official bulletins, schedule changes, and technical notices are published live to all delegations
              instantly without paper waste.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 9. BUILT FOR EVERYONE                                                      */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 sm:py-20 border-b border-white/10">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-2">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            ROLE-BASED EXPERIENCE
          </span>
          <h2 className="font-heading text-2xl sm:text-4xl font-black text-white tracking-tight">Built for Everyone</h2>
          <p className="text-xs sm:text-sm text-slate-400 font-body">
            Tailored digital interfaces designed specifically for every stakeholder in the championship ecosystem.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-white">For Athletes</h3>
              <Badge tone="gold" size="sm">
                Player
              </Badge>
            </div>
            <ul className="space-y-2 text-xs text-slate-300 font-body">
              <li className="flex items-center gap-2">
                <span className="text-gold font-bold">✓</span> Direct team room & bed assignments
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gold font-bold">✓</span> Daily dining & nutrition timetable
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gold font-bold">✓</span> Accurate mat call times
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-white">For Coaches</h3>
              <Badge tone="coral" size="sm">
                Tactical
              </Badge>
            </div>
            <ul className="space-y-2 text-xs text-slate-300 font-body">
              <li className="flex items-center gap-2">
                <span className="text-coral font-bold">✓</span> Real-time pool standings & point diffs
              </li>
              <li className="flex items-center gap-2">
                <span className="text-coral font-bold">✓</span> Technical jury & protest guidelines
              </li>
              <li className="flex items-center gap-2">
                <span className="text-coral font-bold">✓</span> Transport & airport transit routes
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-white">For Spectators</h3>
              <Badge tone="live" size="sm">
                Fan Hub
              </Badge>
            </div>
            <ul className="space-y-2 text-xs text-slate-300 font-body">
              <li className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span> Live court scores & point timelines
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span> Interactive knockout bracket
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span> High-res match photo flipbook
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-white">For Officials</h3>
              <Badge tone="neutral" size="sm">
                Organizers
              </Badge>
            </div>
            <ul className="space-y-2 text-xs text-slate-300 font-body">
              <li className="flex items-center gap-2">
                <span className="text-slate-400 font-bold">✓</span> Digital referee scoring console
              </li>
              <li className="flex items-center gap-2">
                <span className="text-slate-400 font-bold">✓</span> Instant staff task assignments
              </li>
              <li className="flex items-center gap-2">
                <span className="text-slate-400 font-bold">✓</span> Stylized CSV & PDF tournament reports
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 10. SPORTING VALUES                                                        */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-14 sm:py-20 border-b border-white/10">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-2">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">OUR ETHOS</span>
          <h2 className="font-heading text-2xl sm:text-4xl font-black text-white tracking-tight">
            The Pillars of Kabaddi
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 font-body">
            Timeless values instilled into every student athlete representing their institution.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-obsidian-900/80 p-6 space-y-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">Integrity & Fair Play</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              Uncompromising respect for referee decisions, opponents, and the sacred sanctity of the mat.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900/80 p-6 space-y-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-coral/15 text-coral">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">Brotherhood & Respect</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              Fierce rivalry on the mat transforms into lifelong comradery and cultural exchange outside the court.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900/80 p-6 space-y-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Flame className="h-5 w-5" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">Courage & Tenacity</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              Never retreating in the face of pressure; diving for the ankle or leaping over the chain with conviction.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-obsidian-900/80 p-6 space-y-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-500/15 text-blue-400">
              <Trophy className="h-5 w-5" />
            </div>
            <h3 className="font-heading text-base font-bold text-white">Excellence in Sport</h3>
            <p className="text-xs text-slate-400 font-body leading-relaxed">
              Pursuing mastery of the craft, discipline in training, and humility in both victory and defeat.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------------- */}
      {/* 11. FINAL CINEMATIC CTA BANNER                                             */}
      {/* -------------------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-16 sm:py-24">
        <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/20 via-obsidian-900 to-obsidian p-8 sm:p-12 lg:p-16 text-center space-y-6 shadow-2xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gold text-obsidian font-black shadow-lg">
            <Trophy className="h-8 w-8" />
          </div>

          <div className="max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              EXPERIENCE THE ACTION
            </span>
            <h2 className="font-heading text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              Witness the Clash of Titans
            </h2>
            <p className="text-sm sm:text-base text-slate-300 font-body leading-relaxed">
              Follow every raid, ankle catch, super tackle, and championship moment live on the official tournament
              portal.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to="/live"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-heading font-black tracking-wide text-obsidian hover:bg-emerald-400 transition-all shadow-md active:scale-95"
            >
              <Radio className="h-4 w-4" /> Go to Live Scoreboard Arena
            </Link>
            <Link
              to="/teams"
              className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-6 py-3 text-sm font-heading font-black text-gold hover:bg-gold/20 transition-colors shadow-sm"
            >
              <Users className="h-4 w-4" /> Browse Qualified Teams
            </Link>
            <Link
              to="/schedule"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-heading font-bold text-white hover:border-white/25 transition-colors"
            >
              <CalendarDays className="h-4 w-4 text-slate-400" /> Tournament Schedule
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
