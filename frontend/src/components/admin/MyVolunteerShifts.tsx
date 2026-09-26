import { useEffect, useState } from "react";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MyShift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  notes?: string | null;
  state: "NOW" | "UPCOMING" | "DONE";
  teammates: string[];
}

function when(s: string, e: string): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const t = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(s).toDateString() === new Date(e).toDateString();
  return sameDay ? `${day(s)} · ${t(s)} – ${t(e)}` : `${day(s)} ${t(s)} – ${day(e)} ${t(e)}`;
}

const STATE: Record<MyShift["state"], { label: string; cls: string }> = {
  NOW: { label: "On now", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  UPCOMING: { label: "Upcoming", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  DONE: { label: "Done", cls: "border-white/15 bg-white/5 text-slate-400" },
};

/** "My Shifts" on a volunteer's own My ID Card page — the volunteer shifts an
 * organizer has assigned them (backend GET /me/volunteer/shifts). */
export function MyVolunteerShifts() {
  const [shifts, setShifts] = useState<MyShift[] | null>(null);

  useEffect(() => {
    const load = () =>
      api
        .get<MyShift[]>("/me/volunteer/shifts")
        .then((r) => setShifts(r.data))
        .catch(() => setShifts((prev) => prev ?? []));
    load();
    // Keep "On now" / "Upcoming" current if the page stays open.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (shifts === null) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3" data-testid="my-volunteer-shifts">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
          <CalendarClock className="h-4 w-4" />
        </span>
        <h2 className="font-heading text-base font-bold text-white">My Shifts</h2>
      </div>

      {shifts.length === 0 ? (
        <p className="text-xs text-slate-400 font-body">No shifts assigned to you yet. Check back later or ask an organizer.</p>
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => {
            const st = STATE[s.state];
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-lg border p-3 space-y-1.5",
                  s.state === "NOW" ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-white/10 bg-obsidian-950",
                  s.state === "DONE" && "opacity-60",
                )}
                data-testid={`my-volunteer-shift-${s.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-heading text-sm font-bold text-white">{s.name}</p>
                  <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-heading font-bold", st.cls)}>{st.label}</span>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3 text-slate-500" /> {when(s.start_time, s.end_time)}
                  </span>
                  {s.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-slate-500" /> {s.location}
                    </span>
                  )}
                </p>
                {s.notes && <p className="text-xs text-slate-400 font-body">{s.notes}</p>}
                {s.teammates.length > 0 && (
                  <p className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Users className="h-3 w-3" /> With {s.teammates.join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
