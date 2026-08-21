import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/teams", label: "Teams" },
  { to: "/schedule", label: "Schedule" },
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
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="brand-logo">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-obsidian font-heading text-sm font-black text-white">
                CN
              </span>
              <span className="hidden sm:block">
                <span className="block font-heading text-sm font-extrabold leading-none tracking-tight text-slate-950">
                  CLUSTER NATIONALS
                </span>
                <span className="block text-[11px] font-semibold tracking-widest text-coral-600">2026–27</span>
              </span>
            </Link>

            <nav className="hidden xl:flex items-center gap-0.5">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  data-testid={`nav-${n.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
                      isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link
                to="/admin"
                data-testid="organizer-portal-link"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-coral px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-coral-600"
              >
                Organizer Portal <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                className="xl:hidden grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-700"
                onClick={() => setOpen((v) => !v)}
                data-testid="mobile-menu-toggle"
                aria-label="Toggle menu"
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {open && (
            <nav className="xl:hidden grid grid-cols-2 gap-1 pb-4" data-testid="mobile-nav">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                      isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-obsidian text-white">
        <div className="mx-auto max-w-7xl px-5 md:px-8 py-14">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <span className="font-heading text-lg font-black tracking-tight">CLUSTER NATIONALS 2026–27</span>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
                The official information and operations portal for our school-hosted National Cluster event.
              </p>
            </div>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Explore</p>
              <ul className="space-y-2 text-sm text-slate-300">
                <li><Link to="/teams" className="hover:text-coral">Participating Teams</Link></li>
                <li><Link to="/schedule" className="hover:text-coral">Schedule</Link></li>
                <li><Link to="/announcements" className="hover:text-coral">Announcements</Link></li>
                <li><Link to="/faq" className="hover:text-coral">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Organizers</p>
              <Link to="/admin" className="text-sm text-slate-300 hover:text-coral">Operations Dashboard →</Link>
            </div>
          </div>
          <p className="mt-10 border-t border-white/10 pt-6 text-xs text-slate-500">
            © 2026–27 Cluster Nationals · Development preview · Content marked [DEV] / [EXAMPLE] is placeholder data.
          </p>
        </div>
      </footer>
    </div>
  );
}
