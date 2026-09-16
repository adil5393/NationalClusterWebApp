import { useMemo } from "react";
import {
  Clock,
  Calendar,
  Users,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import {
  ShiftBlockItem,
  StaffDutyItem,
  formatShiftDate,
  formatShiftTime,
  getShiftDuration,
} from "./types";

interface StaffShiftsTabProps {
  shiftBlocks: ShiftBlockItem[];
  allDuties: StaffDutyItem[];
  canEdit: boolean;
  onOpenCreateShift: () => void;
  onOpenEditShift: (block: ShiftBlockItem) => void;
  onDeleteShiftBlock: (id: number) => void;
  onManageStaff: (block: ShiftBlockItem) => void;
  onOpenShiftWorkspace: (block: ShiftBlockItem) => void;
}

export function StaffShiftsTab({
  shiftBlocks,
  allDuties,
  canEdit,
  onOpenCreateShift,
  onOpenEditShift,
  onDeleteShiftBlock,
  onManageStaff,
  onOpenShiftWorkspace,
}: StaffShiftsTabProps) {
  // Precompute coverage stats for each block
  const shiftCoverage = useMemo(() => {
    const map = new Map<
      number,
      { totalStaff: number; withDuties: number; needDuty: number }
    >();

    for (const block of shiftBlocks) {
      const assignments = block.staff_assignments || [];
      const totalStaff = assignments.length || block.staff_count || 0;

      let withDuties = 0;
      for (const a of assignments) {
        // Staff has duty if present in assignment.duties or allDuties matching this shift assignment id
        const hasDuty =
          (a.duties && a.duties.length > 0) ||
          allDuties.some((d) => d.shift_id === a.id);
        if (hasDuty) withDuties++;
      }

      const needDuty = Math.max(0, totalStaff - withDuties);
      map.set(block.id, { totalStaff, withDuties, needDuty });
    }

    return map;
  }, [shiftBlocks, allDuties]);

  const activeNowCount = useMemo(
    () => shiftBlocks.filter((b) => b.is_active).length,
    [shiftBlocks]
  );

  return (
    <div className="space-y-4" data-testid="staff-shifts-tab">
      {/* SHIFT OVERVIEW METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Shift Blocks
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-white">
            {shiftBlocks.length}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Active Shifts Now
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">
            {activeNowCount}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
              Actions
            </p>
          </div>
          {canEdit && (
            <Button
              variant="gold"
              size="sm"
              onClick={onOpenCreateShift}
              data-testid="schedule-shift-top-btn"
              className="h-8 text-xs font-bold w-full mt-1"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Schedule New Shift
            </Button>
          )}
        </div>
      </div>

      {/* SHIFTS GRID */}
      {shiftBlocks.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No Shift Blocks Created"
            hint="Create common workforce shift blocks to schedule your staff across event days."
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shiftBlocks.map((block) => {
            const startDateStr = formatShiftDate(block.start_time);
            const endDateStr = formatShiftDate(block.end_time);
            const dateStr =
              startDateStr === endDateStr ? startDateStr : `${startDateStr} – ${endDateStr}`;
            const duration = getShiftDuration(block.start_time, block.end_time);
            const timeStr = `${formatShiftTime(block.start_time)} – ${formatShiftTime(
              block.end_time
            )}${duration ? ` (${duration})` : ""}`;
            const isNow = block.is_active;

            const coverage = shiftCoverage.get(block.id) || {
              totalStaff: 0,
              withDuties: 0,
              needDuty: 0,
            };

            return (
              <div
                key={block.id}
                data-testid={`shift-block-card-${block.id}`}
                className={cn(
                  "rounded-xl border bg-obsidian-900 p-4 flex flex-col justify-between space-y-4 transition-all hover:border-gold/40 shadow-sm",
                  isNow
                    ? "border-emerald-500/40 shadow-emerald-500/5 shadow-md"
                    : "border-white/10"
                )}
              >
                {/* CARD HEADER */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-heading font-black uppercase tracking-widest text-gold block">
                        WORKFORCE SHIFT
                      </span>
                      <h3 className="font-heading font-black text-white text-base tracking-wide mt-0.5">
                        {block.name}
                      </h3>
                    </div>

                    <span
                      className={cn(
                        "text-[10px] font-heading font-extrabold px-2 py-0.5 rounded uppercase tracking-wider shrink-0",
                        isNow
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : block.derived_status === "COMPLETED"
                          ? "bg-white/10 text-slate-400"
                          : block.derived_status === "CANCELLED"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-gold/15 text-gold border border-gold/30"
                      )}
                    >
                      {isNow ? "● ON SHIFT" : block.derived_status}
                    </span>
                  </div>

                  {/* DATE & TIME */}
                  <div className="text-xs text-slate-300 font-mono space-y-1">
                    <p className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{dateStr}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-gold shrink-0" />
                      <span>{timeStr}</span>
                    </p>
                  </div>

                  {block.notes && (
                    <p className="text-xs text-slate-400 italic bg-white/5 rounded px-2.5 py-1.5 font-body line-clamp-2">
                      "{block.notes}"
                    </p>
                  )}
                </div>

                {/* COVERAGE SUMMARY PILL */}
                <div className="rounded-lg bg-obsidian-950/70 border border-white/5 p-2.5">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400 font-heading uppercase font-bold">
                        Staff
                      </p>
                      <p className="text-sm font-heading font-black text-white">
                        {coverage.totalStaff}
                      </p>
                    </div>
                    <div className="border-x border-white/5">
                      <p className="text-[10px] text-slate-400 font-heading uppercase font-bold">
                        With Duties
                      </p>
                      <p className="text-sm font-heading font-black text-emerald-400">
                        {coverage.withDuties}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-heading uppercase font-bold">
                        Need Duty
                      </p>
                      <p
                        className={cn(
                          "text-sm font-heading font-black",
                          coverage.needDuty > 0 ? "text-amber-400" : "text-slate-500"
                        )}
                      >
                        {coverage.needDuty}
                      </p>
                    </div>
                  </div>
                </div>

                {/* CARD FOOTER ACTIONS */}
                <div className="flex items-center justify-between border-t border-white/10 pt-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onOpenEditShift(block)}
                          data-testid={`edit-shift-block-${block.id}`}
                          title="Edit Shift"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-300" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDeleteShiftBlock(block.id)}
                          data-testid={`delete-shift-block-${block.id}`}
                          title="Delete Shift"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onManageStaff(block)}
                          data-testid={`manage-staff-card-${block.id}`}
                          className="h-7 text-xs px-2 font-bold"
                          title="Assign or remove staff"
                        >
                          <Users className="h-3 w-3 mr-1 text-gold" />
                          Roster
                        </Button>
                      </>
                    )}
                  </div>

                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => onOpenShiftWorkspace(block)}
                    data-testid={`open-shift-${block.id}`}
                    className="h-7 text-xs px-3 font-black"
                  >
                    Open Shift <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
