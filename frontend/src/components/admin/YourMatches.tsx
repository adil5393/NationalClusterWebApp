import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, MapPin, Clock, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MyMatch {
  id: number;
  match_number?: number | null;
  tournament_name?: string | null;
  round_name?: string | null;
  pool_name?: string | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
  team_a_score: number;
  team_b_score: number;
  status: string;
  scheduled_at?: string | null;
  mat_name?: string | null;
  venue_name?: string | null;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ONGOING: { label: "Live now", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  PAUSED: { label: "Paused", cls: "border-amber-500/40 bg-amber-500/15 text-amber-300" },
  SCHEDULED: { label: "Upcoming", cls: "border-sky-500/40 bg-sky-500/15 text-sky-300" },
  POSTPONED: { label: "Postponed", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  COMPLETED: { label: "Completed", cls: "border-white/15 bg-white/5 text-slate-400" },
  CANCELLED: { label: "Cancelled", cls: "border-red-500/30 bg-red-500/10 text-red-300" },
};

// Refresh so a match going live / a score changing shows up without a reload.
const REFRESH_MS = 30_000;

/** "Your Matches" — the matches this login has been assigned to (backend
 * GET /me/matches). Renders nothing when there are none, so it can sit on
 * every landing page (Dashboard, My Work, My ID Card) without adding clutter
 * for accounts that never get assigned a match. */
export function YourMatches() {
  const [matches, setMatches] = useState<MyMatch[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get<MyMatch[]>("/me/matches")
        .then((r) => alive && setMatches(r.data))
        .catch(() => alive && setMatches((m) => m ?? []));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!matches || matches.length === 0) return null;

  const active = matches.filter((m) => m.status === "ONGOING" || m.status === "PAUSED").length;

  return (
    <section
      className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.07] to-obsidian-900 p-4 space-y-3"
      data-testid="your-matches"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <Radio className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base font-bold text-white">Your Matches</h2>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono font-bold text-slate-300">
            {matches.length}
          </span>
        </div>
        {active > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-heading font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {active} in progress
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {matches.map((m) => {
          const st = STATUS_STYLE[m.status] ?? { label: m.status, cls: "border-white/15 bg-white/5 text-slate-300" };
          const started = m.status !== "SCHEDULED" && m.status !== "POSTPONED";
          const when = m.scheduled_at
            ? new Date(m.scheduled_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
            : null;
          return (
            <Link
              key={m.id}
              to={`/admin/matches?console=${m.id}`}
              className="group block min-w-0 rounded-lg border border-white/10 bg-obsidian-950 p-3 transition-colors hover:border-emerald-500/50"
              data-testid={`your-match-${m.id}`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-slate-400 font-body">
                  {m.match_number ? <span className="font-mono text-slate-300">#{m.match_number} · </span> : null}
                  {[m.tournament_name, m.pool_name || m.round_name].filter(Boolean).join(" · ")}
                </span>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 font-heading font-bold", st.cls)}>{st.label}</span>
              </div>

              <div className="mt-2 space-y-1">
                {[
                  [m.team_a_name, m.team_a_score],
                  [m.team_b_name, m.team_b_score],
                ].map(([name, score], i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-heading font-bold text-white">{name || "To be decided"}</span>
                    {started && <span className="font-mono text-sm font-black text-gold tabular-nums">{score}</span>}
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="flex min-w-0 items-center gap-2.5">
                  {when && (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" /> {when}
                    </span>
                  )}
                  {(m.mat_name || m.venue_name) && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{m.mat_name || m.venue_name}</span>
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-0.5 font-heading font-bold text-emerald-300 opacity-80 group-hover:opacity-100 shrink-0">
                  Open <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
