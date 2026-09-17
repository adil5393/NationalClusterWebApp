import { useEffect, useState } from "react";
import { Download, BedDouble, Building, Layers, CheckCircle2, FileSpreadsheet, FileText, LayoutGrid, Table2 } from "lucide-react";
import { api, BASE_URL } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const BACKEND = BASE_URL;

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
  present: number;
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

interface RoomReportRow {
  room_id: number;
  building: string;
  floor: string;
  room: string;
  room_type: string | null;
  capacity: number;
  allotted: number;
  occupied: number;
  free: number;
  over_capacity: boolean;
}
interface RoomReportTotals {
  rooms: number;
  capacity: number;
  allotted: number;
  occupied: number;
  free: number;
  over_capacity_rooms: number;
}

export default function RoomMap() {
  const [data, setData] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"visual" | "table">("visual");
  const [reportRows, setReportRows] = useState<RoomReportRow[]>([]);
  const [reportTotals, setReportTotals] = useState<RoomReportTotals | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Building[]>("/accommodation/map"),
      api.get<{ rows: RoomReportRow[]; totals: RoomReportTotals }>("/accommodation/room-map-report"),
    ])
      .then(([map, report]) => {
        setData(map.data);
        setReportRows(report.data.rows);
        setReportTotals(report.data.totals);
      })
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
          <p className="mt-1 text-[11px] text-slate-500 font-mono">
            Badge shows Capacity / Allotted / Present
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <a
            href={`${BACKEND}/api/export/rooms-detailed.csv`}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-heading font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
            data-testid="export-rooms-btn"
          >
            <Download className="h-4 w-4 text-slate-400" /> Export CSV
          </a>
          <a
            href={`${BACKEND}/api/export/rooms-detailed.xlsx`}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-heading font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            data-testid="export-rooms-xlsx-btn"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Export XLSX
          </a>
          <a
            href={`${BACKEND}/api/export/rooms-detailed.pdf`}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-heading font-bold text-red-300 hover:bg-red-500/20 transition-colors"
            data-testid="export-rooms-pdf-btn"
          >
            <FileText className="h-4 w-4 text-red-400" /> Export PDF
          </a>
        </div>
      </div>

      {/* VIEW TOGGLE */}
      <div className="flex gap-2" data-testid="room-map-view-tabs">
        <button
          onClick={() => setViewMode("visual")}
          data-testid="room-map-view-visual"
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
            viewMode === "visual" ? "bg-gold text-obsidian-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Visual Map
        </button>
        <button
          onClick={() => setViewMode("table")}
          data-testid="room-map-view-table"
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
            viewMode === "table" ? "bg-gold text-obsidian-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <Table2 className="h-3.5 w-3.5" /> Detailed Report
        </button>
      </div>

      {viewMode === "table" ? (
        <div className="space-y-4" data-testid="room-map-detailed-report">
          {reportTotals && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Total Rooms", value: reportTotals.rooms },
                { label: "Total Capacity", value: reportTotals.capacity },
                { label: "Allotted", value: reportTotals.allotted },
                { label: "Occupied", value: reportTotals.occupied },
                { label: "Free", value: reportTotals.free },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border border-white/10 bg-obsidian-900 p-3">
                  <p className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-400">
                    {k.label}
                  </p>
                  <p className="mt-1 text-xl font-black font-heading text-white">{k.value}</p>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Building</TH>
                  <TH>Floor</TH>
                  <TH>Room</TH>
                  <TH>Room Type</TH>
                  <TH className="text-right">Capacity</TH>
                  <TH className="text-right">Allotted</TH>
                  <TH className="text-right">Occupied</TH>
                  <TH className="text-right">Free</TH>
                </TR>
              </THead>
              <TBody>
                {reportRows.map((r) => (
                  <TR key={r.room_id} data-testid={`room-report-row-${r.room_id}`}>
                    <TD className="text-xs text-white font-bold">{r.building}</TD>
                    <TD className="text-xs text-slate-300">{r.floor}</TD>
                    <TD className="text-xs text-slate-300 font-mono">{r.room}</TD>
                    <TD className="text-xs text-slate-400">{r.room_type || "—"}</TD>
                    <TD className="text-right text-xs font-mono text-slate-300">{r.capacity}</TD>
                    <TD className="text-right text-xs font-mono text-slate-300">{r.allotted}</TD>
                    <TD className="text-right text-xs font-mono text-slate-300">{r.occupied}</TD>
                    <TD className="text-right text-xs font-mono">
                      {r.over_capacity ? (
                        <Badge tone="red" size="sm">
                          Over Capacity
                        </Badge>
                      ) : (
                        <span className="text-emerald-400 font-bold">{r.free}</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      ) : data.length === 0 ? (
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
                              title={`Capacity ${r.capacity} / Allotted ${filled} / Present ${r.present}`}
                              className={cn(
                                "text-xs font-mono font-bold px-2 py-0.5 rounded",
                                isOver
                                  ? "bg-red-500/20 text-red-400"
                                  : isFull
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-white/5 text-emerald-400",
                              )}
                            >
                              {r.capacity}/{filled}/{r.present}
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
