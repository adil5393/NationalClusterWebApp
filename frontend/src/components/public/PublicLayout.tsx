import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Menu,
  X,
  ArrowUpRight,
  Trophy,
  Radio,
  Users,
  Calendar,
  MapPin,
  HelpCircle,
  Megaphone,
  ChevronRight,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import schoolLogo from "@/assets/logo/Document_from_Adil_Shahid-removebg-preview.png";
import { SiteBackgroundSlideshow } from "@/components/public/SiteBackgroundSlideshow";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/teams", label: "Teams" },
  { to: "/schedule", label: "Schedule" },
  { to: "/live", label: "Live", isLive: true },
  { to: "/venues", label: "Venues" },
  { to: "/accommodation", label: "Accommodation" },
  { to: "/food", label: "Food" },
  { to: "/transport", label: "Transport" },
  { to: "/campus", label: "Campus" },
  { to: "/announcements", label: "Announcements" },
  { to: "/contacts", label: "Contacts" },
  { to: "/faq", label: "FAQ" },
];

export function PublicLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen text-slate-100 flex flex-col selection:bg-gold selection:text-obsidian bg-obsidian-950">
      {/* TOP BROADCAST TICKER STRIP */}
        <div className="border-b border-white/10 bg-obsidian-950/80 backdrop-blur-md px-4 py-1.5 text-xs text-slate-400">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex items-center gap-1.5 rounded bg-gold/15 px-2 py-0.5 text-[10px] font-heading font-black tracking-widest text-gold shrink-0">
              <Trophy className="h-3 w-3" /> OFFICIAL TOURNAMENT PORTAL
            </span>
            <span className="truncate text-[11px] text-slate-400">
              CBSE National Kabaddi Championship 2026–27 · Host: New Angels Sr. Sec. School, Pratapgarh
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[11px] font-medium shrink-0">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-live-dot" />
              Live Match System Active
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">October 2026</span>
          </div>
        </div>
      </div>

      {/* STICKY MAIN HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-obsidian-950/90 backdrop-blur-xl transition-colors">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* BRAND LOGO */}
            <Link
              to="/"
              className="flex items-center gap-3 shrink-0 group"
              data-testid="brand-logo"
            >
              <div className="relative grid h-10 w-10 place-items-center rounded-lg border border-gold/40 bg-white/[0.06] p-1 shadow-[0_0_15px_-3px_rgba(245,158,11,0.25)] transition-transform group-hover:scale-105">
                <img
                  src={schoolLogo}
                  alt="New Angels Senior Secondary School Emblem"
                  className="h-full w-full object-contain drop-shadow"
                />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="font-heading text-sm sm:text-base font-black tracking-tight text-white group-hover:text-gold transition-colors">
                    NATIONAL KABADDI
                  </span>
                  <span className="rounded bg-gold/15 px-1.5 py-0.2 text-[9px] font-black tracking-wider text-gold">
                    CBSE
                  </span>
                </div>
                <span className="block text-[11px] font-heading font-extrabold tracking-widest text-slate-400">
                  NEW ANGELS SR. SEC. SCHOOL
                </span>
              </div>
            </Link>

            {/* DESKTOP NAVIGATION */}
            <nav className="hidden xl:flex items-center gap-0.5" aria-label="Main Navigation">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  data-testid={`nav-${n.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    cn(
                      "relative rounded-md px-2.5 py-1.5 text-[13px] font-heading font-bold tracking-wide transition-colors",
                      isActive
                        ? "bg-white/10 text-gold shadow-sm"
                        : "text-slate-300 hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  {n.isLive && (
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-live-dot" />
                  )}
                  {n.label}
                  {n.isLive && (
                    <span className="ml-1 rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-black text-emerald-300">
                      LIVE
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* ACTIONS */}
            <div className="flex items-center gap-2.5">
              <Link
                to="/admin"
                data-testid="organizer-portal-link"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-coral/40 bg-coral px-3.5 py-2 text-xs font-heading font-extrabold tracking-wide text-white transition-all hover:bg-coral-600 hover:shadow-lg shadow-sm active:scale-95"
              >
                Organizer Portal <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                className="xl:hidden grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors"
                onClick={() => setOpen((v) => !v)}
                data-testid="mobile-menu-toggle"
                aria-label="Toggle menu"
              >
                {open ? <X className="h-5 w-5 text-gold" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* MOBILE RESPONSIVE DRAWER */}
          {open && (
            <div className="xl:hidden border-t border-white/10 py-4" data-testid="mobile-nav">
              <div className="mb-3 flex items-center justify-between px-2">
                <span className="text-[11px] font-heading font-extrabold uppercase tracking-widest text-slate-400">
                  Event Navigation
                </span>
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 rounded bg-coral/20 px-2 py-1 text-xs font-bold text-coral hover:bg-coral/30"
                >
                  Organizer Login →
                </Link>
              </div>
              <nav className="grid grid-cols-2 gap-1.5">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/"}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-heading font-bold transition-colors",
                        isActive
                          ? "border-gold/40 bg-gold/15 text-gold shadow-sm"
                          : "border-white/5 bg-white/[0.03] text-slate-300 hover:border-white/15 hover:bg-white/[0.08] hover:text-white",
                      )
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      {n.isLive && (
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-live-dot" />
                      )}
                      {n.label}
                    </span>
                    {n.isLive && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black text-emerald-300">
                        LIVE
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* MAIN BODY OUTLET (CENTERED CONTENT CONTAINER WITH VIEWPORT-SIZED STICKY BACKGROUND) */}
      <main className="flex-1 w-full bg-obsidian-950">
        <div className="relative mx-auto max-w-7xl min-h-full border-x border-white/5 shadow-2xl">
          {/* STICKY VIEWPORT-ALIGNED CANVAS BACKGROUND */}
          <div className="sticky top-0 h-screen w-full pointer-events-none -mb-[100vh] overflow-hidden z-0">
            <SiteBackgroundSlideshow />
          </div>

          {/* PAGE CONTENT */}
          <div className="relative z-10 min-h-full">
            <Outlet />
          </div>
        </div>
      </main>

      {/* CHAMPIONSHIP FOOTER */}
      <footer className="border-t border-white/10 bg-obsidian-950 text-slate-300 relative overflow-hidden">
        <div className="absolute inset-0 bg-kabaddi-court-subtle pointer-events-none opacity-40" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-12 md:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* COLUMN 1: TOURNAMENT & HOST IDENTITY */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-gold/30 bg-white/[0.05] p-1 shrink-0">
                  <img
                    src={schoolLogo}
                    alt="New Angels Sr. Sec. School"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <span className="block font-heading text-sm font-black tracking-tight text-white">
                    NEW ANGELS SR. SEC. SCHOOL
                  </span>
                  <span className="block text-[10px] font-heading font-bold tracking-widest text-gold">
                    HOST · PRATAPGARH, UP
                  </span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                Official digital event operations and broadcast scoring platform for the National Cluster Kabaddi Tournament.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                  <Shield className="h-3 w-3 text-gold" /> CBSE Affiliated 2130850/06
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                  <Trophy className="h-3 w-3 text-coral" /> National Host
                </span>
              </div>
            </div>

            {/* COLUMN 2: TOURNAMENT ACTION */}
            <div>
              <p className="mb-3 font-heading text-xs font-extrabold uppercase tracking-widest text-gold">
                Competition
              </p>
              <ul className="space-y-2 text-xs text-slate-300 font-body">
                <li>
                  <Link to="/live" className="flex items-center gap-1.5 hover:text-gold transition-colors">
                    <Radio className="h-3.5 w-3.5 text-emerald-400" /> Live Match Arena & Scores
                  </Link>
                </li>
                <li>
                  <Link to="/teams" className="flex items-center gap-1.5 hover:text-gold transition-colors">
                    <Users className="h-3.5 w-3.5 text-slate-400" /> Participating Teams & Rosters
                  </Link>
                </li>
                <li>
                  <Link to="/schedule" className="flex items-center gap-1.5 hover:text-gold transition-colors">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" /> Tournament Schedule & Fixtures
                  </Link>
                </li>
                <li>
                  <Link to="/announcements" className="flex items-center gap-1.5 hover:text-gold transition-colors">
                    <Megaphone className="h-3.5 w-3.5 text-slate-400" /> Official Announcements
                  </Link>
                </li>
              </ul>
            </div>

            {/* COLUMN 3: ATHLETE & VISITOR SERVICES */}
            <div>
              <p className="mb-3 font-heading text-xs font-extrabold uppercase tracking-widest text-gold">
                Logistics & Venue
              </p>
              <ul className="space-y-2 text-xs text-slate-300 font-body">
                <li>
                  <Link to="/campus" className="flex items-center gap-1.5 hover:text-gold transition-colors">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" /> Campus Map & Court Locations
                  </Link>
                </li>
                <li>
                  <Link to="/accommodation" className="hover:text-gold transition-colors">
                    Hostel & Accommodation Blocks
                  </Link>
                </li>
                <li>
                  <Link to="/food" className="hover:text-gold transition-colors">
                    Food Courts & Dining Timings
                  </Link>
                </li>
                <li>
                  <Link to="/transport" className="hover:text-gold transition-colors">
                    Transit & Bus Routes
                  </Link>
                </li>
                <li>
                  <Link to="/faq" className="flex items-center gap-1.5 hover:text-gold transition-colors">
                    <HelpCircle className="h-3.5 w-3.5 text-slate-400" /> Frequently Asked Questions
                  </Link>
                </li>
              </ul>
            </div>

            {/* COLUMN 4: OPERATIONS & HELP */}
            <div>
              <p className="mb-3 font-heading text-xs font-extrabold uppercase tracking-widest text-gold">
                Tournament Command
              </p>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3.5 space-y-2.5">
                <p className="text-xs text-slate-400">
                  Authorized officials, referees, and scorekeepers can access live fixture management and room allocations.
                </p>
                <Link
                  to="/admin"
                  className="inline-flex w-full items-center justify-between rounded-md bg-coral/90 px-3 py-2 text-xs font-heading font-extrabold text-white hover:bg-coral transition-colors"
                >
                  <span>Operations Dashboard</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-6 text-[11px] text-slate-500">
            <p>
              © 2026–27 CBSE National Kabaddi Championship · All rights reserved.
            </p>
            <p className="flex items-center gap-2">
              <span>Host Institution: Event Operations Center</span>
              <span>·</span>
              <Link to="/contacts" className="text-slate-400 hover:text-gold">
                Emergency & Helpdesk
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
