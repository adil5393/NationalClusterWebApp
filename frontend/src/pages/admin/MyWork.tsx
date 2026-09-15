import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  HardHat,
  MapPin,
  Square,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { priorityTone, formatOverflowMinutes } from "@/lib/meta";
import { cn } from "@/lib/utils";

interface InchargeContact {
  id: number;
  full_name: string | null;
  phone: string | null;
}

interface MyShift {
  id: number;
  shift_name: string | null;
  start_time: string | null;
  end_time: string | null;
  derived_status: "UPCOMING" | "ON_SHIFT" | "COMPLETED" | "CANCELLED" | string;
  notes?: string | null;
}

interface MyDuty {
  id: number;
  shift_id: number | null;
  duty_type: string;
  operational_area_id: number | null;
  operational_area_name: string | null;
  operational_area_incharges: InchargeContact[];
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  location_type?: string | null;
  room_name?: string | null;
  notes?: string | null;
  warning?: string | null;
  outside_shift_minutes?: number | null;
}

interface MyTask {
  id: number;
  shift_id: number | null;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  category: string;
  due_date: string | null;
}

interface MyIncharge {
  shift_block_id: number;
  shift_id: number | null;
  operational_area_id: number;
  operational_area_name: string | null;
  operational_area_code: string | null;
  staff_count: number;
}

interface TeamMemberDuty {
  id: number;
  duty_type: string;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
}

interface TeamMember {
  id: number;
  full_name: string;
  phone: string | null;
  duties: TeamMemberDuty[];
}

interface MyWorkResponse {
  staff: { id: number; full_name: string; category: string | null };
  shifts: MyShift[];
  duties: MyDuty[];
  tasks: MyTask[];
  incharge_of: MyIncharge[];
}

const timeFmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

const dateFmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

function timeRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "No time set";
  return `${timeFmt(start)} – ${timeFmt(end)}`;
}

function statusBadge(status: string) {
  if (status === "ON_SHIFT") return <Badge tone="green" size="sm">ON SHIFT NOW</Badge>;
  if (status === "UPCOMING") return <Badge tone="gold" size="sm">UPCOMING</Badge>;
  if (status === "CANCELLED") return <Badge tone="red" size="sm">CANCELLED</Badge>;
  return <Badge tone="neutral" size="sm">COMPLETED</Badge>;
}

function DutyRow({ d }: { d: MyDuty }) {
  const overflow = formatOverflowMinutes(d.outside_shift_minutes);
  return (
    <div className="rounded-lg border border-white/10 bg-obsidian-900/70 p-3 space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-heading font-bold text-white text-sm">{d.duty_type}</span>
        <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
          <CalendarClock className="h-3 w-3 text-slate-500" />
          {timeRange(d.start_time, d.end_time)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-body">
        <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
        {d.location_name || d.room_name || "Location not set"}
      </div>
      {d.warning && (
        <p className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Outside shift{overflow ? ` · ${overflow} beyond shift` : ""}
        </p>
      )}
      {d.notes && <p className="text-xs text-slate-500 font-body">{d.notes}</p>}
    </div>
  );
}

interface AreaGroup {
  operational_area_id: number | null;
  operational_area_name: string | null;
  incharges: InchargeContact[];
  duties: MyDuty[];
}

// Groups a shift's duties by Operational Area so "Report To" is shown once
// per area, not once per duty — unclassified (operational_area_id = null)
// duties render last under "Other / Unclassified Duties", never hidden.
function groupDutiesByArea(duties: MyDuty[]): AreaGroup[] {
  const map = new Map<string, AreaGroup>();
  for (const d of duties) {
    const key = d.operational_area_id == null ? "__unclassified__" : String(d.operational_area_id);
    if (!map.has(key)) {
      map.set(key, {
        operational_area_id: d.operational_area_id,
        operational_area_name: d.operational_area_name,
        incharges: d.operational_area_incharges || [],
        duties: [],
      });
    }
    map.get(key)!.duties.push(d);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.operational_area_id == null) return 1;
    if (b.operational_area_id == null) return -1;
    return (a.operational_area_name || "").localeCompare(b.operational_area_name || "");
  });
}

function AreaDutyGroup({ group }: { group: AreaGroup }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-[11px] font-heading font-extrabold uppercase tracking-wide text-white">
          {group.operational_area_name ?? "Other / Unclassified Duties"}
        </h4>
        {group.operational_area_id != null && (
          <span className="text-[10px] text-slate-400 font-body">
            {group.incharges.length > 0 ? (
              <>Report to: {group.incharges.map((i) => i.full_name).join(", ")}</>
            ) : (
              "In-charge not assigned"
            )}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {group.duties.map((d) => (
          <DutyRow key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  t,
  completingId,
  onComplete,
}: {
  t: MyTask;
  completingId: number | null;
  onComplete: (t: MyTask) => void;
}) {
  if (t.status === "completed") {
    return (
      <div className="rounded-lg border border-white/5 bg-obsidian-900/40 p-3 flex items-center gap-3 opacity-60">
        <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0" />
        <p className="text-xs font-body text-slate-400 line-through">{t.title}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-obsidian-900/70 p-3 flex items-start gap-3" data-testid={`my-task-${t.id}`}>
      <button
        type="button"
        onClick={() => onComplete(t)}
        disabled={completingId === t.id}
        data-testid={`my-task-complete-${t.id}`}
        className="mt-0.5 shrink-0 text-slate-500 hover:text-emerald-400 disabled:opacity-50"
        title="Mark Complete"
      >
        <Square className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-body font-bold text-white">{t.title}</p>
        {t.description && <p className="text-[11px] text-slate-400 font-body line-clamp-2">{t.description}</p>}
        <div className="flex items-center gap-1.5 flex-wrap">
          {t.priority && (
            <Badge tone={priorityTone(t.priority)} size="sm">
              {t.priority.toUpperCase()}
            </Badge>
          )}
          {t.due_date && (
            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Due {timeFmt(t.due_date)}
            </span>
          )}
        </div>
      </div>
      <Button
        variant="gold"
        size="sm"
        onClick={() => onComplete(t)}
        disabled={completingId === t.id}
        className="text-[10px] font-extrabold shrink-0"
      >
        Mark Complete
      </Button>
    </div>
  );
}

// Read-only team roster for an area this staff member leads. Fetched on
// demand (not part of /me/work) since most shifts won't need it opened.
function IncharegOfCard({ g }: { g: MyIncharge }) {
  const [expanded, setExpanded] = useState(false);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const toggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (team) return;
    setLoadingTeam(true);
    try {
      const res = await api.get<TeamMember[]>(`/me/incharge/${g.shift_block_id}/${g.operational_area_id}/team`);
      setTeam(res.data);
    } catch {
      toast.error("Could not load team");
      setExpanded(false);
    } finally {
      setLoadingTeam(false);
    }
  };

  return (
    <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 space-y-1.5" data-testid={`my-work-incharge-${g.operational_area_id}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-heading font-bold text-white">{g.operational_area_name}</p>
          <p className="text-[11px] text-slate-400 font-mono">{g.staff_count} staff reporting</p>
        </div>
        <Button variant="outline" size="sm" onClick={toggle} className="text-[10px] font-bold shrink-0">
          {expanded ? "Hide Team" : "View Team"}
        </Button>
      </div>
      {expanded && (
        <div className="pt-1.5 border-t border-white/5 space-y-2">
          {loadingTeam ? (
            <p className="text-[11px] text-slate-500 italic">Loading…</p>
          ) : !team || team.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No staff reporting yet.</p>
          ) : (
            team.map((m) => (
              <div key={m.id} className="text-[11px]">
                <p className="text-white font-bold font-body">
                  {m.full_name}
                  {m.phone ? ` · ${m.phone}` : ""}
                </p>
                {m.duties.map((d) => (
                  <p key={d.id} className="text-slate-400 font-body pl-2">
                    {d.duty_type} · {timeRange(d.start_time, d.end_time)}
                    {d.location_name ? ` · ${d.location_name}` : ""}
                  </p>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface ShiftGroup {
  shift: MyShift;
  duties: MyDuty[];
  tasks: MyTask[];
  incharge_of: MyIncharge[];
}

function ShiftCard({
  group,
  emphasize,
  completingId,
  onComplete,
}: {
  group: ShiftGroup;
  emphasize: boolean;
  completingId: number | null;
  onComplete: (t: MyTask) => void;
}) {
  const { shift, duties, tasks, incharge_of } = group;
  const activeTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const areaGroups = useMemo(() => groupDutiesByArea(duties), [duties]);

  return (
    <div
      className={cn(
        "rounded-xl border bg-obsidian-900 p-4 space-y-3",
        emphasize ? "border-gold/30" : "border-white/10",
      )}
      data-testid={`my-work-shift-${shift.id}`}
    >
      {/* SHIFT HEADER */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-heading text-base font-black text-white">{shift.shift_name ?? "Shift"}</p>
          <p className="text-xs font-mono text-slate-400">
            {dateFmt(shift.start_time)} · {timeRange(shift.start_time, shift.end_time)}
          </p>
        </div>
        {statusBadge(shift.derived_status)}
      </div>

      {/* YOU ARE IN-CHARGE */}
      {incharge_of.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          <h3 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-gold pt-2 flex items-center gap-1">
            <Shield className="h-3 w-3" /> You Are In-Charge
          </h3>
          <div className="space-y-1.5">
            {incharge_of.map((g) => (
              <IncharegOfCard key={g.operational_area_id} g={g} />
            ))}
          </div>
        </div>
      )}

      {/* DUTIES — grouped by Operational Area, "Report To" shown once per area */}
      {areaGroups.length > 0 && (
        <div className="space-y-3 pt-1 border-t border-white/5">
          <h3 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-slate-500 pt-2">
            Duties
          </h3>
          <div className="space-y-3">
            {areaGroups.map((g) => (
              <AreaDutyGroup key={g.operational_area_id ?? "unclassified"} group={g} />
            ))}
          </div>
        </div>
      )}

      {/* TASKS */}
      {(activeTasks.length > 0 || completedTasks.length > 0) && (
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          <h3 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-slate-500 pt-2">
            Tasks
          </h3>
          <div className="space-y-1.5">
            {activeTasks.map((t) => (
              <TaskRow key={t.id} t={t} completingId={completingId} onComplete={onComplete} />
            ))}
            {completedTasks.map((t) => (
              <TaskRow key={t.id} t={t} completingId={completingId} onComplete={onComplete} />
            ))}
          </div>
        </div>
      )}

      {areaGroups.length === 0 && activeTasks.length === 0 && completedTasks.length === 0 && incharge_of.length === 0 && (
        <p className="text-xs text-slate-500 font-body italic pt-1 border-t border-white/5 mt-1">
          No duties or tasks assigned for this shift yet.
        </p>
      )}
    </div>
  );
}

export default function MyWork() {
  const [data, setData] = useState<MyWorkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<"none-linked" | "ambiguous" | "other" | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [showPast, setShowPast] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<MyWorkResponse>("/me/work")
      .then((r) => {
        setData(r.data);
        setErrorState(null);
      })
      .catch((e) => {
        const status = e?.response?.status;
        if (status === 404) setErrorState("none-linked");
        else if (status === 409) setErrorState("ambiguous");
        else setErrorState("other");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Group duties + tasks + in-charge info under their ShiftBlock (duty.shift_id
  // / task.shift_id / incharge.shift_id all reference the same StaffShift id
  // as shifts[].id) so each shift reads as one self-contained work container.
  const { current, upcoming, past, otherDuties, otherTasks } = useMemo(() => {
    const shifts = data?.shifts ?? [];
    const duties = data?.duties ?? [];
    const tasks = data?.tasks ?? [];
    const inchargeOf = data?.incharge_of ?? [];

    const groups: ShiftGroup[] = [...shifts]
      .sort((a, b) => new Date(a.start_time ?? 0).getTime() - new Date(b.start_time ?? 0).getTime())
      .map((shift) => ({
        shift,
        duties: duties.filter((d) => d.shift_id === shift.id),
        tasks: tasks.filter((t) => t.shift_id === shift.id),
        incharge_of: inchargeOf.filter((g) => g.shift_id === shift.id),
      }));

    // A duty or task with no shift_id (or one that no longer matches a known
    // shift) is still valid — e.g. an unscheduled emergency duty — so it
    // isn't dropped, just shown outside any shift container.
    const otherDuties = duties.filter((d) => d.shift_id == null || !shifts.some((s) => s.id === d.shift_id));
    const otherTasks = tasks.filter((t) => t.shift_id == null || !shifts.some((s) => s.id === t.shift_id));

    return {
      current: groups.filter((g) => g.shift.derived_status === "ON_SHIFT"),
      upcoming: groups.filter((g) => g.shift.derived_status === "UPCOMING"),
      past: groups.filter((g) => g.shift.derived_status === "COMPLETED" || g.shift.derived_status === "CANCELLED"),
      otherDuties,
      otherTasks,
    };
  }, [data]);

  const markComplete = async (task: MyTask) => {
    setCompletingId(task.id);
    setData((prev) =>
      prev ? { ...prev, tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, status: "completed" } : t)) } : prev,
    );
    try {
      await api.patch(`/me/tasks/${task.id}/complete`);
      toast.success(`"${task.title}" marked complete`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not mark task complete");
      load();
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading your work…" />
      </div>
    );
  }

  if (errorState === "none-linked") {
    return (
      <div className="max-w-lg mx-auto py-10">
        <EmptyState
          icon={HardHat}
          title="No staff profile linked"
          hint="This login isn't linked to a staff profile yet. Ask an admin to link your account from Staff → People."
        />
      </div>
    );
  }

  if (errorState === "ambiguous") {
    return (
      <div className="max-w-lg mx-auto py-10">
        <EmptyState
          icon={AlertTriangle}
          title="Multiple staff profiles linked"
          hint="This login is linked to more than one staff profile, so My Work can't tell which one is you. Ask an admin to link a single staff profile to this account."
        />
      </div>
    );
  }

  if (errorState === "other" || !data) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <EmptyState icon={AlertTriangle} title="Couldn't load your work" hint="Please try again in a moment." />
      </div>
    );
  }

  const activeOtherTasks = otherTasks.filter((t) => t.status !== "completed");
  const completedOtherTasks = otherTasks.filter((t) => t.status === "completed");
  const hasAnyShift = current.length + upcoming.length + past.length > 0;
  const otherAreaGroups = groupDutiesByArea(otherDuties);

  return (
    <div data-testid="my-work-page" className="space-y-6 max-w-2xl mx-auto">
      {/* HEADER */}
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">MY WORK</span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          {data.staff.full_name}
        </h1>
        {data.staff.category && (
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">{data.staff.category}</p>
        )}
      </div>

      {/* CURRENT + UPCOMING SHIFTS (each a self-contained work container) */}
      {!hasAnyShift ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4">
          <p className="text-sm text-slate-400 font-body">No shift scheduled right now.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="my-work-shifts">
          {current.map((g, i) => (
            <ShiftCard key={g.shift.id} group={g} emphasize={i === 0} completingId={completingId} onComplete={markComplete} />
          ))}
          {upcoming.map((g, i) => (
            <ShiftCard
              key={g.shift.id}
              group={g}
              emphasize={current.length === 0 && i === 0}
              completingId={completingId}
              onComplete={markComplete}
            />
          ))}
        </div>
      )}

      {/* PAST / CANCELLED SHIFTS — de-emphasized, collapsed by default */}
      {past.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-heading font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300"
            data-testid="my-work-toggle-past"
          >
            {showPast ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Past Shifts ({past.length})
          </button>
          {showPast && (
            <div className="space-y-3 opacity-70">
              {past.map((g) => (
                <ShiftCard key={g.shift.id} group={g} emphasize={false} completingId={completingId} onComplete={markComplete} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* OTHER DUTIES — not linked to any shift (e.g. an unscheduled/
          emergency duty), still valid, just shown outside a shift container */}
      {otherAreaGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-heading font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-gold" /> Other Duties
          </h2>
          <div className="space-y-3" data-testid="my-work-other-duties">
            {otherAreaGroups.map((g) => (
              <AreaDutyGroup key={g.operational_area_id ?? "unclassified"} group={g} />
            ))}
          </div>
        </section>
      )}

      {/* OTHER TASKS — not linked to any shift */}
      {(activeOtherTasks.length > 0 || completedOtherTasks.length > 0) && (
        <section className="space-y-2.5">
          <h2 className="text-xs font-heading font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5 text-gold" /> Other Tasks
          </h2>
          <div className="space-y-2" data-testid="my-work-other-tasks">
            {activeOtherTasks.length === 0 && (
              <p className="text-xs text-slate-500 font-body italic">All caught up — no open tasks.</p>
            )}
            {activeOtherTasks.map((t) => (
              <TaskRow key={t.id} t={t} completingId={completingId} onComplete={markComplete} />
            ))}
            {completedOtherTasks.map((t) => (
              <TaskRow key={t.id} t={t} completingId={completingId} onComplete={markComplete} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
