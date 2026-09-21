import { useState, useMemo } from "react";
import {
  Shield,
  AlertTriangle,
  Check,
  Clock,
  Calendar,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import {
  ShiftBlockItem,
  OperationalAreaItem,
  formatShiftDate,
  formatShiftTime,
} from "./types";

interface StaffInchargesTabProps {
  shiftBlocks: ShiftBlockItem[];
  operationalAreas: OperationalAreaItem[];
  canEdit: boolean;
  onOpenManageIncharges: (block: ShiftBlockItem) => void;
}

export function StaffInchargesTab({
  shiftBlocks,
  operationalAreas,
  canEdit,
  onOpenManageIncharges,
}: StaffInchargesTabProps) {
  const [selectedShiftId, setSelectedShiftId] = useState<string>(
    shiftBlocks.length > 0 ? String(shiftBlocks[0].id) : ""
  );

  const selectedShiftBlock = useMemo(() => {
    return shiftBlocks.find((b) => String(b.id) === selectedShiftId) || null;
  }, [shiftBlocks, selectedShiftId]);

  const activeAreas = useMemo(() => {
    return operationalAreas.filter((a) => a.is_active);
  }, [operationalAreas]);

  // Map of areaId -> assigned incharge staff for this shift
  const areaIncharges = useMemo(() => {
    const map = new Map<number, { id: number; full_name: string }[]>();
    if (!selectedShiftBlock) return map;
    for (const g of selectedShiftBlock.incharges || []) {
      map.set(g.operational_area_id, g.staff);
    }
    return map;
  }, [selectedShiftBlock]);

  // Summary counts
  const totalAreas = activeAreas.length;
  const coveredAreas = useMemo(() => {
    let count = 0;
    for (const a of activeAreas) {
      if ((areaIncharges.get(a.id) || []).length > 0) count++;
    }
    return count;
  }, [activeAreas, areaIncharges]);

  const missingAreas = totalAreas - coveredAreas;

  return (
    <div className="space-y-4" data-testid="staff-incharges-tab">
      {/* SHIFT SELECTOR HEADER */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-heading font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Shield className="h-4 w-4 text-gold" />
              <span>Event-Wide Operational Area Leadership</span>
            </h2>
            <p className="text-xs text-slate-400 font-body">
              Select any shift below to inspect and manage who is in charge of each operational team.
            </p>
          </div>

          {/* SHIFT DROPDOWN */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-heading font-bold text-slate-300 shrink-0">
              Shift:
            </label>
            <Select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="h-9 text-xs sm:w-64 font-mono font-bold"
              data-testid="incharges-shift-selector"
            >
              {shiftBlocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({formatShiftDate(b.start_time)})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* COVERAGE STATUS BAR */}
        {selectedShiftBlock && (
          <div className="border-t border-white/10 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 font-mono">
              <span className="flex items-center gap-1 text-slate-300">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                {formatShiftDate(selectedShiftBlock.start_time)}
              </span>
              <span className="flex items-center gap-1 text-gold">
                <Clock className="h-3.5 w-3.5" />
                {formatShiftTime(selectedShiftBlock.start_time)} – {formatShiftTime(selectedShiftBlock.end_time)}
              </span>
              <span className="flex items-center gap-1 text-slate-300">
                <Users className="h-3.5 w-3.5 text-slate-500" />
                {selectedShiftBlock.staff_count ?? (selectedShiftBlock.staff_assignments?.length || 0)} Staff on Shift
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                {coveredAreas} Covered
              </span>
              {missingAreas > 0 ? (
                <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {missingAreas} Not Assigned
                </span>
              ) : (
                <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                  Full Coverage
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MATRIX TABLE */}
      {!selectedShiftBlock ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No Shift Selected"
            hint="Create a shift block first to manage operational in-charges."
          />
        </div>
      ) : activeAreas.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No Operational Areas Created"
            hint="Create operational areas first from Duties & Locations."
          />
        </div>
      ) : (
        <>
          {/* MOBILE: CARD LIST */}
          <div className="grid gap-2.5 sm:gap-3 lg:hidden">
            {activeAreas.map((area) => {
              const incharges = areaIncharges.get(area.id) || [];
              const hasIncharge = incharges.length > 0;

              return (
                <div
                  key={area.id}
                  data-testid={`incharges-area-card-${area.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900/90 p-3.5 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gold text-xs font-bold rounded bg-gold/10 border border-gold/20 px-1.5 py-0.5">
                          {area.code}
                        </span>
                        <h3 className="font-heading font-black text-white text-sm truncate">
                          {area.name}
                        </h3>
                      </div>
                      {area.description && (
                        <p className="text-[11px] text-slate-400 font-body mt-1">
                          {area.description}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      {hasIncharge ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold font-mono text-emerald-400">
                          <Check className="h-3 w-3 stroke-[3]" /> Covered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold font-mono text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> Unassigned
                        </span>
                      )}
                    </div>
                  </div>

                  {/* INCHARGES LIST */}
                  <div className="pt-0.5">
                    <p className="text-[10px] uppercase tracking-wider font-heading font-bold text-slate-400 mb-1">
                      Assigned In-Charge:
                    </p>
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
                      <span className="text-slate-500 text-xs italic font-mono">No personnel assigned</span>
                    )}
                  </div>

                  {canEdit && (
                    <div className="border-t border-white/10 pt-2 flex justify-end">
                      <Button
                        variant={hasIncharge ? "outline" : "gold"}
                        size="sm"
                        onClick={() => onOpenManageIncharges(selectedShiftBlock)}
                        data-testid={`incharges-assign-btn-mobile-${area.id}`}
                        className="h-8 text-xs font-bold"
                      >
                        {hasIncharge ? "Edit Leadership" : "Assign In-Charge"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* DESKTOP TABLE */}
          <div className="hidden lg:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/5 font-heading uppercase text-[10px] tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Operational Area</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Assigned In-Charge(s)</th>
                  <th className="px-4 py-3">Coverage Status</th>
                  {canEdit && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-body">
                {activeAreas.map((area) => {
                  const incharges = areaIncharges.get(area.id) || [];
                  const hasIncharge = incharges.length > 0;

                  return (
                    <tr key={area.id} className="hover:bg-white/[0.01]">
                      <td className="px-4 py-3.5">
                        <span className="font-heading font-black text-white text-sm block">
                          {area.name}
                        </span>
                        {area.description && (
                          <span className="text-[11px] text-slate-400 font-body">
                            {area.description}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 font-mono text-gold text-xs font-bold">
                        {area.code}
                      </td>

                      <td className="px-4 py-3.5">
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

                      <td className="px-4 py-3.5">
                        {hasIncharge ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-bold font-mono text-[11px]">
                            <Check className="h-3.5 w-3.5 stroke-[3]" /> Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-bold font-mono text-[11px]">
                            <AlertTriangle className="h-3.5 w-3.5" /> ⚠ Not Assigned
                          </span>
                        )}
                      </td>

                      {canEdit && (
                        <td className="px-4 py-3.5 text-right">
                          <Button
                            variant={hasIncharge ? "outline" : "gold"}
                            size="sm"
                            onClick={() => onOpenManageIncharges(selectedShiftBlock)}
                            data-testid={`incharges-assign-btn-${area.id}`}
                            className="h-7 text-xs font-bold"
                          >
                            {hasIncharge ? "Edit" : "Assign"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
