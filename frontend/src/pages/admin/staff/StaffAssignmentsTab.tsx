import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  Check,
  User,
  Briefcase,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { formatOverflowMinutes } from "@/lib/meta";
import {
  StaffMember,
  ShiftBlockItem,
  StaffDutyItem,
  StaffTaskItem,
  OperationalAreaItem,
  formatShiftTime,
  formatShiftDate,
} from "./types";

interface StaffAssignmentsTabProps {
  duties: StaffDutyItem[];
  tasks: StaffTaskItem[];
  allStaff: StaffMember[];
  shiftBlocks: ShiftBlockItem[];
  operationalAreas: OperationalAreaItem[];
  canEdit: boolean;
  onOpenAssignDuty: () => void;
  onEditDuty: (duty: StaffDutyItem) => void;
  onDeleteDuty: (dutyId: number) => void;
  onOpenAddTask: () => void;
  onEditTask: (task: StaffTaskItem) => void;
  onToggleTask: (task: StaffTaskItem) => void;
  onDeleteTask: (taskId: number) => void;
}

export function StaffAssignmentsTab({
  duties,
  tasks,
  allStaff,
  shiftBlocks,
  operationalAreas,
  canEdit,
  onOpenAssignDuty,
  onEditDuty,
  onDeleteDuty,
  onOpenAddTask,
  onEditTask,
  onToggleTask,
  onDeleteTask,
}: StaffAssignmentsTabProps) {
  const [assignmentSubTab, setAssignmentSubTab] = useState<"duties" | "tasks">("duties");

  // Filters
  const [search, setSearch] = useState("");
  const [filterShiftId, setFilterShiftId] = useState<string>("ALL");
  const [filterAreaId, setFilterAreaId] = useState<string>("ALL");
  const [filterWarning, setFilterWarning] = useState<"ALL" | "WARNING" | "NORMAL">("ALL");

  // Staff lookup map
  const staffMap = useMemo(() => {
    const map = new Map<number, StaffMember>();
    for (const s of allStaff) map.set(s.id, s);
    return map;
  }, [allStaff]);

  // Shift block lookup map
  const shiftBlockMap = useMemo(() => {
    const map = new Map<number, ShiftBlockItem>();
    for (const b of shiftBlocks) map.set(b.id, b);
    return map;
  }, [shiftBlocks]);

  // Filtered duties
  const filteredDuties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return duties.filter((d) => {
      const matchesSearch =
        !q ||
        (d.staff_name && d.staff_name.toLowerCase().includes(q)) ||
        (d.duty_type && d.duty_type.toLowerCase().includes(q)) ||
        (d.location_name && d.location_name.toLowerCase().includes(q)) ||
        (d.room_name && d.room_name.toLowerCase().includes(q)) ||
        (d.shift_name && d.shift_name.toLowerCase().includes(q)) ||
        (d.notes && d.notes.toLowerCase().includes(q));

      const matchesShift =
        filterShiftId === "ALL" ||
        (d.shift_id && String(d.shift_id) === filterShiftId) ||
        (d.shift_name && shiftBlocks.find((b) => String(b.id) === filterShiftId)?.name === d.shift_name);

      const matchesArea =
        filterAreaId === "ALL" ||
        (d.operational_area_id && String(d.operational_area_id) === filterAreaId);

      const matchesWarning =
        filterWarning === "ALL" ||
        (filterWarning === "WARNING" && Boolean(d.warning)) ||
        (filterWarning === "NORMAL" && !d.warning);

      return matchesSearch && matchesShift && matchesArea && matchesWarning;
    });
  }, [duties, search, filterShiftId, filterAreaId, filterWarning, shiftBlocks]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.owner && t.owner.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q));

      const matchesShift =
        filterShiftId === "ALL" ||
        (t.shift_id && String(t.shift_id) === filterShiftId);

      return matchesSearch && matchesShift;
    });
  }, [tasks, search, filterShiftId]);

  return (
    <div className="space-y-4" data-testid="staff-assignments-tab">
      {/* HEADER WITH SUB-TABS (Duties vs Tasks) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAssignmentSubTab("duties")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors",
              assignmentSubTab === "duties"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-assignment-duties"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Duties</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.2 text-[10px] font-mono",
                assignmentSubTab === "duties"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {duties.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAssignmentSubTab("tasks")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-colors",
              assignmentSubTab === "tasks"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-assignment-tasks"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>Tasks</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.2 text-[10px] font-mono",
                assignmentSubTab === "tasks"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {tasks.length}
            </span>
          </button>
        </div>

        {/* TOP ACTION BUTTON */}
        {canEdit && (
          <div>
            {assignmentSubTab === "duties" ? (
              <Button
                variant="gold"
                size="sm"
                onClick={onOpenAssignDuty}
                data-testid="assignments-add-duty-btn"
                className="h-8 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Assign Duty
              </Button>
            ) : (
              <Button
                variant="gold"
                size="sm"
                onClick={onOpenAddTask}
                data-testid="assignments-add-task-btn"
                className="h-8 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
              </Button>
            )}
          </div>
        )}
      </div>

      {/* FILTER BAR */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder={
                assignmentSubTab === "duties"
                  ? "Search by staff, duty type, venue, room…"
                  : "Search tasks by title, assignee, category…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="assignment-search-input"
            />
          </div>

          {/* SHIFT FILTER */}
          <Select
            value={filterShiftId}
            onChange={(e) => setFilterShiftId(e.target.value)}
            className="h-9 text-xs sm:w-48"
          >
            <option value="ALL">All Shifts</option>
            {shiftBlocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({formatShiftDate(b.start_time)})
              </option>
            ))}
          </Select>

          {/* AREA FILTER (Only for duties) */}
          {assignmentSubTab === "duties" && (
            <Select
              value={filterAreaId}
              onChange={(e) => setFilterAreaId(e.target.value)}
              className="h-9 text-xs sm:w-48"
            >
              <option value="ALL">All Operational Areas</option>
              {operationalAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}

          {/* WARNING FILTER (Only for duties) */}
          {assignmentSubTab === "duties" && (
            <Select
              value={filterWarning}
              onChange={(e) => setFilterWarning(e.target.value as any)}
              className="h-9 text-xs sm:w-40"
            >
              <option value="ALL">All Statuses</option>
              <option value="WARNING">With Warnings</option>
              <option value="NORMAL">Normal / Within Shift</option>
            </Select>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* DUTIES VIEW                                                        */}
      {/* ------------------------------------------------------------------ */}
      {assignmentSubTab === "duties" && (
        <>
          {filteredDuties.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No Duties Found"
                hint="No duty records match your selected filters. Adjust your search or assign new duties."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* MOBILE: CARD LIST */}
              <div className="grid gap-2.5 sm:gap-3 lg:hidden">
                {filteredDuties.map((d) => {
                  const overflow = formatOverflowMinutes(d.outside_shift_minutes);
                  return (
                    <div
                      key={d.id}
                      data-testid={`duty-card-${d.id}`}
                      className="rounded-xl border border-white/10 bg-obsidian-900/90 p-3.5 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0">
                          <h3 className="font-heading font-bold text-white text-sm truncate">
                            {d.staff_name || `Staff #${d.staff_id}`}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="rounded bg-gold/15 border border-gold/30 px-1.5 py-0.5 text-xs font-heading font-bold text-gold">
                              {d.duty_type}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {d.operational_area_name || "General"}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {d.warning ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-400">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              Outside shift {overflow ? `(${overflow})` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                              <Check className="h-3 w-3 stroke-[3]" /> Active
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-slate-300 pt-0.5">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {d.location_name || d.room_name || "Operational Venue"}
                        </span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="h-3 w-3 shrink-0" />
                          {d.start_time && d.end_time
                            ? `${formatShiftTime(d.start_time)} – ${formatShiftTime(d.end_time)}`
                            : "All Day"}
                        </span>
                        {d.shift_name && (
                          <span className="text-slate-500">
                            Shift: {d.shift_name}
                          </span>
                        )}
                      </div>

                      {d.notes && (
                        <p className="text-[11px] text-slate-400 italic font-body">
                          "{d.notes}"
                        </p>
                      )}

                      {canEdit && (
                        <div className="border-t border-white/10 pt-2 flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditDuty(d)}
                            data-testid={`edit-assignment-duty-mobile-${d.id}`}
                            className="h-8 text-xs font-bold"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1 text-slate-300" /> Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => onDeleteDuty(d.id)}
                            data-testid={`delete-assignment-duty-mobile-${d.id}`}
                            className="h-8 text-xs font-bold"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP: TABLE */}
              <div className="hidden lg:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden">
                <Table>
                  <THead>
                    <TR>
                      <TH>Staff Member</TH>
                      <TH>Shift</TH>
                      <TH>Operational Area</TH>
                      <TH>Specific Duty</TH>
                      <TH>Location</TH>
                      <TH>Time Window</TH>
                      <TH>Status</TH>
                      {canEdit && <TH className="text-right">Actions</TH>}
                    </TR>
                  </THead>
                  <TBody>
                    {filteredDuties.map((d) => {
                      const overflow = formatOverflowMinutes(d.outside_shift_minutes);
                      return (
                        <TR key={d.id} className="hover:bg-white/[0.01]">
                          {/* STAFF */}
                          <TD className="font-heading font-bold text-white text-xs">
                            {d.staff_name || `Staff #${d.staff_id}`}
                          </TD>

                          {/* SHIFT */}
                          <TD className="text-xs font-mono text-slate-300">
                            {d.shift_name || "Cross-Shift"}
                          </TD>

                          {/* OPERATIONAL AREA */}
                          <TD>
                            <span className="font-heading font-bold text-gold text-xs">
                              {d.operational_area_name || "General"}
                            </span>
                          </TD>

                          {/* SPECIFIC DUTY */}
                          <TD className="text-xs text-slate-200 font-bold">
                            {d.duty_type}
                          </TD>

                          {/* LOCATION */}
                          <TD>
                            <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {d.location_name || d.room_name || "Operational Venue"}
                            </span>
                          </TD>

                          {/* TIME */}
                          <TD className="text-xs font-mono text-slate-300">
                            {d.start_time && d.end_time
                              ? `${formatShiftTime(d.start_time)} – ${formatShiftTime(d.end_time)}`
                              : "All Day"}
                          </TD>

                          {/* STATUS / WARNING */}
                          <TD>
                            {d.warning ? (
                              <span className="inline-flex items-center gap-1 text-amber-400 font-mono text-[11px] font-bold">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                Outside shift {overflow ? `(${overflow})` : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                                <Check className="h-3 w-3 stroke-[3]" /> Active
                              </span>
                            )}
                          </TD>

                          {/* ACTIONS */}
                          {canEdit && (
                            <TD className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => onEditDuty(d)}
                                  data-testid={`edit-assignment-duty-${d.id}`}
                                  title="Edit Duty"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-slate-300" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => onDeleteDuty(d.id)}
                                  data-testid={`delete-assignment-duty-${d.id}`}
                                  title="Delete Duty"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                                </Button>
                              </div>
                            </TD>
                          )}
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TASKS VIEW                                                         */}
      {/* ------------------------------------------------------------------ */}
      {assignmentSubTab === "tasks" && (
        <>
          {filteredTasks.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No Tasks Found"
                hint="No action tasks match your current filters. Add tasks to allocate checkpoints."
              />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 divide-y divide-white/5 overflow-hidden">
              {filteredTasks.map((t) => {
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
                          <span className="text-slate-500">·</span>
                          <span>{t.category}</span>
                          {t.due_date && (
                            <>
                              <span className="text-slate-500">·</span>
                              <span className="flex items-center gap-1 text-slate-400">
                                <Clock className="h-3 w-3" />
                                {new Date(t.due_date).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                })}{" "}
                                {new Date(t.due_date).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </>
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
                          data-testid={`edit-assignment-task-${t.id}`}
                          title="Edit Task"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-300" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDeleteTask(t.id)}
                          data-testid={`delete-assignment-task-${t.id}`}
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
        </>
      )}
    </div>
  );
}
