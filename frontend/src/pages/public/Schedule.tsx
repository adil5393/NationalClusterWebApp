import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, MapPin, Radio, Swords } from "lucide-react";
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

interface ScheduledMatch {
  id: number;
  tournament_name?: string | null;
  sport?: string | null;
  age_group?: string | null;
  round_name?: string | null;
  pool_name?: string | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
  venue_name?: string | null;
  mat_name?: string | null;
  scheduled_at?: string | null;
  scheduled_end_at?: string | null;
  status: string;
  team_a_score: number;
  team_b_score: number;
  winner_team_name?: string | null;
}

interface Day<T> {
  key: string;
  label: string;
  items: T[];
}

const UNSCHEDULED_KEY = "unscheduled";

function dayLabel(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function timeOnly(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function timeRange(startIso?: string | null, endIso?: string | null) {
  const start = timeOnly(startIso);
  if (!start) return null;
  const end = timeOnly(endIso);
  return end ? `${start} – ${end}` : start;
}

function groupByDay<T extends { start_time?: string | null }>(rows: T[]): Day<T>[] {
  const scheduled = rows.filter((r) => r.start_time);
  const unscheduled = rows.filter((r) => !r.start_time);
  const byKey = new Map<string, T[]>();
  for (const r of scheduled) {
    const key = r.start_time!.slice(0, 10);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const result: Day<T>[] = [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, label: dayLabel(key), items }));
  if (unscheduled.length > 0) {
    result.push({ key: UNSCHEDULED_KEY, label: "Time To Be Confirmed", items: unscheduled });
  }
  return result;
}

const FINISHED_STATUSES = new Set(["COMPLETED", "CANCELLED", "POSTPONED"]);

function MatchScheduleRow({ m, i }: { m: ScheduledMatch; i: number }) {
  return (
    <div
      data-testid={`match-schedule-item-${m.id}`}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.04]"
    >
      <div className="flex items-start gap-3.5 min-w-0">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold font-mono font-bold text-xs shrink-0">
          {i + 1}
        </span>
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold text-white truncate">
            {m.team_a_name ?? "TBD"} vs {m.team_b_name ?? "TBD"}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-body">
            {timeRange(m.scheduled_at, m.scheduled_end_at) && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gold" /> {timeRange(m.scheduled_at, m.scheduled_end_at)}
              </span>
            )}
            {m.mat_name && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400" /> {m.mat_name}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 font-body">
            {[m.tournament_name, m.age_group, m.pool_name ?? m.round_name].filter(Boolean).join(" · ")}
          </p>
          {m.status === "COMPLETED" && m.winner_team_name && (
            <p className="mt-1 text-xs font-semibold text-emerald-400">Winner: {m.winner_team_name}</p>
          )}
        </div>
      </div>
      <div className="self-start sm:self-center shrink-0">{matchStatusBadge(m)}</div>
    </div>
  );
}

function matchStatusBadge(m: ScheduledMatch) {
  if (m.status === "ONGOING" || m.status === "PAUSED") {
    return (
      <Badge tone="gold" size="sm" className="animate-pulse">
        ● LIVE {m.team_a_score}–{m.team_b_score}
      </Badge>
    );
  }
  if (m.status === "COMPLETED") {
    return (
      <Badge tone="neutral" size="sm">
        Final {m.team_a_score}–{m.team_b_score}
      </Badge>
    );
  }
  if (m.status === "CANCELLED") return <Badge tone="coral" size="sm">Cancelled</Badge>;
  if (m.status === "POSTPONED") return <Badge tone="coral" size="sm">Postponed</Badge>;
  return <Badge tone="neutral" size="sm">Scheduled</Badge>;
}

export default function PublicSchedule() {
  const [tab, setTab] = useState<"events" | "matches">("events");

  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [activeEventDay, setActiveEventDay] = useState<string | null>(null);

  const [matches, setMatches] = useState<ScheduledMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [activeMatchDay, setActiveMatchDay] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Event[]>("/public/schedule")
      .then((r) => setEvents(r.data))
      .finally(() => setEventsLoading(false));
  }, []);

  // Match schedule is fetched lazily (only once the tab is opened) since it's
  // a separate, potentially larger dataset from the hand-curated events list.
  useEffect(() => {
    if (tab !== "matches" || matchesLoaded) return;
    setMatchesLoading(true);
    api
      .get<ScheduledMatch[]>("/public/matches/schedule")
      .then((r) => setMatches(r.data))
      .finally(() => {
        setMatchesLoading(false);
        setMatchesLoaded(true);
      });
  }, [tab, matchesLoaded]);

  const eventDays = useMemo(() => groupByDay(events.map((e) => ({ ...e, start_time: e.start_time }))), [events]);
  const matchDays = useMemo(
    () => groupByDay(matches.map((m) => ({ ...m, start_time: m.scheduled_at }))),
    [matches],
  );

  useEffect(() => {
    if (eventDays.length > 0 && !eventDays.some((d) => d.key === activeEventDay)) {
      setActiveEventDay(eventDays[0].key);
    }
  }, [eventDays, activeEventDay]);

  useEffect(() => {
    if (matchDays.length > 0 && !matchDays.some((d) => d.key === activeMatchDay)) {
      setActiveMatchDay(matchDays[0].key);
    }
  }, [matchDays, activeMatchDay]);

  const currentEventDay = eventDays.find((d) => d.key === activeEventDay) ?? eventDays[0];
  const currentMatchDay = matchDays.find((d) => d.key === activeMatchDay) ?? matchDays[0];

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

      {/* TOP-LEVEL TABS */}
      <div className="mt-6 flex gap-1.5 rounded-xl border border-white/10 bg-obsidian-900 p-1 max-w-md">
        <button
          onClick={() => setTab("events")}
          data-testid="schedule-tab-events"
          className={`flex-1 rounded-lg py-2 text-xs font-heading font-bold transition-colors ${
            tab === "events" ? "bg-gold text-obsidian" : "text-slate-400 hover:text-white"
          }`}
        >
          Ceremonies &amp; Events
        </button>
        <button
          onClick={() => setTab("matches")}
          data-testid="schedule-tab-matches"
          className={`flex-1 rounded-lg py-2 text-xs font-heading font-bold transition-colors ${
            tab === "matches" ? "bg-gold text-obsidian" : "text-slate-400 hover:text-white"
          }`}
        >
          Match Schedule
        </button>
      </div>

      {tab === "events" ? (
        eventsLoading ? (
          <div className="py-20">
            <Spinner label="Loading tournament programme…" />
          </div>
        ) : eventDays.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Schedule not published yet"
              hint="Ceremonies and weigh-in timings will appear here once the organizing committee finalizes them."
              icon={CalendarDays}
            />
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {/* DAY SWITCHER TABS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {eventDays.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setActiveEventDay(d.key)}
                  data-testid={`schedule-day-tab-${d.key}`}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    activeEventDay === d.key
                      ? "border-gold bg-gold/15 text-gold shadow-gold-glow/30"
                      : "border-white/10 bg-obsidian-900 text-slate-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <p className="text-sm font-bold text-white truncate">{d.label}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">{d.items.length} events</p>
                </button>
              ))}
            </div>

            {/* DAY TIMELINE */}
            {currentEventDay && (
              <div className="rounded-2xl border border-white/10 bg-obsidian-900/90 p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <h2 className="font-heading text-xl font-black text-white">{currentEventDay.label}</h2>
                  <Badge tone="gold">Official Schedule</Badge>
                </div>

                <div className="mt-6 space-y-4" data-testid="schedule-event-list">
                  {currentEventDay.items.map((e, i) => (
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
                            {timeRange(e.start_time, e.end_time) && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-gold" /> {timeRange(e.start_time, e.end_time)}
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
        )
      ) : matchesLoading ? (
        <div className="py-20">
          <Spinner label="Loading match schedule…" />
        </div>
      ) : matchDays.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No matches scheduled yet"
            hint="Matches appear here once the organizing committee assigns a mat, date, and time to a fixture."
            icon={Swords}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* DAY SWITCHER TABS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {matchDays.map((d) => (
              <button
                key={d.key}
                onClick={() => setActiveMatchDay(d.key)}
                data-testid={`match-schedule-day-tab-${d.key}`}
                className={`rounded-xl border p-4 text-left transition-all ${
                  activeMatchDay === d.key
                    ? "border-gold bg-gold/15 text-gold shadow-gold-glow/30"
                    : "border-white/10 bg-obsidian-900 text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                <p className="text-sm font-bold text-white truncate">{d.label}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-1">{d.items.length} matches</p>
              </button>
            ))}
          </div>

          {/* DAY TIMELINE */}
          {currentMatchDay && (
            <div className="rounded-2xl border border-white/10 bg-obsidian-900/90 p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="font-heading text-xl font-black text-white">{currentMatchDay.label}</h2>
                <Badge tone="gold">Match Schedule</Badge>
              </div>

              {(() => {
                const pending = currentMatchDay.items.filter((m) => !FINISHED_STATUSES.has(m.status));
                const finished = currentMatchDay.items.filter((m) => FINISHED_STATUSES.has(m.status));
                return (
                  <div className="mt-6 space-y-6">
                    {pending.length > 0 && (
                      <div className="space-y-3" data-testid="match-schedule-pending">
                        <h3 className="text-xs font-heading font-extrabold uppercase tracking-wider text-gold">
                          Upcoming &amp; Live
                        </h3>
                        <div className="space-y-4">
                          {pending.map((m, i) => (
                            <MatchScheduleRow key={m.id} m={m} i={i} />
                          ))}
                        </div>
                      </div>
                    )}
                    {finished.length > 0 && (
                      <div className="space-y-3" data-testid="match-schedule-completed">
                        <h3 className="text-xs font-heading font-extrabold uppercase tracking-wider text-slate-400">
                          Completed
                        </h3>
                        <div className="space-y-4">
                          {finished.map((m, i) => (
                            <MatchScheduleRow key={m.id} m={m} i={i} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
