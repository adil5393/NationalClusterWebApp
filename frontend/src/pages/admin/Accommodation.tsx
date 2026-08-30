import { useEffect, useState } from "react";
import { Plus, Trash2, BedDouble, Building, Users, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RoomOpt {
  id: number;
  label: string;
  capacity: number;
  occupied: number;
}
interface Assignment {
  id: number;
  room_name?: string;
  floor_name?: string;
  building_name?: string;
  team_name?: string;
  participant_name?: string;
  bed_label?: string;
  notes?: string;
}
interface Bed {
  id: number;
  label: string;
  occupied: boolean;
  occupant?: string | null;
}
interface Building {
  id: number;
  name: string;
  code?: string;
  rooms: number;
  capacity: number;
  occupied_rooms: number;
  assigned: number;
}
interface Team {
  id: number;
  name: string;
}
interface Participant {
  id: number;
  full_name: string;
  team_id: number;
}

type Mode = "team" | "participant";

export default function Accommodation() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("team");
  const [form, setForm] = useState({
    room_id: "",
    team_id: "",
    participant_id: "",
    bed_id: "",
    notes: "",
  });
  const [beds, setBeds] = useState<Bed[]>([]);
  const [newBed, setNewBed] = useState("");

  const loadBeds = (roomId: string) => {
    if (!roomId) {
      setBeds([]);
      return;
    }
    api.get<Bed[]>(`/accommodation/rooms/${roomId}/beds`).then((r) => setBeds(r.data));
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Building[]>("/accommodation/occupancy"),
      api.get<RoomOpt[]>("/accommodation/rooms"),
      api.get<Assignment[]>("/accommodation/assignments"),
      api.get<Team[]>("/teams"),
    ])
      .then(([o, r, a, t]) => {
        setBuildings(o.data);
        setRooms(r.data);
        setAssignments(a.data);
        setTeams(t.data);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // When assigning a participant, load that team's participants.
  useEffect(() => {
    if (mode === "participant" && form.team_id) {
      api
        .get<Participant[]>("/participants", { params: { team_id: form.team_id } })
        .then((r) => setParticipants(r.data));
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
        participant_id:
          mode === "participant" && form.participant_id ? Number(form.participant_id) : null,
        bed_id: mode === "participant" && form.bed_id ? Number(form.bed_id) : null,
        notes: form.notes || null,
      });
      if (r.data?.warning) {
        toast.warning(r.data.warning);
      } else {
        toast.success(mode === "participant" ? "Participant assigned to bed" : "Room assigned to team");
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

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading accommodation workspace & live occupancy…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-accommodation" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          LOGISTICS & HOUSING WORKSPACE
        </span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          Accommodation & Room Allocation
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
          Assign whole delegations or individual athletes to hostel beds; monitor real-time capacity and occupancy.
        </p>
      </div>

      {/* OCCUPANCY METERS PER BUILDING */}
      <div>
        <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Hostel Blocks Telemetry
        </h2>
        <div className="grid gap-3.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="occupancy-grid">
          {buildings.length === 0 ? (
            <EmptyState title="No buildings found" hint="Add buildings and rooms in the Buildings module first." />
          ) : (
            buildings.map((b) => {
              const pct = b.rooms ? Math.round((b.occupied_rooms / b.rooms) * 100) : 0;
              const isOver = b.assigned > b.capacity && b.capacity > 0;
              return (
                <div
                  key={b.id}
                  className={`rounded-xl border p-4 sm:p-5 shadow-sm transition-colors ${
                    isOver
                      ? "border-red-500/40 bg-gradient-to-br from-red-500/10 via-obsidian-900 to-obsidian"
                      : "border-white/10 bg-obsidian-900"
                  }`}
                  data-testid={`occupancy-${b.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30 shrink-0">
                        <Building className="h-4 w-4" />
                      </span>
                      <p className="font-heading font-bold text-white text-sm truncate">{b.name}</p>
                    </div>
                    {b.code && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-400">
                        {b.code}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <span className="font-heading text-2xl sm:text-3xl font-black text-white tabular-nums">
                        {b.occupied_rooms}
                      </span>
                      <span className="text-sm text-slate-400 font-bold font-mono"> / {b.rooms} Rooms</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-gold tabular-nums">{pct}% Full</span>
                  </div>

                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        isOver
                          ? "bg-red-500"
                          : pct > 85
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                      )}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono pt-2 border-t border-white/5">
                    <span>Capacity: <strong className="text-slate-200">{b.capacity}</strong> beds</span>
                    <span>Assigned: <strong className={isOver ? "text-red-400 font-bold" : "text-slate-200"}>{b.assigned}</strong></span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ALLOCATION WORKSPACE FORM */}
      <div className="rounded-xl border border-gold/30 bg-obsidian-900/90 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
              <Plus className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-base font-bold text-white tracking-tight">
              Assign Accommodation
            </h2>
          </div>

          <div
            className="inline-flex rounded-lg border border-white/10 bg-obsidian-950 p-1 shrink-0"
            data-testid="assign-mode-toggle"
          >
            {(["team", "participant"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setForm((f) => ({ ...f, participant_id: "" }));
                }}
                data-testid={`mode-${m}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-heading font-bold transition-all",
                  mode === m
                    ? "bg-gold text-obsidian shadow-sm"
                    : "text-slate-400 hover:text-white",
                )}
              >
                {m === "team" ? "Whole Delegation" : "Individual (Bed)"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Team Delegation *</Label>
            <Select
              value={form.team_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, team_id: e.target.value, participant_id: "" }))
              }
              data-testid="assign-team-select"
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>

          {mode === "participant" && (
            <div>
              <Label>Individual Athlete *</Label>
              <Select
                value={form.participant_id}
                onChange={(e) => setForm((f) => ({ ...f, participant_id: e.target.value }))}
                data-testid="assign-participant-select"
                disabled={!form.team_id}
              >
                <option value="">
                  {form.team_id ? "Select participant…" : "Select team first"}
                </option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label>Hostel Room *</Label>
            <Select
              value={form.room_id}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, room_id: v, bed_id: "" }));
                if (mode === "participant") loadBeds(v);
              }}
              data-testid="assign-room-select"
            >
              <option value="">Select room…</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.occupied}/{r.capacity})
                  {r.capacity > 0 && r.occupied >= r.capacity ? " ⚠ FULL" : ""}
                </option>
              ))}
            </Select>
          </div>

          {mode === "participant" && (
            <div>
              <Label>Bed Assignment</Label>
              <Select
                value={form.bed_id}
                onChange={(e) => setForm((f) => ({ ...f, bed_id: e.target.value }))}
                data-testid="assign-bed-select"
                disabled={!form.room_id}
              >
                <option value="">
                  {form.room_id ? "Any / Unspecified bed" : "Select room first"}
                </option>
                {beds
                  .filter((b) => !b.occupied)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
              </Select>
            </div>
          )}

          <div className="flex items-end">
            <Button
              variant="gold"
              onClick={assign}
              className="w-full h-10 text-xs font-bold"
              data-testid="assign-room-btn"
            >
              <Plus className="h-4 w-4" /> Save Allocation
            </Button>
          </div>
        </div>

        {/* BED MANAGER FOR PARTICIPANT MODE */}
        {mode === "participant" && form.room_id && (
          <div
            className="rounded-xl border border-white/10 bg-obsidian-950 p-4 space-y-3"
            data-testid="bed-manager"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-heading font-bold uppercase tracking-wider text-slate-400">
                Beds Labelled in Selected Room
              </p>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Input
                  value={newBed}
                  onChange={(e) => setNewBed(e.target.value)}
                  placeholder="Bed label (e.g. Bed 1)"
                  className="h-8 w-36 text-xs"
                  data-testid="new-bed-input"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!newBed.trim()) return;
                    await api.post(`/accommodation/rooms/${form.room_id}/beds`, { label: newBed });
                    setNewBed("");
                    loadBeds(form.room_id);
                  }}
                  data-testid="add-bed-btn"
                  className="text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Bed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await api.post(`/accommodation/rooms/${form.room_id}/beds/generate`);
                    loadBeds(form.room_id);
                    toast.success("Beds generated to match room capacity");
                  }}
                  data-testid="generate-beds-btn"
                  className="text-xs text-gold"
                >
                  Auto-Generate to Capacity
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {beds.length === 0 ? (
                <span className="text-xs text-slate-400 font-body">No specific beds defined for this room yet.</span>
              ) : (
                beds.map((b) => (
                  <span
                    key={b.id}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium font-mono",
                      b.occupied
                        ? "border-white/10 bg-white/5 text-slate-400"
                        : "border-emerald-500/30 bg-emerald-500/15 text-emerald-400 font-bold",
                    )}
                    data-testid={`bed-chip-${b.id}`}
                  >
                    <span>{b.label}</span>
                    {b.occupied && <span className="text-slate-300 font-body truncate">({b.occupant ?? "Occupied"})</span>}
                    {!b.occupied && (
                      <button
                        onClick={async () => {
                          await api.delete(`/accommodation/beds/${b.id}`);
                          loadBeds(form.room_id);
                        }}
                        className="text-slate-500 hover:text-red-400 ml-1"
                        title="Remove bed label"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ASSIGNMENTS TABLE */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-400">
            Active Allocations ({assignments.length})
          </h2>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState
              title="No room assignments yet"
              hint="Use the allocation workspace above to assign teams or athletes."
            />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {assignments.map((a, i) => (
                <div
                  key={a.id}
                  data-testid={`assignment-card-${a.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                      <h3 className="font-heading font-bold text-white text-sm">{a.team_name || "—"}</h3>
                      <p className="text-xs text-gold font-body">
                        {a.participant_name ? `${a.participant_name}${a.bed_label ? ` · ${a.bed_label}` : ""}` : "Whole Delegation"}
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      onClick={() => remove(a.id)}
                      data-testid={`delete-assignment-mobile-${a.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2 text-[11px]">
                    <span className="rounded bg-white/5 px-2 py-0.5 text-slate-300 font-mono">
                      {a.building_name || "Building"}
                    </span>
                    <span className="rounded bg-white/5 px-2 py-0.5 text-slate-300 font-mono">
                      {a.floor_name || "Floor"}
                    </span>
                    <span className="rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-gold font-bold font-mono">
                      {a.room_name || "Room"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* DESKTOP: TABLE */}
            <div className="hidden lg:block">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12">#</TH>
                    <TH>Team Delegation</TH>
                    <TH>Athlete / Allocation</TH>
                    <TH>Building</TH>
                    <TH>Floor</TH>
                    <TH>Room</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {assignments.map((a, i) => (
                    <TR key={a.id} data-testid={`assignment-row-${a.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                      <TD className="font-bold text-white text-sm">{a.team_name || "—"}</TD>
                      <TD>
                        {a.participant_name ? (
                          <span className="text-slate-200 text-xs font-body">
                            {a.participant_name}
                            {a.bed_label && (
                              <span className="text-gold font-mono font-bold ml-1">· {a.bed_label}</span>
                            )}
                          </span>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            Whole Delegation
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-slate-300 text-xs font-body">{a.building_name || "—"}</TD>
                      <TD className="text-slate-300 text-xs font-body">{a.floor_name || "—"}</TD>
                      <TD className="font-heading font-black text-sm text-gold">{a.room_name || "—"}</TD>
                      <TD className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(a.id)}
                          data-testid={`delete-assignment-${a.id}`}
                          title="Remove Assignment"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
