import { useEffect, useState } from "react";
import { Download, BedDouble } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

const BACKEND = import.meta.env.REACT_APP_BACKEND_URL ?? "";

interface Bed { id: number; label: string; occupant?: string | null }
interface Room { id: number; name: string; capacity: number; beds: Bed[]; loose: string[] }
interface Floor { id: number; name: string; rooms: Room[] }
interface Building { id: number; name: string; code?: string; floors: Floor[] }

export default function RoomMap() {
  const [data, setData] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Building[]>("/accommodation/map").then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading room map…" />;

  return (
    <div data-testid="admin-room-map">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Room Map</h1>
          <p className="mt-1 text-sm text-slate-500">A visual bed-by-bed view of who sleeps where.</p>
        </div>
        <a href={`${BACKEND}/api/export/rooms.csv`} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" data-testid="export-rooms-btn">
          <Download className="h-4 w-4" /> Export Allocation
        </a>
      </div>

      {data.length === 0 && <div className="mt-6"><EmptyState title="No buildings yet" hint="Add buildings, rooms and beds first." /></div>}

      <div className="mt-6 space-y-8">
        {data.map((b) => (
          <div key={b.id} data-testid={`map-building-${b.id}`}>
            <h2 className="font-heading text-lg font-bold text-slate-950">{b.name}</h2>
            {b.floors.map((f) => (
              <div key={f.id} className="mt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{f.name}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {f.rooms.map((r) => {
                    const filled = r.beds.filter((x) => x.occupant).length + r.loose.length;
                    return (
                      <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4" data-testid={`map-room-${r.id}`}>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-heading font-bold text-slate-900"><BedDouble className="h-4 w-4 text-slate-400" /> {r.name}</span>
                          <span className={cn("text-xs font-bold", filled >= r.capacity && r.capacity ? "text-red-500" : "text-slate-500")}>{filled}/{r.capacity}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          {r.beds.map((bed) => (
                            <div key={bed.id} title={bed.occupant ?? "Free"} className={cn("truncate rounded px-1.5 py-1 text-[10px] font-semibold", bed.occupant ? "bg-coral text-white" : "bg-slate-100 text-slate-400")}>
                              {bed.label}
                            </div>
                          ))}
                          {r.beds.length === 0 && <span className="col-span-3 text-[11px] text-slate-400">No beds labelled</span>}
                        </div>
                        {r.loose.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.loose.map((n, i) => <span key={i} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{n}</span>)}
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
    </div>
  );
}
