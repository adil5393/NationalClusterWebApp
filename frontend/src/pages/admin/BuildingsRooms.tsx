import { useEffect, useState } from "react";
import { Plus, Trash2, Building2, ChevronDown, ChevronRight, Layers, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess } from "@/lib/permissions";

interface Room {
  id: number;
  name: string;
  capacity?: number;
  room_type?: string;
}
interface Floor {
  id: number;
  name: string;
  level?: number;
  rooms: Room[];
}
interface Building {
  id: number;
  name: string;
  code?: string;
  floors: Floor[];
}

export default function BuildingsRooms() {
  const { canEdit } = useModuleAccess("buildings");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [dialog, setDialog] = useState<null | { kind: "building" | "floor" | "room"; parentId?: number }>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    api
      .get<Building[]>("/buildings")
      .then((r) => setBuildings(r.data))
      .finally(() => setLoading(false));
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
      else if (kind === "floor")
        await api.post(`/buildings/${parentId}/floors`, {
          name: form.name,
          level: Number(form.level) || 0,
        });
      else
        await api.post(`/floors/${parentId}/rooms`, {
          name: form.name,
          capacity: Number(form.capacity) || 0,
          room_type: form.room_type,
        });
      toast.success("Structure saved");
      setDialog(null);
      load();
    } catch {
      toast.error("Could not save structure");
    }
  };

  const del = async (kind: string, id: number) => {
    if (!confirm(`Delete this ${kind}? This also removes all nested rooms and assignments.`)) return;
    await api.delete(`/${kind}s/${id}`);
    toast.success("Deleted");
    load();
  };

  const title =
    dialog?.kind === "building"
      ? "Add Hostel Building"
      : dialog?.kind === "floor"
      ? "Add Building Floor"
      : "Add Room";

  return (
    <div data-testid="admin-buildings" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            PHYSICAL INFRASTRUCTURE HIERARCHY
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Buildings & Rooms
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Manage structure hierarchy: Building → Floor → Room and bed capacities.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={() => openDialog("building")}
            data-testid="add-building-btn"
            className="text-xs font-extrabold"
          >
            <Plus className="h-4 w-4" /> Add Building
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
          <Spinner label="Loading building hierarchy…" />
        </div>
      ) : buildings.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState title="No buildings created yet" hint="Add your first building to configure floors and rooms." />
        </div>
      ) : (
        <div className="space-y-3.5">
          {buildings.map((b) => {
            const isOpen = expanded[b.id] ?? true; // Default open for speed
            const totalRooms = b.floors.reduce((n, f) => n + f.rooms.length, 0);
            const totalCap = b.floors.reduce(
              (n, f) => n + f.rooms.reduce((c, r) => c + (r.capacity || 0), 0),
              0,
            );

            return (
              <div
                key={b.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-obsidian-900 shadow-sm"
                data-testid={`building-${b.id}`}
              >
                {/* BUILDING BAR */}
                <div className="flex flex-wrap items-center gap-3 p-4 bg-white/[0.02]">
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [b.id]: !isOpen }))}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <Building2 className="h-5 w-5 text-gold" />
                  <div className="min-w-0 flex-1">
                    <p className="font-heading font-bold text-white text-base">
                      {b.name} {b.code && <span className="text-xs text-gold font-mono font-bold">· {b.code}</span>}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {b.floors.length} Floors · {totalRooms} Rooms · Total Capacity {totalCap} Beds
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog("floor", b.id)}
                        data-testid={`add-floor-${b.id}`}
                        className="text-xs font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5 text-gold" /> Add Floor
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => del("building", b.id)}
                        title="Delete Building"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* FLOORS & ROOMS LIST */}
                {isOpen && (
                  <div className="space-y-3 border-t border-white/10 bg-obsidian-950/70 p-4">
                    {b.floors.length === 0 ? (
                      <p className="text-xs text-slate-400 font-body py-2">No floors added to this building yet.</p>
                    ) : (
                      b.floors.map((f) => (
                        <div
                          key={f.id}
                          className="rounded-xl border border-white/5 bg-obsidian-900 p-3.5 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Layers className="h-4 w-4 text-slate-400" />
                              <span className="font-heading font-bold text-white text-sm">{f.name}</span>
                              <span className="text-xs text-slate-400 font-mono">Level {f.level}</span>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDialog("room", f.id)}
                                  data-testid={`add-room-${f.id}`}
                                  className="text-xs"
                                >
                                  <Plus className="h-3 w-3 text-gold" /> Add Room
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => del("floor", f.id)}
                                  title="Delete Floor"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {f.rooms.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {f.rooms.map((r) => (
                                <span
                                  key={r.id}
                                  className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-obsidian-950 px-3 py-1.5 text-xs font-semibold text-slate-200"
                                >
                                  <DoorOpen className="h-3.5 w-3.5 text-gold" />
                                  <span className="font-heading font-bold text-white">{r.name}</span>
                                  <Badge tone="neutral" size="sm">
                                    {r.capacity} Beds
                                  </Badge>
                                  {canEdit && (
                                    <button
                                      onClick={() => del("room", r.id)}
                                      className="text-slate-500 hover:text-red-400 transition-colors ml-1"
                                      title="Delete Room"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DIALOG */}
      <Dialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={title}
        testId="structure-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={
                dialog?.kind === "building"
                  ? "e.g. Block A"
                  : dialog?.kind === "floor"
                  ? "e.g. Ground Floor"
                  : "e.g. Room 101"
              }
              data-testid="structure-name-input"
            />
          </div>
          {dialog?.kind === "building" && (
            <div>
              <Label>Building Code</Label>
              <Input
                value={form.code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. BLK-A"
              />
            </div>
          )}
          {dialog?.kind === "floor" && (
            <div>
              <Label>Floor Level / Number</Label>
              <Input
                type="number"
                value={form.level ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                placeholder="0 for Ground, 1 for 1st Floor..."
              />
            </div>
          )}
          {dialog?.kind === "room" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bed Capacity</Label>
                <Input
                  type="number"
                  value={form.capacity ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  placeholder="Number of beds"
                />
              </div>
              <div>
                <Label>Room Type</Label>
                <Input
                  value={form.room_type ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, room_type: e.target.value }))}
                  placeholder="Dormitory / Single / VIP"
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-structure-btn">
              Save Structure
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
