import { useEffect, useState } from "react";
import { Plus, Trash2, Bus, UserCog, MapPin } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { formatDate } from "@/lib/meta";

interface Driver { id: number; name: string; phone?: string }
interface Vehicle { id: number; label: string; capacity?: number; driver_id?: number; driver_name?: string }
interface Team { id: number; name: string }
interface Assignment {
  id: number; vehicle_label?: string; team_name?: string;
  pickup_location?: string; drop_location?: string; pickup_time?: string; route?: string;
}

export default function Transport() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [driver, setDriver] = useState({ name: "", phone: "" });
  const [vehicle, setVehicle] = useState({ label: "", capacity: "", driver_id: "" });
  const [assign, setAssign] = useState({ vehicle_id: "", team_id: "", pickup_location: "", drop_location: "", pickup_time: "", route: "" });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Driver[]>("/transport/drivers"),
      api.get<Vehicle[]>("/transport/vehicles"),
      api.get<Assignment[]>("/transport/assignments"),
      api.get<Team[]>("/teams"),
    ]).then(([d, v, a, t]) => { setDrivers(d.data); setVehicles(v.data); setAssignments(a.data); setTeams(t.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addDriver = async () => {
    if (!driver.name.trim()) return toast.error("Driver name required");
    await api.post("/transport/drivers", driver);
    setDriver({ name: "", phone: "" });
    toast.success("Driver added");
    load();
  };
  const addVehicle = async () => {
    if (!vehicle.label.trim()) return toast.error("Vehicle label required (e.g. Bus B3)");
    await api.post("/transport/vehicles", {
      label: vehicle.label,
      capacity: vehicle.capacity ? Number(vehicle.capacity) : null,
      driver_id: vehicle.driver_id ? Number(vehicle.driver_id) : null,
    });
    setVehicle({ label: "", capacity: "", driver_id: "" });
    toast.success("Vehicle added");
    load();
  };
  const addAssignment = async () => {
    if (!assign.vehicle_id) return toast.error("Select a vehicle");
    if (!assign.team_id) return toast.error("Select a team");
    await api.post("/transport/assignments", {
      vehicle_id: Number(assign.vehicle_id),
      team_id: Number(assign.team_id),
      pickup_location: assign.pickup_location || null,
      drop_location: assign.drop_location || null,
      pickup_time: assign.pickup_time || null,
      route: assign.route || null,
    });
    setAssign({ vehicle_id: "", team_id: "", pickup_location: "", drop_location: "", pickup_time: "", route: "" });
    toast.success("Transport assigned");
    load();
  };

  const del = async (kind: string, id: number) => {
    if (!confirm("Delete this record?")) return;
    await api.delete(`/transport/${kind}/${id}`);
    toast.success("Deleted");
    load();
  };

  if (loading) return <Spinner label="Loading transport…" />;

  return (
    <div data-testid="admin-transport">
      <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Transport</h1>
      <p className="mt-1 text-sm text-slate-500">Buses, drivers and pickup schedules — these appear on each team's portal.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Drivers */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-950"><UserCog className="h-4 w-4" /> Drivers</h2>
          <div className="mt-4 flex gap-2">
            <Input placeholder="Driver name" value={driver.name} onChange={(e) => setDriver((d) => ({ ...d, name: e.target.value }))} data-testid="driver-name-input" />
            <Input placeholder="Phone" value={driver.phone} onChange={(e) => setDriver((d) => ({ ...d, phone: e.target.value }))} className="w-40" />
            <Button onClick={addDriver} data-testid="add-driver-btn"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="mt-4 space-y-2">
            {drivers.length === 0 && <p className="text-sm text-slate-400">No drivers yet.</p>}
            {drivers.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm" data-testid={`driver-row-${d.id}`}>
                <span><span className="font-bold text-slate-900">{d.name}</span>{d.phone && <span className="text-slate-500"> · {d.phone}</span>}</span>
                <button onClick={() => del("drivers", d.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Vehicles */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-950"><Bus className="h-4 w-4" /> Vehicles</h2>
          <div className="mt-4 grid grid-cols-[1fr_5rem_1fr_auto] gap-2">
            <Input placeholder="Label (Bus B3)" value={vehicle.label} onChange={(e) => setVehicle((v) => ({ ...v, label: e.target.value }))} data-testid="vehicle-label-input" />
            <Input placeholder="Cap." type="number" value={vehicle.capacity} onChange={(e) => setVehicle((v) => ({ ...v, capacity: e.target.value }))} />
            <Select value={vehicle.driver_id} onChange={(e) => setVehicle((v) => ({ ...v, driver_id: e.target.value }))}>
              <option value="">No driver</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Button onClick={addVehicle} data-testid="add-vehicle-btn"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="mt-4 space-y-2">
            {vehicles.length === 0 && <p className="text-sm text-slate-400">No vehicles yet.</p>}
            {vehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm" data-testid={`vehicle-row-${v.id}`}>
                <span><span className="font-bold text-slate-900">{v.label}</span><span className="text-slate-500"> · {v.capacity ?? "—"} seats{v.driver_name ? ` · ${v.driver_name}` : ""}</span></span>
                <button onClick={() => del("vehicles", v.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assignments */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-950"><MapPin className="h-4 w-4" /> Team Transport Assignments</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-6">
          <Select value={assign.team_id} onChange={(e) => setAssign((a) => ({ ...a, team_id: e.target.value }))} data-testid="ta-team-select">
            <option value="">Team…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select value={assign.vehicle_id} onChange={(e) => setAssign((a) => ({ ...a, vehicle_id: e.target.value }))} data-testid="ta-vehicle-select">
            <option value="">Vehicle…</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </Select>
          <Input placeholder="Pickup" value={assign.pickup_location} onChange={(e) => setAssign((a) => ({ ...a, pickup_location: e.target.value }))} />
          <Input placeholder="Drop" value={assign.drop_location} onChange={(e) => setAssign((a) => ({ ...a, drop_location: e.target.value }))} />
          <Input type="datetime-local" value={assign.pickup_time} onChange={(e) => setAssign((a) => ({ ...a, pickup_time: e.target.value }))} />
          <Button onClick={addAssignment} data-testid="add-ta-btn"><Plus className="h-4 w-4" /> Assign</Button>
        </div>

        <div className="mt-5">
          {assignments.length === 0 ? (
            <EmptyState title="No transport assignments" hint="Assign a vehicle to a team above." />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>#</TH><TH>Team</TH><TH>Vehicle</TH><TH>Pickup</TH><TH>Drop</TH><TH>Time</TH><TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <tbody>
                {assignments.map((a, i) => (
                  <TR key={a.id} data-testid={`ta-row-${a.id}`}>
                    <TD className="text-slate-400">{i + 1}</TD>
                    <TD className="font-bold text-slate-900">{a.team_name || "—"}</TD>
                    <TD>{a.vehicle_label || "—"}</TD>
                    <TD>{a.pickup_location || "—"}</TD>
                    <TD>{a.drop_location || "—"}</TD>
                    <TD>{a.pickup_time ? formatDate(a.pickup_time) : "—"}</TD>
                    <TD><div className="flex justify-end"><Button variant="ghost" size="icon" onClick={() => del("assignments", a.id)} data-testid={`delete-ta-${a.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
