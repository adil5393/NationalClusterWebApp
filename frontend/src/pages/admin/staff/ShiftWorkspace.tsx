import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Calendar,
  Clock,
  Users,
  Shield,
  Briefcase,
  CheckSquare,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Check,
  Building,
  User,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { formatOverflowMinutes } from "@/lib/meta";
import {
  ShiftBlockItem,
  StaffMember,
  StaffDutyItem,
  StaffTaskItem,
  OperationalAreaItem,
  AvailableLocationOption,
  formatShiftDate,
  formatShiftTime,
  getShiftDuration,
} from "./types";

interface ShiftWorkspaceProps {
  shiftBlock: ShiftBlockItem;
  allStaff: StaffMember[];
  allDuties: StaffDutyItem[];
  allTasks: StaffTaskItem[];
  operationalAreas: OperationalAreaItem[];
  availableLocations: AvailableLocationOption[];
  canEdit: boolean;
  onBack: () => void;
  onOpenManageStaff: () => void;
  onOpenEditShift: () => void;
  onOpenInchargesModal: () => void;
  onAssignDuty: (staffId?: number) => void;
  onEditDuty: (duty: any) => void;
  onDeleteDuty: (dutyId: number) => void;
  onAddTask: (staffId?: number) => void;
  onEditTask: (task: StaffTaskItem) => void;
  onToggleTask: (task: StaffTaskItem) => void;
  onDeleteTask: (taskId: number) => void;
}

export function ShiftWorkspace({
  shiftBlock,
  allStaff,
  allDuties,
  allTasks,
  operationalAreas,
  canEdit,
  onBack,
  onOpenManageStaff,
  onOpenEditShift,
  onOpenInchargesModal,
  onAssignDuty,
  onEditDuty,
  onDeleteDuty,
  onAddTask,
  onEditTask,
  onToggleTask,
  onDeleteTask,
}: ShiftWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const validSubtabs = ["overview", "staff", "duties", "tasks", "incharges"] as const;
  type Subtab = typeof validSubtabs[number];
  const paramSubtab = searchParams.get("subtab") as Subtab | null;
  const initialSubtab: Subtab = paramSubtab && validSubtabs.includes(paramSubtab) ? paramSubtab : "overview";
  const [workspaceTab, setWorkspaceTabState] = useState<Subtab>(initialSubtab);

  useEffect(() => {
    if (paramSubtab && validSubtabs.includes(paramSubtab) && paramSubtab !== workspaceTab) {
      setWorkspaceTabState(paramSubtab);
    }
  }, [paramSubtab]);

  const setWorkspaceTab = (tab: Subtab) => {
    setWorkspaceTabState(tab);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("subtab", tab);
        return p;
      },
      { replace: true }
    );
  };

  // Roster assignments on this shift - sorted alphabetically by staff name
  const assignments = useMemo(() => {
    const list = shiftBlock.staff_assignments || [];
    return [...list].sort((a, b) =>
      (a.staff_name || "").localeCompare(b.staff_name || "", undefined, { sensitivity: "base" })
    );
  }, [shiftBlock]);
  const totalStaff = assignments.length || shiftBlock.staff_count || 0;

  // Shift assignment IDs for lookups
  const shiftAssignmentIds = useMemo(
    () => new Set(assignments.map((a) => a.id)),
    [assignments]
  );
  const shiftStaffIds = useMemo(
    () => new Set(assignments.map((a) => a.staff_id)),
    [assignments]
  );

  // Duties specifically belonging to this shift block
  const shiftDuties = useMemo(() => {
    return allDuties.filter(
      (d) =>
        (d.shift_id && shiftAssignmentIds.has(d.shift_id)) ||
        // Fallback matching if duty is tied directly to staff and has matching time range or block
        (d.shift_name === shiftBlock.name && shiftStaffIds.has(d.staff_id))
    );
  }, [allDuties, shiftAssignmentIds, shiftStaffIds, shiftBlock.name]);

  // Tasks specifically belonging to this shift block
  const shiftTasks = useMemo(() => {
    return allTasks.filter(
      (t) =>
        (t.shift_id && shiftAssignmentIds.has(t.shift_id)) ||
        (t.shift_id === shiftBlock.id)
    );
  }, [allTasks, shiftAssignmentIds, shiftBlock.id]);

  // Map of staff_id -> their duties on this shift
  const staffDutyMap = useMemo(() => {
    const map = new Map<number, StaffDutyItem[]>();
    for (const a of assignments) {
      // Collect duties from assignment item embedded or from shiftDuties
      const list = (a.duties && a.duties.length > 0)
        ? (a.duties as any as StaffDutyItem[])
        : shiftDuties.filter((d) => d.staff_id === a.staff_id);
      map.set(a.staff_id, list);
    }
    return map;
  }, [assignments, shiftDuties]);

  // Staff with duties vs need duty
  const staffWithDutiesCount = useMemo(() => {
    let count = 0;
    for (const a of assignments) {
      const list = staffDutyMap.get(a.staff_id) || [];
      if (list.length > 0) count++;
    }
    return count;
  }, [assignments, staffDutyMap]);

  const staffNeedingDuty = Math.max(0, totalStaff - staffWithDutiesCount);

  // Active operational areas
  const activeAreas = useMemo(
    () => operationalAreas.filter((a) => a.is_active),
    [operationalAreas]
  );

  // Areas represented on this shift
  const representedAreaNames = useMemo(() => {
    const set = new Set<string>();
    for (const d of shiftDuties) {
      if (d.operational_area_name) set.add(d.operational_area_name);
    }
    return Array.from(set);
  }, [shiftDuties]);

  // In-charge status for each operational area
  const areaIncharges = useMemo(() => {
    const map = new Map<number, { id: number; full_name: string }[]>();
    for (const g of shiftBlock.incharges || []) {
      map.set(g.operational_area_id, g.staff);
    }
    return map;
  }, [shiftBlock.incharges]);

  // Missing in-charges count
  const missingInchargeCount = useMemo(() => {
    let missing = 0;
    for (const area of activeAreas) {
      const list = areaIncharges.get(area.id) || [];
      if (list.length === 0) missing++;
    }
    return missing;
  }, [activeAreas, areaIncharges]);

  // Duties grouped by Operational Area
  const dutiesByArea = useMemo(() => {
    const groups = new Map<string, StaffDutyItem[]>();
    for (const d of shiftDuties) {
      const area = d.operational_area_name || "General Operations";
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area)!.push(d);
    }
    return groups;
  }, [shiftDuties]);

  // Unassigned staff list on this shift
  const unassignedStaffList = useMemo(() => {
    return assignments.filter((a) => {
      const list = staffDutyMap.get(a.staff_id) || [];
      return list.length === 0;
    });
  }, [assignments, staffDutyMap]);

  const startDateStr = formatShiftDate(shiftBlock.start_time);
  const endDateStr = formatShiftDate(shiftBlock.end_time);
  const dateStr =
    startDateStr === endDateStr ? startDateStr : `${startDateStr} – ${endDateStr}`;
  const duration = getShiftDuration(shiftBlock.start_time, shiftBlock.end_time);
  const timeStr = `${formatShiftTime(shiftBlock.start_time)} – ${formatShiftTime(
    shiftBlock.end_time
  )}${duration ? ` (${duration})` : ""}`;

  return (
    <div className="space-y-5" data-testid="shift-workspace">
      {/* TOP WORKSPACE NAVIGATION & HEADER */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 sm:p-5 space-y-4">
        {/* BREADCRUMB / BACK */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-heading font-extrabold text-gold hover:text-white transition-colors"
            data-testid="back-to-shifts-btn"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Shifts
          </button>

          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenManageStaff}
                  data-testid="workspace-manage-staff-btn"
                  className="h-7 text-xs font-bold"
                >
                  <Users className="h-3 w-3 mr-1 text-gold" /> Manage Roster
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenEditShift}
                  data-testid="workspace-edit-shift-btn"
                  className="h-7 text-xs font-bold"
                >
                  <Pencil className="h-3 w-3 mr-1 text-slate-300" /> Edit Shift
                </Button>
              </>
            )}
          </div>
        </div>

        {/* SHIFT TITLE & META */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-t border-white/10 pt-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-heading font-black uppercase tracking-widest text-gold">
                SHIFT WORKSPACE
              </span>
              <span
                className={cn(
                  "text-[10px] font-heading font-bold px-2 py-0.5 rounded uppercase",
                  shiftBlock.is_active
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-white/10 text-slate-300"
                )}
              >
                {shiftBlock.is_active ? "● ACTIVE NOW" : shiftBlock.derived_status}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-black text-white tracking-tight mt-0.5">
              {shiftBlock.name}
            </h1>
            <p className="text-xs text-slate-300 font-mono mt-1 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" /> {dateStr}
              </span>
              <span className="text-slate-500">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-gold" /> {timeStr}
              </span>
            </p>
          </div>

          {/* COVERAGE PILL */}
          <div className="rounded-lg bg-obsidian-950 border border-white/10 px-3.5 py-2 font-mono text-xs text-slate-200 flex items-center gap-2 self-start sm:self-end">
            <span className="font-bold text-white">{totalStaff} Staff</span>
            <span className="text-slate-600">·</span>
            <span className="font-bold text-emerald-400">
              {staffWithDutiesCount} With Duties
            </span>
            <span className="text-slate-600">·</span>
            <span
              className={cn(
                "font-bold",
                staffNeedingDuty > 0 ? "text-amber-400" : "text-slate-500"
              )}
            >
              {staffNeedingDuty} Need Duty
            </span>
          </div>
        </div>

        {/* WORKSPACE SUB-TABS: Overview | Staff | Duties | Tasks | In-Charges */}
        <div className="flex gap-1 border-t border-white/10 pt-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setWorkspaceTab("overview")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors shrink-0",
              workspaceTab === "overview"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="shift-tab-overview"
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab("staff")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors shrink-0 flex items-center gap-1.5",
              workspaceTab === "staff"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="shift-tab-staff"
          >
            <span>Staff</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                workspaceTab === "staff"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {totalStaff}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab("duties")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors shrink-0 flex items-center gap-1.5",
              workspaceTab === "duties"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="shift-tab-duties"
          >
            <span>Duties</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                workspaceTab === "duties"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {shiftDuties.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab("tasks")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors shrink-0 flex items-center gap-1.5",
              workspaceTab === "tasks"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="shift-tab-tasks"
          >
            <span>Tasks</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                workspaceTab === "tasks"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {shiftTasks.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab("incharges")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors shrink-0 flex items-center gap-1.5",
              workspaceTab === "incharges"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="shift-tab-incharges"
          >
            <span>In-Charges</span>
            {missingInchargeCount > 0 && (
              <span className="rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 text-[9px] font-mono font-bold">
                {missingInchargeCount} missing
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. OVERVIEW SUB-TAB                                                */}
      {/* ------------------------------------------------------------------ */}
      {workspaceTab === "overview" && (
        <div className="space-y-4" data-testid="shift-view-overview">
          {/* STATS TILES */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Shift Personnel
              </p>
              <p className="font-heading text-2xl font-black text-white">{totalStaff}</p>
              <p className="text-[11px] text-slate-400 font-mono">Assigned to this block</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Duties Allotted
              </p>
              <p className="font-heading text-2xl font-black text-emerald-400">
                {shiftDuties.length}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                {staffWithDutiesCount} / {totalStaff} staff covered
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Need Duty
              </p>
              <p
                className={cn(
                  "font-heading text-2xl font-black",
                  staffNeedingDuty > 0 ? "text-amber-400" : "text-slate-500"
                )}
              >
                {staffNeedingDuty}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                {staffNeedingDuty === 0 ? "All staff assigned" : "Awaiting duty allotment"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Tasks Assigned
              </p>
              <p className="font-heading text-2xl font-black text-cyan-400">
                {shiftTasks.length}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                {shiftTasks.filter((t) => t.status === "completed").length} completed
              </p>
            </div>
          </div>

          {/* SECONDARY ROW: OPERATIONAL AREAS & LEADERSHIP */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AREAS COVERED */}
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-heading font-black uppercase tracking-wider text-gold">
                  Operational Teams Active ({representedAreaNames.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWorkspaceTab("duties")}
                  className="h-6 text-[11px] px-2 font-bold"
                >
                  View Duties →
                </Button>
              </div>

              {representedAreaNames.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  No duties have been allotted under any operational team yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {representedAreaNames.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-white/5 border border-white/10 px-2.5 py-1 text-xs font-heading font-bold text-slate-200"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* IN-CHARGE COVERAGE STATUS */}
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-heading font-black uppercase tracking-wider text-gold">
                  Shift Leadership Coverage
                </h3>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenInchargesModal}
                    className="h-6 text-[11px] px-2 font-bold"
                  >
                    Manage In-Charges →
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {activeAreas.map((area) => {
                  const incharges = areaIncharges.get(area.id) || [];
                  const hasLeader = incharges.length > 0;
                  return (
                    <div
                      key={area.id}
                      className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0"
                    >
                      <span className="text-slate-300 font-medium">{area.name}</span>
                      {hasLeader ? (
                        <span className="font-mono text-emerald-400 text-[11px] font-bold">
                          {incharges.map((s) => s.full_name).join(", ")}
                        </span>
                      ) : (
                        <span className="text-amber-400 font-mono text-[11px] flex items-center gap-1 font-bold">
                          <AlertTriangle className="h-3 w-3" /> Missing In-Charge
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. STAFF SUB-TAB                                                   */}
      {/* ------------------------------------------------------------------ */}
      {workspaceTab === "staff" && (
        <div className="space-y-4" data-testid="shift-view-staff">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-heading font-bold text-white">
                Shift Personnel Roster ({assignments.length})
              </h2>
              <p className="text-xs text-slate-400 font-body">
                Staff members actively scheduled to work during this shift window.
              </p>
            </div>
            {canEdit && (
              <Button
                variant="gold"
                size="sm"
                onClick={onOpenManageStaff}
                data-testid="shift-staff-manage-roster-btn"
                className="h-8 text-xs font-bold"
              >
                <Users className="h-3.5 w-3.5 mr-1" /> Manage Shift Roster
              </Button>
            )}
          </div>

          {assignments.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No Staff Assigned to this Shift"
                hint="Click 'Manage Shift Roster' above to add personnel from your directory."
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignments.map((assignment) => {
                const duties = staffDutyMap.get(assignment.staff_id) || [];
                const hasDuties = duties.length > 0;

                return (
                  <div
                    key={assignment.id}
                    className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3 flex flex-col justify-between"
                  >
                    {/* STAFF CARD TOP */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-heading font-bold text-white text-sm">
                            {assignment.staff_name || `Staff #${assignment.staff_id}`}
                          </h4>
                          {assignment.staff_category && (
                            <Badge tone="gold" className="text-[9px] uppercase tracking-wider mt-0.5">
                              {assignment.staff_category}
                            </Badge>
                          )}
                        </div>
                        {assignment.staff_phone && (
                          <span className="text-[11px] font-mono text-slate-400">
                            {assignment.staff_phone}
                          </span>
                        )}
                      </div>

                      {/* CONCISE ASSIGNMENT INDICATION */}
                      <div className="rounded-lg bg-obsidian-950 p-2.5 border border-white/5 text-xs">
                        {hasDuties ? (
                          <div className="space-y-1.5">
                            {duties.map((d) => (
                              <div key={d.id} className="text-[11px] space-y-0.5">
                                <p className="font-heading font-bold text-white flex items-center gap-1">
                                  <span className="text-gold">
                                    {d.operational_area_name ? `${d.operational_area_name} · ` : ""}
                                  </span>
                                  {d.duty_type}
                                </p>
                                <p className="text-slate-400 flex items-center gap-1 font-mono">
                                  <MapPin className="h-2.5 w-2.5 text-emerald-400" />
                                  {d.location_name || d.room_name || "Operational Venue"}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[11px] font-bold">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>No duty assigned</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ACTION BUTTON */}
                    {canEdit && (
                      <div className="pt-2 border-t border-white/5 flex justify-end">
                        <Button
                          variant={hasDuties ? "outline" : "gold"}
                          size="sm"
                          onClick={() => onAssignDuty(assignment.staff_id)}
                          data-testid={`assign-duty-to-${assignment.staff_id}`}
                          className="h-7 text-xs font-bold"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {hasDuties ? "Add Another Duty" : "Assign Duty"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. DUTIES SUB-TAB (Grouped by Operational Area)                     */}
      {/* ------------------------------------------------------------------ */}
      {workspaceTab === "duties" && (
        <div className="space-y-5" data-testid="shift-view-duties">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-heading font-bold text-white">
                Operational Duties for this Shift ({shiftDuties.length})
              </h2>
              <p className="text-xs text-slate-400 font-body">
                Assigned duties organized by Operational Area with location and schedule checks.
              </p>
            </div>
            {canEdit && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => onAssignDuty()}
                data-testid="shift-add-duty-btn"
                className="h-8 text-xs font-bold self-start sm:self-auto"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Assign Duty
              </Button>
            )}
          </div>

          {/* UNASSIGNED STAFF CALLOUT */}
          {unassignedStaffList.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-300 font-heading font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Unassigned Staff on this Shift ({unassignedStaffList.length})</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {unassignedStaffList.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between bg-obsidian-900 border border-white/10 rounded-lg px-3 py-2 text-xs"
                  >
                    <span className="font-heading font-bold text-white truncate">
                      {a.staff_name || `Staff #${a.staff_id}`}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onAssignDuty(a.staff_id)}
                        className="text-gold font-bold hover:underline ml-2 text-[11px] shrink-0"
                      >
                        + Assign
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DUTIES GROUPED BY OPERATIONAL AREA */}
          {shiftDuties.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No Duties Assigned Yet"
                hint="Click '+ Assign Duty' to assign shift personnel to operational teams and venues."
              />
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(dutiesByArea.entries()).map(([areaName, duties]) => (
                <div
                  key={areaName}
                  className="rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden"
                >
                  {/* AREA HEADER */}
                  <div className="bg-white/5 border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
                    <span className="font-heading font-black text-xs uppercase tracking-widest text-gold">
                      {areaName}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {duties.length} {duties.length === 1 ? "duty" : "duties"}
                    </span>
                  </div>

                  {/* DUTIES LIST IN THIS AREA */}
                  <div className="divide-y divide-white/5">
                    {duties.map((d) => {
                      const overflow = formatOverflowMinutes(d.outside_shift_minutes);
                      return (
                        <div
                          key={d.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.01] transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-heading font-bold text-white text-sm">
                                {d.staff_name || `Staff #${d.staff_id}`}
                              </span>
                              <span className="text-slate-500">·</span>
                              <span className="font-bold text-gold text-xs">
                                {d.duty_type}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
                              <span className="flex items-center gap-1 text-emerald-400">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {d.location_name || d.room_name || "Operational Venue"}
                              </span>
                              <span className="flex items-center gap-1 text-slate-400">
                                <Clock className="h-3 w-3 shrink-0" />
                                {d.start_time && d.end_time
                                  ? `${formatShiftTime(d.start_time)} – ${formatShiftTime(
                                      d.end_time
                                    )}`
                                  : "All Shift"}
                              </span>
                              {d.warning && (
                                <span className="flex items-center gap-1 text-amber-400 font-bold">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  Outside Shift {overflow ? `(${overflow})` : ""}
                                </span>
                              )}
                            </div>

                            {d.notes && (
                              <p className="text-xs text-slate-400 italic font-body pt-0.5">
                                "{d.notes}"
                              </p>
                            )}
                          </div>

                          {canEdit && (
                            <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onEditDuty(d)}
                                data-testid={`edit-duty-${d.id}`}
                                title="Edit Duty"
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-300" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => onDeleteDuty(d.id)}
                                data-testid={`delete-duty-${d.id}`}
                                title="Delete Duty"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. TASKS SUB-TAB                                                   */}
      {/* ------------------------------------------------------------------ */}
      {workspaceTab === "tasks" && (
        <div className="space-y-4" data-testid="shift-view-tasks">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-heading font-bold text-white">
                Action Tasks for this Shift ({shiftTasks.length})
              </h2>
              <p className="text-xs text-slate-400 font-body">
                Checkpoints, deliveries, and operational actions tied to this shift window.
              </p>
            </div>
            {canEdit && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => onAddTask()}
                data-testid="shift-add-task-btn"
                className="h-8 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
              </Button>
            )}
          </div>

          {shiftTasks.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No Tasks for this Shift"
                hint="Add concrete action tasks for staff to execute during this shift."
              />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 divide-y divide-white/5 overflow-hidden">
              {shiftTasks.map((t) => {
                const isCompleted = t.status === "completed";
                return (
                  <div
                    key={t.id}
                    className="p-3.5 flex items-start justify-between gap-3 hover:bg-white/[0.01] transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => onToggleTask(t)}
                        className={cn(
                          "mt-0.5 h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0",
                          isCompleted
                            ? "bg-emerald-500 border-emerald-500 text-obsidian"
                            : "border-white/30 hover:border-gold"
                        )}
                        title={isCompleted ? "Mark pending" : "Mark completed"}
                      >
                        {isCompleted && <Check className="h-3 w-3 stroke-[3]" />}
                      </button>

                      <div className="space-y-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-heading font-bold truncate",
                            isCompleted ? "line-through text-slate-500" : "text-white"
                          )}
                        >
                          {t.title}
                        </p>

                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
                          {t.owner && (
                            <span className="flex items-center gap-1 text-slate-300">
                              <User className="h-3 w-3 text-gold" /> {t.owner}
                            </span>
                          )}
                          <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] uppercase font-bold text-slate-300">
                            {t.priority || "normal"}
                          </span>
                          {t.due_date && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="h-3 w-3" />
                              Due: {new Date(t.due_date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>

                        {t.description && (
                          <p className="text-xs text-slate-400 font-body">{t.description}</p>
                        )}
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEditTask(t)}
                          data-testid={`edit-task-${t.id}`}
                          title="Edit Task"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-300" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDeleteTask(t.id)}
                          data-testid={`delete-task-${t.id}`}
                          title="Delete Task"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. IN-CHARGES SUB-TAB (Coverage Matrix)                            */}
      {/* ------------------------------------------------------------------ */}
      {workspaceTab === "incharges" && (
        <div className="space-y-4" data-testid="shift-view-incharges">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-heading font-bold text-white">
                Operational Area In-Charge Matrix
              </h2>
              <p className="text-xs text-slate-400 font-body">
                Personnel assigned to lead each operational area during this shift.
              </p>
            </div>
            {canEdit && (
              <Button
                variant="gold"
                size="sm"
                onClick={onOpenInchargesModal}
                data-testid="shift-manage-incharges-btn"
                className="h-8 text-xs font-bold"
              >
                <Shield className="h-3.5 w-3.5 mr-1" /> Edit In-Charges
              </Button>
            )}
          </div>

          {/* MOBILE CARD VIEW (<lg) */}
          <div className="space-y-3 lg:hidden">
            {activeAreas.map((area) => {
              const incharges = areaIncharges.get(area.id) || [];
              const hasIncharge = incharges.length > 0;

              return (
                <div
                  key={area.id}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3"
                  data-testid={`shift-incharge-card-${area.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-heading font-bold text-white text-base">
                        {area.name}
                      </h4>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">
                        Code: <span className="text-slate-200">{area.code}</span>
                      </p>
                    </div>
                    {hasIncharge ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-emerald-400 font-bold font-mono text-[11px]">
                        <Check className="h-3 w-3 stroke-[3]" /> Covered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-amber-400 font-bold font-mono text-[11px]">
                        <AlertTriangle className="h-3 w-3" /> Not Assigned
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-heading uppercase tracking-wider text-slate-400">In-Charge(s)</p>
                    {hasIncharge ? (
                      <div className="flex flex-wrap gap-1.5">
                        {incharges.map((s) => (
                          <span
                            key={s.id}
                            className="rounded bg-gold/15 border border-gold/30 px-2.5 py-1 text-xs font-heading font-bold text-gold"
                          >
                            {s.full_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic text-xs font-mono">No in-charges designated yet</span>
                    )}
                  </div>

                  {canEdit && (
                    <div className="pt-2 border-t border-white/5 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onOpenInchargesModal}
                        data-testid={`incharge-edit-area-mobile-${area.id}`}
                        className="h-7 text-xs text-gold font-bold hover:bg-gold/10"
                      >
                        {hasIncharge ? "Edit In-Charges" : "Assign In-Charge"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* DESKTOP TABLE VIEW (>=lg) */}
          <div className="hidden lg:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/5 font-heading uppercase text-[10px] tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Operational Area</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">In-Charge(s)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-body">
                {activeAreas.map((area) => {
                  const incharges = areaIncharges.get(area.id) || [];
                  const hasIncharge = incharges.length > 0;

                  return (
                    <tr key={area.id} className="hover:bg-white/[0.01]">
                      <td className="px-4 py-3 font-heading font-bold text-white text-sm">
                        {area.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {area.code}
                      </td>
                      <td className="px-4 py-3">
                        {hasIncharge ? (
                          <div className="flex flex-wrap gap-1.5">
                            {incharges.map((s) => (
                              <span
                                key={s.id}
                                className="rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-xs font-heading font-bold text-gold"
                              >
                                {s.full_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic font-mono">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {hasIncharge ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-bold font-mono text-[11px]">
                            <Check className="h-3 w-3 stroke-[3]" /> Covered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-bold font-mono text-[11px]">
                            <AlertTriangle className="h-3 w-3" /> Not Assigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onOpenInchargesModal}
                            data-testid={`incharge-edit-area-${area.id}`}
                            className="h-6 text-xs text-gold font-bold hover:bg-gold/10"
                          >
                            {hasIncharge ? "Edit" : "Assign"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
