import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
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
  ClipboardList,
  HeartHandshake,
  ShieldCheck,
  IdCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { PermissionsContext } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { AuthSplash } from "@/components/admin/AuthSplash";
import { CallbackNotifier } from "@/components/admin/CallbackRequests";

export type ItemImportance = "critical" | "high" | "medium" | "normal";

export type ItemColor =
  | "amber"
  | "emerald"
  | "orange"
  | "cyan"
  | "teal"
  | "indigo"
  | "sky"
  | "purple"
  | "violet"
  | "rose"
  | "coral"
  | "pink"
  | "lime"
  | "fuchsia"
  | "slate";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  moduleKey?: string;
  importance?: ItemImportance;
  color?: ItemColor;
  badge?: "LIVE" | "CORE" | "ADMIN" | "STAFF" | "ASSIGNED" | "PASS";
}

export interface NavGroup {
  title: string;
  dotColor?: string;
  items: NavItem[];
}

export interface NavColorTheme {
  iconWrapper: string;
  iconActive: string;
  activeRow: string;
  activeIndicator: string;
  hoverRow: string;
}

export const NAV_COLOR_THEMES: Record<ItemColor, NavColorTheme> = {
  amber: {
    iconWrapper: "bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 group-hover:text-amber-300",
    iconActive: "bg-amber-500/25 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)]",
    activeRow: "bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent text-amber-100 border-l-2 border-amber-400",
    activeIndicator: "bg-amber-400 shadow-[0_0_8px_#f59e0b]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  emerald: {
    iconWrapper: "bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 group-hover:text-emerald-300",
    iconActive: "bg-emerald-500/25 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.35)]",
    activeRow: "bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent text-emerald-100 border-l-2 border-emerald-400",
    activeIndicator: "bg-emerald-400 shadow-[0_0_8px_#10b981]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  orange: {
    iconWrapper: "bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20 group-hover:text-orange-300",
    iconActive: "bg-orange-500/25 text-orange-300 shadow-[0_0_10px_rgba(249,115,22,0.35)]",
    activeRow: "bg-gradient-to-r from-orange-500/15 via-orange-500/5 to-transparent text-orange-100 border-l-2 border-orange-400",
    activeIndicator: "bg-orange-400 shadow-[0_0_8px_#f97316]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  cyan: {
    iconWrapper: "bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-300",
    iconActive: "bg-cyan-500/25 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.35)]",
    activeRow: "bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent text-cyan-100 border-l-2 border-cyan-400",
    activeIndicator: "bg-cyan-400 shadow-[0_0_8px_#06b6d4]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  teal: {
    iconWrapper: "bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20 group-hover:text-teal-300",
    iconActive: "bg-teal-500/25 text-teal-300 shadow-[0_0_10px_rgba(20,184,166,0.35)]",
    activeRow: "bg-gradient-to-r from-teal-500/15 via-teal-500/5 to-transparent text-teal-100 border-l-2 border-teal-400",
    activeIndicator: "bg-teal-400 shadow-[0_0_8px_#14b8a6]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  indigo: {
    iconWrapper: "bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-300",
    iconActive: "bg-indigo-500/25 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.35)]",
    activeRow: "bg-gradient-to-r from-indigo-500/15 via-indigo-500/5 to-transparent text-indigo-100 border-l-2 border-indigo-400",
    activeIndicator: "bg-indigo-400 shadow-[0_0_8px_#6366f1]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  sky: {
    iconWrapper: "bg-sky-500/10 text-sky-400 group-hover:bg-sky-500/20 group-hover:text-sky-300",
    iconActive: "bg-sky-500/25 text-sky-300 shadow-[0_0_10px_rgba(14,165,233,0.35)]",
    activeRow: "bg-gradient-to-r from-sky-500/15 via-sky-500/5 to-transparent text-sky-100 border-l-2 border-sky-400",
    activeIndicator: "bg-sky-400 shadow-[0_0_8px_#0ea5e9]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  purple: {
    iconWrapper: "bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 group-hover:text-purple-300",
    iconActive: "bg-purple-500/25 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.35)]",
    activeRow: "bg-gradient-to-r from-purple-500/15 via-purple-500/5 to-transparent text-purple-100 border-l-2 border-purple-400",
    activeIndicator: "bg-purple-400 shadow-[0_0_8px_#a855f7]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  violet: {
    iconWrapper: "bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 group-hover:text-violet-300",
    iconActive: "bg-violet-500/25 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.35)]",
    activeRow: "bg-gradient-to-r from-violet-500/15 via-violet-500/5 to-transparent text-violet-100 border-l-2 border-violet-400",
    activeIndicator: "bg-violet-400 shadow-[0_0_8px_#8b5cf6]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  rose: {
    iconWrapper: "bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 group-hover:text-rose-300",
    iconActive: "bg-rose-500/25 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.35)]",
    activeRow: "bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent text-rose-100 border-l-2 border-rose-400",
    activeIndicator: "bg-rose-400 shadow-[0_0_8px_#f43f5e]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  coral: {
    iconWrapper: "bg-red-500/10 text-red-400 group-hover:bg-red-500/20 group-hover:text-red-300",
    iconActive: "bg-red-500/25 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.35)]",
    activeRow: "bg-gradient-to-r from-red-500/15 via-red-500/5 to-transparent text-red-100 border-l-2 border-red-400",
    activeIndicator: "bg-red-400 shadow-[0_0_8px_#ef4444]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  pink: {
    iconWrapper: "bg-pink-500/10 text-pink-400 group-hover:bg-pink-500/20 group-hover:text-pink-300",
    iconActive: "bg-pink-500/25 text-pink-300 shadow-[0_0_10px_rgba(236,72,153,0.35)]",
    activeRow: "bg-gradient-to-r from-pink-500/15 via-pink-500/5 to-transparent text-pink-100 border-l-2 border-pink-400",
    activeIndicator: "bg-pink-400 shadow-[0_0_8px_#ec4899]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  lime: {
    iconWrapper: "bg-lime-500/10 text-lime-400 group-hover:bg-lime-500/20 group-hover:text-lime-300",
    iconActive: "bg-lime-500/25 text-lime-300 shadow-[0_0_10px_rgba(132,204,22,0.35)]",
    activeRow: "bg-gradient-to-r from-lime-500/15 via-lime-500/5 to-transparent text-lime-100 border-l-2 border-lime-400",
    activeIndicator: "bg-lime-400 shadow-[0_0_8px_#84cc16]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  fuchsia: {
    iconWrapper: "bg-fuchsia-500/10 text-fuchsia-400 group-hover:bg-fuchsia-500/20 group-hover:text-fuchsia-300",
    iconActive: "bg-fuchsia-500/25 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.35)]",
    activeRow: "bg-gradient-to-r from-fuchsia-500/15 via-fuchsia-500/5 to-transparent text-fuchsia-100 border-l-2 border-fuchsia-400",
    activeIndicator: "bg-fuchsia-400 shadow-[0_0_8px_#d946ef]",
    hoverRow: "hover:bg-white/[0.04]",
  },
  slate: {
    iconWrapper: "bg-slate-500/10 text-slate-300 group-hover:bg-slate-500/20 group-hover:text-white",
    iconActive: "bg-slate-500/25 text-slate-100 shadow-[0_0_10px_rgba(148,163,184,0.35)]",
    activeRow: "bg-gradient-to-r from-slate-500/15 via-slate-500/5 to-transparent text-slate-100 border-l-2 border-slate-300",
    activeIndicator: "bg-slate-300 shadow-[0_0_8px_#cbd5e1]",
    hoverRow: "hover:bg-white/[0.04]",
  },
};

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
  "/admin/tasks",
  "/admin/accounts",
]);

const MY_WORK_GROUP: NavGroup = {
  title: "My Assignment",
  dotColor: "bg-amber-400 shadow-[0_0_6px_#f59e0b]",
  items: [
    {
      to: "/admin/my-work",
      label: "My Work",
      icon: ClipboardList,
      end: true,
      color: "amber",
      importance: "critical",
      badge: "ASSIGNED",
    },
  ],
};

// A volunteer's own login gets zero organizer module access (see backend
// schemas.VOLUNTEER_BASE_PERMISSIONS) — this is the base sidebar for that
// account, replacing NAV_GROUPS altogether rather than just hiding a few
// paths the way STAFF_OPS_ONLY_PATHS does for self-service staff. The one
// exception is Matches & Fixtures (see VOLUNTEER_MATCHES_GROUP below), which
// a volunteer can still reach if it's individually assigned to a match.
const MY_ID_CARD_GROUP: NavGroup = {
  title: "My Profile",
  dotColor: "bg-purple-400 shadow-[0_0_6px_#a855f7]",
  items: [
    {
      to: "/admin/my-id-card",
      label: "My ID Card",
      icon: IdCard,
      end: true,
      color: "purple",
      importance: "high",
      badge: "PASS",
    },
  ],
};

// Mirrors the independent "assigned to a match" access path staff already
// get (see backend security.require_match_access, permissions.tsx
// useModuleAccess) — isItemVisible's own "/admin/matches" + assigned_match_ids
// check still gates whether this actually renders, same as it does for
// NAV_GROUPS' own Matches & Fixtures entry.
const VOLUNTEER_MATCHES_GROUP: NavGroup = {
  title: "Assigned Matches",
  dotColor: "bg-emerald-400 shadow-[0_0_6px_#10b981]",
  items: [
    {
      to: "/admin/matches",
      label: "Matches & Fixtures",
      icon: Radio,
      moduleKey: "matches",
      color: "emerald",
      importance: "critical",
      badge: "LIVE",
    },
  ],
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Command & Competition",
    dotColor: "bg-amber-400 shadow-[0_0_6px_#f59e0b]",
    items: [
      {
        to: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        end: true,
        color: "amber",
        importance: "critical",
        badge: "CORE",
      },
      {
        to: "/admin/matches",
        label: "Matches & Fixtures",
        icon: Radio,
        moduleKey: "matches",
        color: "emerald",
        importance: "critical",
        badge: "LIVE",
      },
      {
        to: "/admin/schedule",
        label: "Schedule",
        icon: CalendarDays,
        moduleKey: "schedule",
        color: "orange",
        importance: "high",
      },
      {
        to: "/admin/mat-ground",
        label: "Mat / Ground",
        icon: Activity,
        moduleKey: "matches",
        color: "cyan",
        importance: "high",
      },
      {
        to: "/admin/reports",
        label: "Reports & Export",
        icon: FileSpreadsheet,
        moduleKey: "reports",
        color: "teal",
        importance: "high",
      },
    ],
  },
  {
    title: "Teams & Athletes",
    dotColor: "bg-indigo-400 shadow-[0_0_6px_#6366f1]",
    items: [
      {
        to: "/admin/teams",
        label: "Teams",
        icon: Users,
        moduleKey: "teams",
        color: "indigo",
        importance: "high",
      },
      {
        to: "/admin/participants",
        label: "Participants",
        icon: UserSquare2,
        moduleKey: "teams",
        color: "sky",
        importance: "high",
      },
      {
        to: "/admin/blank-id-cards",
        label: "Blank ID Card Stock",
        icon: IdCard,
        moduleKey: "teams",
        color: "purple",
        importance: "medium",
      },
      {
        to: "/admin/id-card-back",
        label: "ID Card Back",
        icon: IdCard,
        moduleKey: "teams",
        color: "violet",
        importance: "normal",
      },
    ],
  },
  {
    title: "Workforce & Operations",
    dotColor: "bg-rose-400 shadow-[0_0_6px_#f43f5e]",
    items: [
      {
        to: "/admin/staff",
        label: "Staff Operations",
        icon: HardHat,
        moduleKey: "staff",
        color: "amber",
        importance: "high",
        badge: "STAFF",
      },
      {
        to: "/admin/duties",
        label: "Staff Duties",
        icon: ClipboardList,
        moduleKey: "staff",
        color: "rose",
        importance: "high",
      },
      {
        to: "/admin/tasks",
        label: "Tasks",
        icon: CheckSquare,
        moduleKey: "staff",
        color: "coral",
        importance: "high",
      },
      {
        to: "/admin/volunteers",
        label: "Volunteers",
        icon: HeartHandshake,
        moduleKey: "volunteers",
        color: "pink",
        importance: "medium",
      },
      {
        to: "/admin/officials",
        label: "Officials",
        icon: ShieldCheck,
        moduleKey: "officials",
        color: "teal",
        importance: "high",
      },
    ],
  },
  {
    title: "Logistics & Facilities",
    dotColor: "bg-cyan-400 shadow-[0_0_6px_#06b6d4]",
    items: [
      {
        to: "/admin/accommodation",
        label: "Accommodation",
        icon: BedDouble,
        moduleKey: "accommodation",
        color: "violet",
        importance: "medium",
      },
      {
        to: "/admin/room-map",
        label: "Room Map",
        icon: LayoutGrid,
        moduleKey: "accommodation",
        color: "sky",
        importance: "medium",
      },
      {
        to: "/admin/buildings",
        label: "Buildings & Rooms",
        icon: Building2,
        moduleKey: "buildings",
        color: "indigo",
        importance: "normal",
      },
      {
        to: "/admin/venues",
        label: "Venues",
        icon: MapPin,
        moduleKey: "venues",
        color: "amber",
        importance: "medium",
      },
      {
        to: "/admin/transport",
        label: "Transport",
        icon: Bus,
        moduleKey: "transport",
        color: "orange",
        importance: "medium",
      },
      {
        to: "/admin/food",
        label: "Food Planning",
        icon: UtensilsCrossed,
        color: "lime",
        importance: "normal",
      },
      {
        to: "/admin/procurement",
        label: "Procurement",
        icon: ShoppingCart,
        moduleKey: "procurement",
        color: "emerald",
        importance: "normal",
      },
    ],
  },
  {
    title: "Media & Knowledge",
    dotColor: "bg-fuchsia-400 shadow-[0_0_6px_#d946ef]",
    items: [
      {
        to: "/admin/announcements",
        label: "Announcements",
        icon: Megaphone,
        moduleKey: "announcements",
        color: "fuchsia",
        importance: "medium",
      },
      {
        to: "/admin/gallery",
        label: "Photo Gallery",
        icon: Images,
        moduleKey: "gallery",
        color: "cyan",
        importance: "normal",
      },
      {
        to: "/admin/knowledge",
        label: "Knowledge Base",
        icon: BookOpen,
        moduleKey: "knowledge",
        color: "indigo",
        importance: "normal",
      },
      {
        to: "/admin/documents",
        label: "Documents",
        icon: FileText,
        color: "slate",
        importance: "normal",
      },
      {
        to: "/admin/contacts",
        label: "Contacts",
        icon: ContactIcon,
        color: "emerald",
        importance: "normal",
      },
      {
        to: "/admin/faq",
        label: "FAQ",
        icon: HelpCircle,
        moduleKey: "faq",
        color: "amber",
        importance: "normal",
      },
    ],
  },
  {
    title: "System & Administration",
    dotColor: "bg-red-400 shadow-[0_0_6px_#ef4444]",
    items: [
      {
        to: "/admin/accounts",
        label: "Accounts & Access",
        icon: UserCog,
        moduleKey: "accounts",
        color: "coral",
        importance: "critical",
        badge: "ADMIN",
      },
      {
        to: "/admin/settings",
        label: "Settings",
        icon: Settings,
        color: "slate",
        importance: "normal",
      },
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
  const auth = useAuth();
  const me = auth.me;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    auth.ensure();
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
    try {
      await auth.logout();
      navigate("/admin/login", { replace: true });
    } catch {
      toast.error("Could not reach the server to log out. Try again when you are online.");
    }
  };

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

  if (auth.status === "idle" || auth.status === "loading") {
    return <AuthSplash unreachable={auth.unreachable} onRetry={auth.retry} />;
  }
  if (auth.status === "unauthenticated") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
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
    if (moduleKey === "accounts") return !!me?.is_admin;
    if (me?.is_admin) return true;
    // The organizer-wide Tasks board is admin / Staff Operations ("staff":"edit")
    // only — everyone else gets their own tasks on My Work (security.require_task_board).
    if (to === "/admin/tasks") return me?.permissions?.staff === "edit";
    if (!!me?.permissions?.[moduleKey]) return true;
    // Reports & Export used to ride on "matches" — keep it for those accounts.
    if (to === "/admin/reports" && !!me?.permissions?.matches) return true;
    // Upload-only gallery accounts still open the gallery page to upload.
    if (to === "/admin/gallery" && me?.permissions?.gallery_upload === "edit") return true;
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
            <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-gold/40 bg-white/[0.06] p-1 shadow-[0_0_15px_-3px_rgba(245,158,11,0.25)] transition-transform group-hover:scale-105 shrink-0 overflow-hidden">
              <img
                src="/icon-192.png"
                alt="Tournament Emblem"
                className="h-full w-full object-contain drop-shadow"
              />
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
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4" aria-label="Operations Navigation">
          {(me?.is_self_service_volunteer
            ? [MY_ID_CARD_GROUP, VOLUNTEER_MATCHES_GROUP]
            : me?.is_self_service_staff || (me?.staff_member && !me?.is_admin)
              ? [MY_WORK_GROUP, ...NAV_GROUPS]
              : NAV_GROUPS
          ).map((group) => {
            const visibleItems = group.items.filter((item) => isItemVisible(item.moduleKey, item.to));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <div className="flex items-center gap-1.5 px-2.5 py-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", group.dotColor || "bg-slate-600")} />
                  <p className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-slate-400">
                    {group.title}
                  </p>
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map((n) => {
                    const theme = NAV_COLOR_THEMES[n.color || "amber"];
                    return (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        end={n.end}
                        onClick={() => setMobileNavOpen(false)}
                        data-testid={`admin-nav-${n.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                        className={({ isActive }) =>
                          cn(
                            "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-heading tracking-wide transition-all duration-150",
                            isActive
                              ? cn("font-bold shadow-xs", theme.activeRow)
                              : cn(
                                  "border border-transparent font-medium",
                                  n.importance === "critical"
                                    ? "text-slate-100 hover:text-white"
                                    : n.importance === "high"
                                      ? "text-slate-300 hover:text-white"
                                      : "text-slate-400 hover:text-slate-200",
                                  theme.hoverRow,
                                ),
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                "grid h-6 w-6 place-items-center rounded-md border border-white/5 transition-all duration-150 shrink-0",
                                isActive ? theme.iconActive : theme.iconWrapper,
                              )}
                            >
                              <n.icon className="h-3.5 w-3.5" />
                            </span>

                            <span className="truncate flex-1">{n.label}</span>

                            {/* BADGES / IMPORTANCE HIGHLIGHTS */}
                            {n.badge === "LIVE" && (
                              <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-mono font-bold text-emerald-400 shrink-0">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                </span>
                                LIVE
                              </span>
                            )}

                            {n.badge === "CORE" && (
                              <span className="ml-auto inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-heading font-extrabold tracking-wider text-amber-400 shrink-0">
                                CORE
                              </span>
                            )}

                            {n.badge === "ADMIN" && (
                              <span className="ml-auto inline-flex items-center rounded bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[9px] font-heading font-extrabold tracking-wider text-red-400 shrink-0">
                                ADMIN
                              </span>
                            )}

                            {n.badge === "STAFF" && (
                              <span className="ml-auto inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-heading font-extrabold tracking-wider text-amber-300 shrink-0">
                                OPS
                              </span>
                            )}

                            {n.badge === "ASSIGNED" && (
                              <span className="ml-auto inline-flex items-center rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-heading font-extrabold tracking-wider text-emerald-300 shrink-0">
                                DUTY
                              </span>
                            )}

                            {n.badge === "PASS" && (
                              <span className="ml-auto inline-flex items-center rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[9px] font-heading font-extrabold tracking-wider text-purple-300 shrink-0">
                                CARD
                              </span>
                            )}

                            {/* Active dot when no specific badge */}
                            {isActive && !n.badge && (
                              <span
                                className={cn(
                                  "ml-auto h-1.5 w-1.5 rounded-full shrink-0",
                                  theme.activeIndicator,
                                )}
                              />
                            )}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
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
        <main className="flex-1 p-4 sm:p-6 lg:p-4 xl:p-6 min-w-0 w-full max-w-full overflow-x-hidden">
          <PermissionsContext.Provider value={me}>
            <Outlet />
            {/* Pops an alert on any page when a new "Call me back" request arrives */}
            <CallbackNotifier />
          </PermissionsContext.Provider>
        </main>
      </div>
    </div>
  );
}
