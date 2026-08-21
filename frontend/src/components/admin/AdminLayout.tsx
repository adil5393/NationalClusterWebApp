import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, UserSquare2, BedDouble, Building2, UtensilsCrossed, Bus,
  MapPin, CalendarDays, Megaphone, ShoppingCart, CheckSquare, BookOpen, FileText,
  Contact as ContactIcon, Settings, Search, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/teams", label: "Teams", icon: Users },
  { to: "/admin/participants", label: "Participants", icon: UserSquare2 },
  { to: "/admin/accommodation", label: "Accommodation", icon: BedDouble },
  { to: "/admin/buildings", label: "Buildings & Rooms", icon: Building2 },
  { to: "/admin/food", label: "Food", icon: UtensilsCrossed },
  { to: "/admin/transport", label: "Transport", icon: Bus },
  { to: "/admin/venues", label: "Venues", icon: MapPin },
  { to: "/admin/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/procurement", label: "Procurement", icon: ShoppingCart },
  { to: "/admin/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/admin/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/admin/documents", label: "Documents", icon: FileText },
  { to: "/admin/contacts", label: "Contacts", icon: ContactIcon },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

interface Result { type: string; id: number; label: string; meta?: string }
const ROUTE: Record<string, string> = {
  team: "/admin/teams", room: "/admin/buildings", knowledge: "/admin/knowledge",
  procurement: "/admin/procurement", announcement: "/admin/announcements",
};

export function AdminLayout() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [openSearch, setOpenSearch] = useState(false);
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-obsidian text-slate-300 lg:flex">
        <Link to="/admin" className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5" data-testid="admin-brand">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-coral font-heading text-xs font-black text-white">CN</span>
          <div className="leading-none">
            <span className="block font-heading text-sm font-extrabold text-white">Operations</span>
            <span className="block text-[10px] font-semibold tracking-widest text-slate-500">2026–27</span>
          </div>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`admin-nav-${n.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-semibold transition-colors",
                  isActive ? "bg-coral text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                )
              }
            >
              <n.icon className="h-4 w-4 shrink-0" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="flex items-center gap-2 border-t border-white/10 px-5 py-4 text-xs font-semibold text-slate-400 hover:text-coral">
          <ExternalLink className="h-3.5 w-3.5" /> View Public Site
        </Link>
      </aside>

      {/* MAIN */}
      <div className="flex-1 lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-5 md:px-8">
          <div className="relative w-full max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => q && setOpenSearch(true)}
              onBlur={() => setTimeout(() => setOpenSearch(false), 150)}
              placeholder="Search teams, rooms, decisions, procurement…"
              data-testid="global-search-input"
              className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            />
            {openSearch && results.length > 0 && (
              <div className="absolute mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg" data-testid="global-search-results">
                {results.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onMouseDown={() => { navigate(ROUTE[r.type] ?? "/admin"); setQ(""); }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-semibold text-slate-800">{r.label}</span>
                    <span className="text-xs uppercase tracking-wide text-slate-400">{r.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <span className="rounded-md bg-orange-50 px-3 py-1.5 text-xs font-bold text-coral-600 ring-1 ring-orange-200">
              DEV / SAMPLE DATA
            </span>
          </div>
        </header>

        <main className="p-5 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
