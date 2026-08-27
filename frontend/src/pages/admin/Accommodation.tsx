import { useEffect, useState } from "react";
import { Plus, Trash2, BedDouble } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RoomOpt { id: number; label: string; capacity: number; occupied: number }
interface Assignment {
  id: number; room_name?: string; floor_name?: string; building_name?: string;
  team_name?: string; participant_name?: string; bed_label?: string; notes?: string;
}
interface Bed { id: number; label: string; occupied: boolean; occupant?: string | null }
interface Building {
  id: number; name: string; code?: string; rooms: number; capacity: number;
  occupied_rooms: number; assigned: number;
}
interface Team { id: number; name: string }
interface Participant { id: number; full_name: string; team_id: number }

type Mode = "team" | "participant";

export default function Accommodation() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("team");
  const [form, setForm] = useState({ room_id: "", team_id: "", participant_id: "", bed_id: "", notes: "" });
  const [beds, setBeds] = useState<Bed[]>([]);
  const [newBed, setNewBed] = useState("");

  const loadBeds = (roomId: string) => {
    if (!roomId) { setBeds([]); return; }
    api.get<Bed[]>(`/accommodation/rooms/${roomId}/beds`).then((r) => setBeds(r.data));
  };

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

  // When assigning a participant, load that team's participants.
  useEffect(() => {
    if (mode === "participant" && form.team_id) {
      api.get<Participant[]>("/participants", { params: { team_id: form.team_id } }).then((r) => setParticipants(r.data));
    } else {
      setParticipants([]);
    }
  }, [mode, form.team_id]);

  const assign = async () => {
    if (!form.room_id) return toast.error("Select a room");
    if (!form.team_id) return toast.error("Select a team");
    if (mode === "participant" && !form.participant_id) return toast.error("Select a participant");
    try {
      const r = await api.post("/accommodation/assignments", {
        room_id: Number(form.room_id),
        team_id: Number(form.team_id),
        participant_id: mode === "participant" && form.participant_id ? Number(form.participant_id) : null,
        bed_id: mode === "participant" && form.bed_id ? Number(form.bed_id) : null,
        notes: form.notes || null,
      });
      if (r.data?.warning) {
        toast.warning(r.data.warning);
      } else {
        toast.success(mode === "participant" ? "Participant assigned to bed" : "Room assigned");
      }
      setForm({ room_id: "", team_id: "", participant_id: "", bed_id: "", notes: "" });
      setBeds([]);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not assign");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this assignment?")) return;
    await api.delete(`/accommodation/assignments/${id}`);
    toast.success("Assignment removed");
    load();
  };

  if (loading) return <Spinner label="Loading accommodation…" />;

  return (
    <div data-testid="admin-accommodation">
      <h1 className="font-heading text-2xl font-black tracking-tight text-white lg:text-slate-950">Accommodation</h1>
      <p className="mt-1 text-sm text-slate-400 lg:text-slate-500">Assign whole teams or individual participants to rooms; track live occupancy.</p>

      {/* Occupancy per building */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="occupancy-grid">
        {buildings.length === 0 && <EmptyState title="No buildings yet" hint="Add buildings and rooms first." />}
        {buildings.map((b) => {
          const pct = b.rooms ? Math.round((b.occupied_rooms / b.rooms) * 100) : 0;
          return (
            <div key={b.id} className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-4 lg:border-slate-200 lg:bg-white lg:p-5" data-testid={`occupancy-${b.id}`}>
              <div className="flex items-center gap-2">
                <BedDouble className="h-4 w-4 text-slate-500" />
                <p className="truncate font-heading font-bold text-white lg:text-slate-950">{b.name}</p>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <span className="font-heading text-3xl font-black text-white lg:text-slate-950">{b.occupied_rooms}<span className="text-lg text-slate-400">/{b.rooms}</span></span>
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
      <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-3 sm:p-5 lg:border-slate-200 lg:bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-bold text-white lg:text-slate-950">Assign to a Room</h2>
          <div className="inline-flex max-w-full rounded-md border border-white/15 p-0.5 lg:border-slate-200" data-testid="assign-mode-toggle">
            {(["team", "participant"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setForm((f) => ({ ...f, participant_id: "" })); }}
                data-testid={`mode-${m}`}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-bold capitalize transition-colors",
                  mode === m ? "bg-obsidian text-white" : "text-slate-400 hover:text-white lg:text-slate-500 lg:hover:text-slate-900",
                )}
              >
                {m === "team" ? "Whole Team" : "Individual (Bed)"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <Label>Team</Label>
            <Select value={form.team_id} onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value, participant_id: "" }))} data-testid="assign-team-select">
              <option value="">Select team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          {mode === "participant" && (
            <div>
              <Label>Participant</Label>
              <Select value={form.participant_id} onChange={(e) => setForm((f) => ({ ...f, participant_id: e.target.value }))} data-testid="assign-participant-select" disabled={!form.team_id}>
                <option value="">{form.team_id ? "Select participant…" : "Pick a team first"}</option>
                {participants.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </div>
          )}
          <div>
            <Label>Room</Label>
            <Select value={form.room_id} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, room_id: v, bed_id: "" })); if (mode === "participant") loadBeds(v); }} data-testid="assign-room-select">
              <option value="">Select room…</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.occupied}/{r.capacity}){r.capacity > 0 && r.occupied >= r.capacity ? " ⚠ FULL" : ""}
                </option>
              ))}
            </Select>
          </div>
          {mode === "participant" && (
            <div>
              <Label>Bed</Label>
              <Select value={form.bed_id} onChange={(e) => setForm((f) => ({ ...f, bed_id: e.target.value }))} data-testid="assign-bed-select" disabled={!form.room_id}>
                <option value="">{form.room_id ? "Any / no specific bed" : "Pick a room first"}</option>
                {beds.filter((b) => !b.occupied).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </Select>
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={assign} className="w-full" data-testid="assign-room-btn"><Plus className="h-4 w-4" /> Assign</Button>
          </div>
        </div>

        {mode === "participant" && form.room_id && (
          <div className="mt-4 rounded-md bg-white/5 p-3 lg:bg-slate-50" data-testid="bed-manager">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Beds in this room</p>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Input value={newBed} onChange={(e) => setNewBed(e.target.value)} placeholder="Bed label" className="h-8 min-w-0 flex-1 sm:w-32 sm:flex-none" data-testid="new-bed-input" />
                <Button size="sm" variant="outline" onClick={async () => { if (!newBed.trim()) return; await api.post(`/accommodation/rooms/${form.room_id}/beds`, { label: newBed }); setNewBed(""); loadBeds(form.room_id); }} data-testid="add-bed-btn"><Plus className="h-3.5 w-3.5" /> Add</Button>
                <Button size="sm" variant="outline" onClick={async () => { await api.post(`/accommodation/rooms/${form.room_id}/beds/generate`); loadBeds(form.room_id); toast.success("Beds generated"); }} data-testid="generate-beds-btn">Generate to capacity</Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {beds.length === 0 && <span className="text-sm text-slate-400">No beds labelled yet.</span>}
              {beds.map((b) => (
                <span key={b.id} className={cn("inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold", b.occupied ? "border-slate-200 bg-slate-100 text-slate-500" : "border-emerald-200 bg-emerald-50 text-emerald-700")} data-testid={`bed-chip-${b.id}`}>
                  {b.label}{b.occupied ? ` · ${b.occupant ?? "occupied"}` : ""}
                  {!b.occupied && <button onClick={async () => { await api.delete(`/accommodation/beds/${b.id}`); loadBeds(form.room_id); }} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Assignments table */}
      <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-white/5 lg:border-slate-200 lg:bg-white">
        {assignments.length === 0 ? (
          <div className="p-6"><EmptyState title="No assignments yet" hint="Assign a team or participant to a room above." /></div>
        ) : (
          <>
          <div className="grid gap-2 p-2 lg:hidden">
            {assignments.map((a, i) => (
              <div key={a.id} data-testid={`assignment-card-${a.id}`} className="w-full min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="text-[10px] font-semibold text-slate-500">#{i + 1}</div><div className="break-words text-sm font-bold text-white">{a.team_name || "—"}</div><div className="truncate text-[11px] text-slate-400">{a.participant_name || "Whole team"}{a.bed_label ? ` · ${a.bed_label}` : ""}</div></div>
                  <Button variant="danger" size="sm" className="h-8 shrink-0 border-red-500/30 bg-red-500/10 px-2 text-red-400 hover:bg-red-500/20" onClick={() => remove(a.id)} data-testid={`delete-assignment-mobile-${a.id}`}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2 text-[10px] font-bold"><span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">{a.building_name || "—"}</span><span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">{a.floor_name || "—"}</span><span className="rounded bg-coral/15 px-1.5 py-0.5 text-coral">{a.room_name || "—"}</span></div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block"><Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>#</TH><TH>Team</TH><TH>Participant</TH><TH>Building</TH><TH>Floor</TH><TH>Room</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {assignments.map((a, i) => (
                <TR key={a.id} data-testid={`assignment-row-${a.id}`}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="font-bold text-slate-900">{a.team_name || "—"}</TD>
                  <TD>{a.participant_name ? <span>{a.participant_name}{a.bed_label && <span className="text-slate-400"> · {a.bed_label}</span>}</span> : <Badge tone="neutral">Whole team</Badge>}</TD>
                  <TD>{a.building_name || "—"}</TD>
                  <TD>{a.floor_name || "—"}</TD>
                  <TD className="font-semibold">{a.room_name || "—"}</TD>
                  <TD>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => remove(a.id)} data-testid={`delete-assignment-${a.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table></div>
          </>
        )}
      </div>
    </div>
  );
}
