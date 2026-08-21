import { useEffect, useState } from "react";
import { Plus, Trash2, BedDouble } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

interface RoomOpt { id: number; label: string; capacity: number; occupied: number }
interface Assignment {
  id: number; room_name?: string; floor_name?: string; building_name?: string;
  team_name?: string; notes?: string;
}
interface Building {
  id: number; name: string; code?: string; rooms: number; capacity: number;
  occupied_rooms: number; assigned: number;
}
interface Team { id: number; name: string }

export default function Accommodation() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ room_id: string; team_id: string; notes: string }>({ room_id: "", team_id: "", notes: "" });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Building[]>("/accommodation/occupancy"),
      api.get<RoomOpt[]>("/accommodation/rooms"),
      api.get<Assignment[]>("/accommodation/assignments"),
      api.get<Team[]>("/teams"),
    ]).then(([o, r, a, t]) => {
      setBuildings(o.data); setRooms(r.data); setAssignments(a.data); setTeams(t.data);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const assign = async () => {
    if (!form.room_id) return toast.error("Select a room");
    if (!form.team_id) return toast.error("Select a team");
    try {
      await api.post("/accommodation/assignments", {
        room_id: Number(form.room_id),
        team_id: Number(form.team_id),
        notes: form.notes || null,
      });
      toast.success("Room assigned");
      setForm({ room_id: "", team_id: "", notes: "" });
      load();
    } catch {
      toast.error("Could not assign room");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this room assignment?")) return;
    await api.delete(`/accommodation/assignments/${id}`);
    toast.success("Assignment removed");
    load();
  };

  if (loading) return <Spinner label="Loading accommodation…" />;

  return (
    <div data-testid="admin-accommodation">
      <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Accommodation</h1>
      <p className="mt-1 text-sm text-slate-500">Assign teams to rooms and track live occupancy per building.</p>

      {/* Occupancy per building */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="occupancy-grid">
        {buildings.length === 0 && <EmptyState title="No buildings yet" hint="Add buildings and rooms first." />}
        {buildings.map((b) => {
          const pct = b.rooms ? Math.round((b.occupied_rooms / b.rooms) * 100) : 0;
          return (
            <div key={b.id} className="rounded-lg border border-slate-200 bg-white p-5" data-testid={`occupancy-${b.id}`}>
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-slate-500" />
                <p className="font-heading font-bold text-slate-950">{b.name}</p>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <span className="font-heading text-3xl font-black text-slate-950">{b.occupied_rooms}<span className="text-lg text-slate-400">/{b.rooms}</span></span>
                <span className="text-xs font-semibold text-slate-500">rooms occupied</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={cn("h-full rounded-full transition-[width]", pct > 85 ? "bg-red-500" : "bg-coral")} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Capacity {b.capacity} beds · {b.assigned} assignment(s)</p>
            </div>
          );
        })}
      </div>

      {/* Assign form */}
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-heading text-lg font-bold text-slate-950">Assign a Team to a Room</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-1">
            <Label>Team</Label>
            <Select value={form.team_id} onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value }))} data-testid="assign-team-select">
              <option value="">Select team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label>Room</Label>
            <Select value={form.room_id} onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))} data-testid="assign-room-select">
              <option value="">Select room…</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.label} ({r.occupied}/{r.capacity})</option>)}
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="flex items-end">
            <Button onClick={assign} className="w-full" data-testid="assign-room-btn"><Plus className="h-4 w-4" /> Assign</Button>
          </div>
        </div>
      </div>

      {/* Assignments table */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white">
        {assignments.length === 0 ? (
          <div className="p-6"><EmptyState title="No assignments yet" hint="Assign a team to a room above." /></div>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Team</TH><TH>Building</TH><TH>Floor</TH><TH>Room</TH><TH>Notes</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {assignments.map((a) => (
                <TR key={a.id} data-testid={`assignment-row-${a.id}`}>
                  <TD className="font-bold text-slate-900">{a.team_name || "—"}</TD>
                  <TD>{a.building_name || "—"}</TD>
                  <TD>{a.floor_name || "—"}</TD>
                  <TD className="font-semibold">{a.room_name || "—"}</TD>
                  <TD className="text-slate-600">{a.notes || "—"}</TD>
                  <TD>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => remove(a.id)} data-testid={`delete-assignment-${a.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
