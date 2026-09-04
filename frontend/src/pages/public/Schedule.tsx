import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, MapPin, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/feedback";

interface Event {
  id: number;
  title: string;
  team_name?: string | null;
  venue_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  description?: string | null;
}

interface Day {
  key: string;
  label: string;
  events: Event[];
}

const UNSCHEDULED_KEY = "unscheduled";

function dayLabel(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function timeRange(e: Event) {
  if (!e.start_time) return null;
  const start = new Date(e.start_time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (!e.end_time) return start;
  const end = new Date(e.end_time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${start} – ${end}`;
}

export default function PublicSchedule() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Event[]>("/public/schedule")
      .then((r) => setEvents(r.data))
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo<Day[]>(() => {
    const scheduled = events.filter((e) => e.start_time);
    const unscheduled = events.filter((e) => !e.start_time);
    const byKey = new Map<string, Event[]>();
    for (const e of scheduled) {
      const key = e.start_time!.slice(0, 10);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(e);
    }
    const result: Day[] = [...byKey.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dayEvents]) => ({ key, label: dayLabel(key), events: dayEvents }));
    if (unscheduled.length > 0) {
      result.push({ key: UNSCHEDULED_KEY, label: "Time To Be Confirmed", events: unscheduled });
    }
    return result;
  }, [events]);

  useEffect(() => {
    if (days.length > 0 && !days.some((d) => d.key === activeDay)) {
      setActiveDay(days[0].key);
    }
  }, [days, activeDay]);

  const current = days.find((d) => d.key === activeDay) ?? days[0];

  return (
    <div
      className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-10 md:py-14 text-slate-100 min-h-screen"
      data-testid="public-schedule"
    >
      {/* SECTION BREADCRUMB */}
      <div className="flex items-center gap-2 mb-3">
        <Link to="/" className="text-xs font-bold text-slate-400 hover:text-gold transition-colors">
          Home
        </Link>
        <span className="text-slate-600 text-xs">/</span>
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">Schedule</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black text-white">Tournament Programme</h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 font-body">
            Daily schedule of matches, ceremonies, weigh-in sessions, and championship fixtures.
          </p>
        </div>
        <Link
          to="/live"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-heading font-black text-obsidian hover:bg-emerald-400 transition-colors shadow-sm shrink-0"
        >
          <Radio className="h-4 w-4" /> Live Scoreboard →
        </Link>
      </div>

      {loading ? (
        <div className="py-20">
          <Spinner label="Loading tournament programme…" />
        </div>
      ) : days.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Schedule not published yet"
            hint="Match fixtures, ceremonies, and weigh-in timings will appear here once the organizing committee finalizes them."
            icon={CalendarDays}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* DAY SWITCHER TABS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {days.map((d) => (
              <button
                key={d.key}
                onClick={() => setActiveDay(d.key)}
                data-testid={`schedule-day-tab-${d.key}`}
                className={`rounded-xl border p-4 text-left transition-all ${
                  activeDay === d.key
                    ? "border-gold bg-gold/15 text-gold shadow-gold-glow/30"
                    : "border-white/10 bg-obsidian-900 text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                <p className="text-sm font-bold text-white truncate">{d.label}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-1">{d.events.length} events</p>
              </button>
            ))}
          </div>

          {/* DAY TIMELINE */}
          {current && (
            <div className="rounded-2xl border border-white/10 bg-obsidian-900/90 p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="font-heading text-xl font-black text-white">{current.label}</h2>
                <Badge tone="gold">Official Schedule</Badge>
              </div>

              <div className="mt-6 space-y-4" data-testid="schedule-event-list">
                {current.events.map((e, i) => (
                  <div
                    key={e.id}
                    data-testid={`schedule-event-${e.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold font-mono font-bold text-xs shrink-0">
                        {i + 1}
                      </span>
                      <div>
                        <h3 className="font-heading text-base font-bold text-white">{e.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-body">
                          {timeRange(e) && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-gold" /> {timeRange(e)}
                            </span>
                          )}
                          {e.venue_name && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" /> {e.venue_name}
                            </span>
                          )}
                        </div>
                        {e.description && (
                          <p className="mt-1.5 text-xs text-slate-400 font-body max-w-2xl">{e.description}</p>
                        )}
                      </div>
                    </div>
                    <Badge tone={e.team_name ? "gold" : "neutral"} size="sm" className="self-start sm:self-center">
                      {e.team_name ?? "All Delegations"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
