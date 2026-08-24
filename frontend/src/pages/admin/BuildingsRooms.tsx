import { useEffect, useState } from "react";
import { Plus, Trash2, Building2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess } from "@/lib/permissions";

interface Room { id: number; name: string; capacity?: number; room_type?: string }
interface Floor { id: number; name: string; level?: number; rooms: Room[] }
interface Building { id: number; name: string; code?: string; floors: Floor[] }

export default function BuildingsRooms() {
  const { canEdit } = useModuleAccess("buildings");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [dialog, setDialog] = useState<null | { kind: "building" | "floor" | "room"; parentId?: number }>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    api.get<Building[]>("/buildings").then((r) => setBuildings(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openDialog = (kind: "building" | "floor" | "room", parentId?: number) => {
    setForm({});
    setDialog({ kind, parentId });
  };

  const save = async () => {
    const { kind, parentId } = dialog!;
    if (!form.name?.trim()) return toast.error("Name is required");
    try {
      if (kind === "building") await api.post("/buildings", { name: form.name, code: form.code });
      else if (kind === "floor") await api.post(`/buildings/${parentId}/floors`, { name: form.name, level: Number(form.level) || 0 });
      else await api.post(`/floors/${parentId}/rooms`, { name: form.name, capacity: Number(form.capacity) || 0, room_type: form.room_type });
      toast.success("Saved");
      setDialog(null);
      load();
    } catch {
      toast.error("Could not save");
    }
  };

  const del = async (kind: string, id: number) => {
    if (!confirm(`Delete this ${kind}? This also removes anything inside it.`)) return;
    await api.delete(`/${kind}s/${id}`);
    toast.success("Deleted");
    load();
  };

  const title = dialog?.kind === "building" ? "Add Building" : dialog?.kind === "floor" ? "Add Floor" : "Add Room";

  return (
    <div data-testid="admin-buildings">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Buildings &amp; Rooms</h1>
          <p className="mt-1 text-sm text-slate-500">Building → Floor → Room hierarchy</p>
        </div>
        {canEdit && (
          <Button onClick={() => openDialog("building")} data-testid="add-building-btn">
            <Plus className="h-4 w-4" /> Add Building
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : buildings.length === 0 ? (
        <div className="mt-6"><EmptyState title="No buildings yet" hint="Add a building, then floors and rooms." /></div>
      ) : (
        <div className="mt-6 space-y-3">
          {buildings.map((b) => {
            const isOpen = expanded[b.id] ?? true;
            const totalRooms = b.floors.reduce((n, f) => n + f.rooms.length, 0);
            const totalCap = b.floors.reduce((n, f) => n + f.rooms.reduce((c, r) => c + (r.capacity || 0), 0), 0);
            return (
              <div key={b.id} className="rounded-lg border border-slate-200 bg-white" data-testid={`building-${b.id}`}>
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setExpanded((e) => ({ ...e, [b.id]: !isOpen }))} className="text-slate-400">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <Building2 className="h-5 w-5 text-slate-700" />
                  <div className="flex-1">
                    <p className="font-heading font-bold text-slate-950">{b.name} {b.code && <span className="text-slate-400">· {b.code}</span>}</p>
                    <p className="text-xs text-slate-500">{b.floors.length} floors · {totalRooms} rooms · capacity {totalCap}</p>
                  </div>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => openDialog("floor", b.id)} data-testid={`add-floor-${b.id}`}>
                      <Plus className="h-3.5 w-3.5" /> Floor
                    </Button>
                  )}
                  {canEdit && <Button variant="ghost" size="icon" onClick={() => del("building", b.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                </div>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
                    {b.floors.length === 0 && <p className="text-sm text-slate-400">No floors yet.</p>}
                    {b.floors.map((f) => (
                      <div key={f.id} className="rounded-md border border-slate-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800">{f.name}</span>
                          <span className="text-xs text-slate-400">Level {f.level}</span>
                          {canEdit && (
                            <div className="ml-auto flex gap-1">
                              <Button variant="outline" size="sm" onClick={() => openDialog("room", f.id)} data-testid={`add-room-${f.id}`}>
                                <Plus className="h-3.5 w-3.5" /> Room
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => del("floor", f.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </div>
                          )}
                        </div>
                        {f.rooms.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {f.rooms.map((r) => (
                              <span key={r.id} className="group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {r.name}
                                <Badge tone="neutral">{r.capacity}</Badge>
                                {canEdit && <button onClick={() => del("room", r.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialog} onClose={() => setDialog(null)} title={title} testId="structure-dialog">
        <div className="space-y-4">
          <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="structure-name-input" /></div>
          {dialog?.kind === "building" && (
            <div><Label>Code</Label><Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
          )}
          {dialog?.kind === "floor" && (
            <div><Label>Level</Label><Input type="number" value={form.level ?? ""} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} /></div>
          )}
          {dialog?.kind === "room" && (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Capacity</Label><Input type="number" value={form.capacity ?? ""} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></div>
              <div><Label>Room Type</Label><Input value={form.room_type ?? ""} onChange={(e) => setForm((f) => ({ ...f, room_type: e.target.value }))} /></div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save} data-testid="save-structure-btn">Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
