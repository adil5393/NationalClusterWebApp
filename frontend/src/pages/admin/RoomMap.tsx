import { useEffect, useState } from "react";
import { Download, BedDouble, Building, Layers, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BACKEND = import.meta.env.REACT_APP_BACKEND_URL ?? "";

interface Bed {
  id: number;
  label: string;
  occupant?: string | null;
}
interface LooseOccupant {
  name: string;
  count: number;
}
interface Room {
  id: number;
  name: string;
  capacity: number;
  beds: Bed[];
  loose: LooseOccupant[];
}
interface Floor {
  id: number;
  name: string;
  rooms: Room[];
}
interface Building {
  id: number;
  name: string;
  code?: string;
  floors: Floor[];
}

export default function RoomMap() {
  const [data, setData] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Building[]>("/accommodation/map")
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading visual room allocation map…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-room-map" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            FLOOR-BY-FLOOR OCCUPANCY
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Visual Room & Bed Map
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Bed-level diagram and loose group allocation visualizer across all hostel blocks.
          </p>
        </div>
        <a
          href={`${BACKEND}/api/export/rooms.csv`}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-heading font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-colors shrink-0"
          data-testid="export-rooms-btn"
        >
          <Download className="h-4 w-4 text-gold" /> Export Allocation CSV
        </a>
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState title="No buildings configured" hint="Add buildings, floors and rooms first." />
        </div>
      ) : (
        <div className="space-y-8">
          {data.map((b) => (
            <div key={b.id} data-testid={`map-building-${b.id}`} className="space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/10 pb-2">
                <Building className="h-5 w-5 text-gold" />
                <h2 className="font-heading text-lg sm:text-xl font-bold text-white tracking-tight">
                  {b.name} {b.code && <span className="text-xs text-slate-400 font-mono">({b.code})</span>}
                </h2>
              </div>

              {b.floors.map((f) => (
                <div key={f.id} className="space-y-3 pl-1 sm:pl-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-slate-400" />
                    <p className="text-xs font-heading font-bold uppercase tracking-wider text-slate-300">
                      {f.name}
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({f.rooms.length} Rooms)
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {f.rooms.map((r) => {
                      const filled =
                        r.beds.filter((x) => x.occupant).length +
                        r.loose.reduce((n, l) => n + l.count, 0);
                      const isFull = r.capacity > 0 && filled >= r.capacity;
                      const isOver = r.capacity > 0 && filled > r.capacity;

                      return (
                        <div
                          key={r.id}
                          className={`rounded-xl border p-4 shadow-sm transition-all ${
                            isOver
                              ? "border-red-500/40 bg-gradient-to-br from-red-500/10 via-obsidian-900 to-obsidian"
                              : isFull
                              ? "border-amber-500/30 bg-obsidian-900"
                              : "border-white/10 bg-obsidian-900/90"
                          }`}
                          data-testid={`map-room-${r.id}`}
                        >
                          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                            <span className="flex items-center gap-1.5 font-heading font-bold text-white text-sm">
                              <BedDouble className="h-4 w-4 text-gold" /> {r.name}
                            </span>
                            <span
                              className={cn(
                                "text-xs font-mono font-bold px-2 py-0.5 rounded",
                                isOver
                                  ? "bg-red-500/20 text-red-400"
                                  : isFull
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-white/5 text-emerald-400",
                              )}
                            >
                              {filled} / {r.capacity}
                            </span>
                          </div>

                          {/* BED BADGES */}
                          <div className="mt-3 grid grid-cols-3 gap-1.5">
                            {r.beds.map((bed) => (
                              <div
                                key={bed.id}
                                title={bed.occupant ? `Occupant: ${bed.occupant}` : "Free Bed"}
                                className={cn(
                                  "truncate rounded px-1.5 py-1 text-[10px] font-mono font-bold text-center transition-colors",
                                  bed.occupant
                                    ? "bg-gold/20 border border-gold/40 text-gold shadow-sm"
                                    : "bg-white/5 border border-white/5 text-slate-500",
                                )}
                              >
                                {bed.label}
                              </div>
                            ))}
                            {r.beds.length === 0 && (
                              <span className="col-span-3 text-[11px] text-slate-500 font-body italic">
                                No individual beds labelled
                              </span>
                            )}
                          </div>

                          {/* LOOSE CONTINGENTS */}
                          {r.loose.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1 pt-2 border-t border-white/5">
                              {r.loose.map((l, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 truncate max-w-full"
                                >
                                  {l.name}
                                  {l.count > 1 ? ` (${l.count})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
