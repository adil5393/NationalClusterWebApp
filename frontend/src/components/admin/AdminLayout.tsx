import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import {
  LayoutDashboard,
  Users,
  UserSquare2,
  BedDouble,
  Building2,
  UtensilsCrossed,
  Bus,
  MapPin,
  CalendarDays,
  Megaphone,
  ShoppingCart,
  CheckSquare,
  BookOpen,
  FileText,
  Contact as ContactIcon,
  Settings,
  Search,
  ExternalLink,
  LayoutGrid,
  HardHat,
  Images,
  LogOut,
  UserCog,
  Radio,
  HelpCircle,
  Menu,
  X,
  FileSpreadsheet,
  Trophy,
  Shield,
  Activity,
  Mic,
  MapPinned,
  ClipboardList,
  HeartHandshake,
  IdCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/feedback";
import { Me, PermissionsContext } from "@/lib/permissions";
import { WalkieProvider } from "@/lib/walkie/WalkieProvider";

interface NavGroup {
  title: string;
  items: {
    to: string;
    label: string;
    icon: React.ElementType;
    end?: boolean;
    moduleKey?: string;
  }[];
}

// Paths that only make sense for someone running Staff Operations for
// everyone (an admin, or an account with real "staff":"edit" access) — a
// self-service staff account (an ordinary staff member's own login) never
// sees these, regardless of what its auto-granted module permissions say.
// See security.is_self_service_staff on the backend, which is the actual
// enforcement boundary; this is only what decides what to render.
const STAFF_OPS_ONLY_PATHS = new Set([
  "/admin",
  "/admin/staff",
  "/admin/duties",
  "/admin/staff-map",
  "/admin/tasks",
  "/admin/accounts",
]);

const MY_WORK_GROUP: NavGroup = {
  title: "My Work",
  items: [{ to: "/admin/my-work", label: "My Work", icon: ClipboardList, end: true }],
};

// A volunteer's own login gets zero organizer module access (see backend
// schemas.VOLUNTEER_BASE_PERMISSIONS) — this is the base sidebar for that
// account, replacing NAV_GROUPS altogether rather than just hiding a few
// paths the way STAFF_OPS_ONLY_PATHS does for self-service staff. The one
// exception is Matches & Fixtures (see VOLUNTEER_MATCHES_GROUP below), which
// a volunteer can still reach if it's individually assigned to a match.
const MY_ID_CARD_GROUP: NavGroup = {
  title: "My Profile",
  items: [{ to: "/admin/my-id-card", label: "My ID Card", icon: IdCard, end: true }],
};

// Mirrors the independent "assigned to a match" access path staff already
// get (see backend security.require_match_access, permissions.tsx
// useModuleAccess) — isItemVisible's own "/admin/matches" + assigned_match_ids
// check still gates whether this actually renders, same as it does for
// NAV_GROUPS' own Matches & Fixtures entry.
const VOLUNTEER_MATCHES_GROUP: NavGroup = {
  title: "Assigned Matches",
  items: [{ to: "/admin/matches", label: "Matches & Fixtures", icon: Radio, moduleKey: "matches" }],
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "People",
    items: [
      { to: "/admin/staff", label: "Staff Operations", icon: HardHat, moduleKey: "staff" },
      { to: "/admin/volunteers", label: "Volunteers", icon: HeartHandshake, moduleKey: "volunteers" },
      { to: "/admin/duties", label: "Staff Duties", icon: ClipboardList, moduleKey: "staff" },
      { to: "/admin/accounts", label: "Accounts & Access", icon: UserCog, moduleKey: "accounts" },
      { to: "/admin/staff-map", label: "Staff Live Map", icon: MapPinned, moduleKey: "staff_map" },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/admin/tasks", label: "Tasks", icon: CheckSquare },
      { to: "/admin/transport", label: "Transport", icon: Bus, moduleKey: "transport" },
      { to: "/admin/procurement", label: "Procurement", icon: ShoppingCart, moduleKey: "procurement" },
      { to: "/admin/walkie", label: "Walkie Talkie", icon: Mic },
    ],
  },
  {
    title: "Competition & Fixtures",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/admin/matches", label: "Matches & Fixtures", icon: Radio, moduleKey: "matches" },
      { to: "/admin/mat-ground", label: "Mat / Ground", icon: Activity, moduleKey: "matches" },
      { to: "/admin/schedule", label: "Schedule", icon: CalendarDays, moduleKey: "schedule" },
      { to: "/admin/reports", label: "Reports & Export", icon: FileSpreadsheet, moduleKey: "matches" },
    ],
  },
  {
    title: "Logistics & Venue",
    items: [
      { to: "/admin/teams", label: "Teams", icon: Users, moduleKey: "teams" },
      { to: "/admin/participants", label: "Participants", icon: UserSquare2, moduleKey: "teams" },
      { to: "/admin/blank-id-cards", label: "Blank ID Card Stock", icon: IdCard, moduleKey: "teams" },
      { to: "/admin/venues", label: "Venues", icon: MapPin, moduleKey: "venues" },
      { to: "/admin/accommodation", label: "Accommodation", icon: BedDouble, moduleKey: "accommodation" },
      { to: "/admin/room-map", label: "Room Map", icon: LayoutGrid, moduleKey: "accommodation" },
      { to: "/admin/buildings", label: "Buildings & Rooms", icon: Building2, moduleKey: "buildings" },
      { to: "/admin/food", label: "Food Planning", icon: UtensilsCrossed },
    ],
  },
  {
    title: "Event Info & Knowledge",
    items: [
      { to: "/admin/announcements", label: "Announcements", icon: Megaphone, moduleKey: "announcements" },
      { to: "/admin/faq", label: "FAQ", icon: HelpCircle, moduleKey: "faq" },
      { to: "/admin/gallery", label: "Photo Gallery", icon: Images, moduleKey: "gallery" },
      { to: "/admin/knowledge", label: "Knowledge Base", icon: BookOpen, moduleKey: "knowledge" },
      { to: "/admin/documents", label: "Documents", icon: FileText },
      { to: "/admin/contacts", label: "Contacts", icon: ContactIcon },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

interface Result {
  type: string;
  id: number;
  label: string;
  meta?: string;
}

const ROUTE: Record<string, string> = {
  team: "/admin/teams",
  room: "/admin/buildings",
  knowledge: "/admin/knowledge",
  procurement: "/admin/procurement",
  announcement: "/admin/announcements",
};

export function AdminLayout() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [openSearch, setOpenSearch] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .get<Me>("/auth/me")
      .then((r) => {
        if (r.data.authenticated) {
          setAuthed(true);
          setMe(r.data);
        } else {
          navigate("/admin/login");
        }
      })
      .catch(() => navigate("/admin/login"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A self-service staff account has no organizer Dashboard to land on
  // (STAFF_OPS_ONLY_PATHS hides it from the sidebar) — send them straight to
  // their own work instead of the generic organizer overview.
  useEffect(() => {
    if (me?.is_self_service_staff && location.pathname === "/admin") {
      navigate("/admin/my-work", { replace: true });
    }
  }, [me, location.pathname, navigate]);

  // A self-service volunteer account has no organizer module access at all
  // (see backend schemas.VOLUNTEER_BASE_PERMISSIONS), so it has no legitimate
  // page to land on besides its own ID card — EXCEPT Matches & Fixtures,
  // which a volunteer can still reach independent of module permissions if
  // it's been assigned to referee/manage a match (assigned_match_ids; see
  // backend security.require_match_access). That's the same independent
  // access path an assigned staff account already gets, so this must not
  // block it.
  useEffect(() => {
    if (!me?.is_self_service_volunteer) return;
    const canViewMatches = (me.assigned_match_ids?.length ?? 0) > 0;
    const allowed =
      location.pathname === "/admin/my-id-card" || (canViewMatches && location.pathname === "/admin/matches");
    if (!allowed) {
      navigate("/admin/my-id-card", { replace: true });
    }
  }, [me, location.pathname, navigate]);

  const logout = async () => {
    await api.post("/auth/logout");
    navigate("/admin/login");
  };

  // Staff Live Map: foreground-only location reporting for this account.
  // Runs for the whole time an authenticated session stays in the admin
  // area (this layout wraps every /admin/* route and is never remounted by
  // internal navigation), not just while on the map page itself — pings
  // once now, then every ~4 minutes, and again whenever the app/tab returns
  // to the foreground. @capacitor/geolocation has a web fallback backed by
  // navigator.geolocation, so this same code runs unchanged in the
  // Capacitor Android app and in a plain browser/PWA. No watchPosition, no
  // background tracking, and a confirmed permission denial stops further
  // attempts for the rest of this session rather than re-prompting.
  useEffect(() => {
    if (!me?.authenticated) return;
    let stopped = false;
    let cancelled = false;

    const reportLocation = async () => {
      if (stopped || cancelled) return;
      try {
        const status = await Geolocation.checkPermissions();
        if (status.location === "denied" && status.coarseLocation === "denied") {
          stopped = true;
          return;
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000,
        });
        if (cancelled) return;
        await api.post("/staff-locations/me", {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
      } catch {
        // GPS timeout, location services off, a network hiccup on the POST,
        // or a web browser without geolocation support — never let any of
        // this block or interrupt the app, just skip this round and retry
        // on the next tick or the next foreground event.
      }
    };

    reportLocation();
    const intervalId = setInterval(reportLocation, 4 * 60 * 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") reportLocation();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [me?.authenticated]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      api.get("/search", { params: { q } }).then((r) => {
        setResults(r.data.results);
        setOpenSearch(true);
      });
    }, 250);
  }, [q]);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian text-slate-200">
        <Spinner label="Verifying tournament operations session…" />
      </div>
    );
  }

  const isItemVisible = (moduleKey?: string, to?: string) => {
    // Drastically reduced nav for a self-service staff account: never the
    // organizer-wide Staff Operations surface, no matter what its
    // auto-granted module permissions look like (see STAFF_OPS_ONLY_PATHS).
    if (me?.is_self_service_staff && to && STAFF_OPS_ONLY_PATHS.has(to)) return false;
    if (!moduleKey) return true;
    // Both of these are deliberately not real gate-able modules (see
    // schemas.ORGANIZER_MODULES) — admin-only, full stop, not something a
    // "view"/"edit" permission grant can ever unlock for a staff login.
    if (moduleKey === "accounts" || moduleKey === "staff_map") return !!me?.is_admin;
    if (me?.is_admin) return true;
    if (!!me?.permissions?.[moduleKey]) return true;
    // An account with zero "matches" module access can still be assigned to
    // specific matches (see permissions.tsx useModuleAccess) — that only
    // unlocks the Matches & Fixtures page itself, not Mat/Ground or Reports,
    // which share the same moduleKey for permission-editing purposes but
    // aren't part of the match-assignment access path.
    if (to === "/admin/matches" && (me?.assigned_match_ids?.length ?? 0) > 0) return true;
    return false;
  };

  return (
    <div className="flex min-h-screen bg-obsidian text-slate-100 selection:bg-gold selection:text-obsidian">
      {/* MOBILE BACKDROP */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          data-testid="admin-mobile-nav-backdrop"
        />
      )}

      {/* COMMAND CENTER SIDEBAR */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-obsidian-950 text-slate-300 transition-transform duration-200 lg:translate-x-0",
          mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        {/* BRAND HEADER */}
        <div className="flex h-16 items-center justify-between gap-2.5 border-b border-white/10 px-4 bg-obsidian-950">
          <Link
            to="/admin"
            className="flex items-center gap-2.5 group"
            data-testid="admin-brand"
            onClick={() => setMobileNavOpen(false)}
          >
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-gold/40 bg-gold/15 text-gold font-heading font-black text-xs shadow-sm group-hover:scale-105 transition-transform">
              <Trophy className="h-4 w-4 text-gold" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-heading text-sm font-black tracking-tight text-white">
                  TOURNAMENT OPS
                </span>
              </div>
              <span className="block text-[10px] font-heading font-bold tracking-widest text-gold">
                NATIONALS 2026–27
              </span>
            </div>
          </Link>
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            data-testid="admin-mobile-nav-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* NAVIGATION GROUPS */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5" aria-label="Operations Navigation">
          {(me?.is_self_service_volunteer
            ? [MY_ID_CARD_GROUP, VOLUNTEER_MATCHES_GROUP]
            : me?.is_self_service_staff
              ? [MY_WORK_GROUP, ...NAV_GROUPS]
              : NAV_GROUPS
          ).map((group) => {
            const visibleItems = group.items.filter((item) => isItemVisible(item.moduleKey, item.to));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <p className="px-3 text-[10px] font-heading font-extrabold uppercase tracking-widest text-slate-500">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      onClick={() => setMobileNavOpen(false)}
                      data-testid={`admin-nav-${n.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-heading font-bold tracking-wide transition-colors",
                          isActive
                            ? "bg-gold/15 text-gold border border-gold/30 shadow-sm"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent",
                        )
                      }
                    >
                      <n.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{n.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* SIDEBAR FOOTER & USER PROFILE */}
        <div className="border-t border-white/10 bg-obsidian-950 p-3 space-y-2">
          {me && (
            <div
              className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5"
              data-testid="admin-current-user"
            >
              <div className="grid h-8 w-8 place-items-center rounded-md bg-white/10 font-heading font-bold text-xs text-white">
                {(me.username || me.full_name || "OP").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-bold text-white">
                  {me.full_name || me.username}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="truncate text-[10px] text-slate-400">@{me.username}</span>
                  {me.is_admin ? (
                    <span className="rounded bg-gold/20 px-1 py-0.2 text-[9px] font-black text-gold">
                      ADMIN
                    </span>
                  ) : (
                    <span className="rounded bg-white/10 px-1 py-0.2 text-[9px] font-medium text-slate-400">
                      {me.is_self_service_staff ? "STAFF" : "OFFICER"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-1 pt-1 text-xs font-semibold text-slate-400">
            {!Capacitor.isNativePlatform() && (
              <Link
                to="/"
                className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-slate-400 hover:bg-white/5 hover:text-gold transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Public Site
              </Link>
            )}
            <button
              onClick={logout}
              data-testid="admin-logout-btn"
              className="ml-auto flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <LogOut className="h-3 w-3" /> Log Out
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN OPERATIONS WORKSPACE */}
      <div className="min-w-0 flex-1 lg:pl-64 flex flex-col">
        {/* TOP COMMAND HEADER */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-white/10 bg-obsidian-950/90 backdrop-blur-xl px-4 sm:px-6 md:px-8">
          <div className="flex items-center gap-3 w-full max-w-lg">
            <button
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open operations menu"
              data-testid="admin-mobile-nav-toggle"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* GLOBAL SEARCH */}
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => q && setOpenSearch(true)}
                onBlur={() => setTimeout(() => setOpenSearch(false), 150)}
                placeholder="Search teams, rooms, decisions, procurement…"
                data-testid="global-search-input"
                className="h-10 w-full rounded-md border border-white/10 bg-obsidian-900 pl-9 pr-3 text-xs sm:text-sm font-body text-white placeholder:text-slate-500 focus:border-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-gold"
              />
              {openSearch && results.length > 0 && (
                <div
                  className="absolute mt-1.5 w-full overflow-hidden rounded-lg border border-white/15 bg-obsidian-900 shadow-2xl z-40 divide-y divide-white/5"
                  data-testid="global-search-results"
                >
                  {results.map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      onMouseDown={() => {
                        navigate(ROUTE[r.type] ?? "/admin");
                        setQ("");
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs sm:text-sm hover:bg-white/5 text-slate-200 transition-colors"
                    >
                      <span className="font-heading font-bold text-white truncate mr-2">
                        {r.label}
                      </span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-400 shrink-0">
                        {r.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* STATUS PILLS */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-live-dot" />
              <span>LIVE OPS</span>
            </div>
            <span className="rounded-md border border-coral/30 bg-coral/10 px-2.5 py-1 text-xs font-bold text-coral">
              DEV / SAMPLE
            </span>
          </div>
        </header>

        {/* OPERATIONS CONTENT OUTLET */}
        <main className="flex-1 p-4 sm:p-6 lg:p-4 xl:p-6">
          <PermissionsContext.Provider value={me}>
            {/* Mounted here (not inside the WalkieTalkie page) so the
                connection survives navigating to any other /admin/* route —
                see WalkieProvider.tsx for why. */}
            <WalkieProvider authenticated={!!me?.authenticated}>
              <Outlet />
            </WalkieProvider>
          </PermissionsContext.Provider>
        </main>
      </div>
    </div>
  );
}
