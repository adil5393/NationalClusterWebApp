import { useEffect, useState } from "react";
import { Plus, Trash2, Bus, UserCog, MapPin, Clock, Phone, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";

interface Driver {
  id: number;
  name: string;
  phone?: string;
}
interface Vehicle {
  id: number;
  label: string;
  capacity?: number;
  driver_id?: number;
  driver_name?: string;
}
interface Team {
  id: number;
  name: string;
}
interface Assignment {
  id: number;
  vehicle_label?: string;
  team_name?: string;
  pickup_location?: string;
  drop_location?: string;
  pickup_time?: string;
  route?: string;
}

export default function Transport() {
  const { canEdit } = useModuleAccess("transport");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [driver, setDriver] = useState({ name: "", phone: "" });
  const [vehicle, setVehicle] = useState({ label: "", capacity: "", driver_id: "" });
  const [assign, setAssign] = useState({
    vehicle_id: "",
    team_id: "",
    pickup_location: "",
    drop_location: "",
    pickup_time: "",
    route: "",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Driver[]>("/transport/drivers"),
      api.get<Vehicle[]>("/transport/vehicles"),
      api.get<Assignment[]>("/transport/assignments"),
      api.get<Team[]>("/teams"),
    ])
      .then(([d, v, a, t]) => {
        setDrivers(d.data);
        setVehicles(v.data);
        setAssignments(a.data);
        setTeams(t.data);
      })
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
    setAssign({
      vehicle_id: "",
      team_id: "",
      pickup_location: "",
      drop_location: "",
      pickup_time: "",
      route: "",
    });
    toast.success("Transport assigned");
    load();
  };

  const del = async (kind: string, id: number) => {
    if (!confirm("Delete this record?")) return;
    await api.delete(`/transport/${kind}/${id}`);
    toast.success("Deleted");
    load();
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading transport fleet & dispatches…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-transport" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          TRANSIT FLEET & DISPATCH
        </span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          Transport Operations
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
          Manage buses, assigned drivers, and station/airport pickup schedules published to team portals.
        </p>
      </div>

      {/* DRIVERS & VEHICLES FLEET PANELS */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* DRIVERS ROSTER */}
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold text-white">
              <UserCog className="h-4 w-4 text-gold" /> Certified Drivers ({drivers.length})
            </h2>
          </div>

          {canEdit && (
            <div className="flex flex-col sm:flex-row gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <Input
                placeholder="Driver full name *"
                value={driver.name}
                onChange={(e) => setDriver((d) => ({ ...d, name: e.target.value }))}
                className="h-9 text-xs flex-1"
                data-testid="driver-name-input"
              />
              <Input
                placeholder="Phone number"
                value={driver.phone}
                onChange={(e) => setDriver((d) => ({ ...d, phone: e.target.value }))}
                className="h-9 text-xs sm:w-40"
              />
              <Button
                variant="gold"
                size="sm"
                onClick={addDriver}
                className="h-9 text-xs font-bold shrink-0"
                data-testid="add-driver-btn"
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {drivers.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No drivers registered yet.</p>
            ) : (
              drivers.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs"
                  data-testid={`driver-row-${d.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-white text-sm">{d.name}</p>
                    {d.phone && (
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                        <Phone className="h-3 w-3 text-gold" /> {d.phone}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => del("drivers", d.id)}
                      title="Remove Driver"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* VEHICLES FLEET */}
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold text-white">
              <Bus className="h-4 w-4 text-gold" /> Fleet Vehicles ({vehicles.length})
            </h2>
          </div>

          {canEdit && (
            <div className="grid gap-2 sm:grid-cols-[1fr_5rem_1fr_auto] rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <Input
                placeholder="Label (e.g. Bus B3)"
                value={vehicle.label}
                onChange={(e) => setVehicle((v) => ({ ...v, label: e.target.value }))}
                className="h-9 text-xs"
                data-testid="vehicle-label-input"
              />
              <Input
                placeholder="Cap."
                type="number"
                value={vehicle.capacity}
                onChange={(e) => setVehicle((v) => ({ ...v, capacity: e.target.value }))}
                className="h-9 text-xs"
              />
              <Select
                value={vehicle.driver_id}
                onChange={(e) => setVehicle((v) => ({ ...v, driver_id: e.target.value }))}
                className="h-9 text-xs"
              >
                <option value="">No Driver</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Button
                variant="gold"
                size="sm"
                onClick={addVehicle}
                className="h-9 text-xs font-bold"
                data-testid="add-vehicle-btn"
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {vehicles.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No vehicles added to the fleet yet.</p>
            ) : (
              vehicles.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs"
                  data-testid={`vehicle-row-${v.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-white text-sm">{v.label}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {v.capacity ?? "—"} Seats · Driver:{" "}
                      <strong className="text-slate-200">{v.driver_name || "Unassigned"}</strong>
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => del("vehicles", v.id)}
                      title="Remove Vehicle"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* TEAM TRANSPORT DISPATCHES */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4 shadow-sm">
        <div className="border-b border-white/10 pb-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-white">
            <MapPin className="h-4 w-4 text-gold" /> Team Transit Dispatches ({assignments.length})
          </h2>
        </div>

        {canEdit && (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label>Team Delegation *</Label>
                <Select
                  value={assign.team_id}
                  onChange={(e) => setAssign((a) => ({ ...a, team_id: e.target.value }))}
                  className="h-9 text-xs"
                  data-testid="ta-team-select"
                >
                  <option value="">Select team…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Vehicle *</Label>
                <Select
                  value={assign.vehicle_id}
                  onChange={(e) => setAssign((a) => ({ ...a, vehicle_id: e.target.value }))}
                  className="h-9 text-xs"
                  data-testid="ta-vehicle-select"
                >
                  <option value="">Select vehicle…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Pickup Point</Label>
                <Input
                  placeholder="e.g. Central Railway Station"
                  value={assign.pickup_location}
                  onChange={(e) => setAssign((a) => ({ ...a, pickup_location: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <Label>Destination</Label>
                <Input
                  placeholder="e.g. Main Campus Hostel"
                  value={assign.drop_location}
                  onChange={(e) => setAssign((a) => ({ ...a, drop_location: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <Label>Pickup Timing</Label>
                <Input
                  type="datetime-local"
                  value={assign.pickup_time}
                  onChange={(e) => setAssign((a) => ({ ...a, pickup_time: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <Button
              variant="gold"
              onClick={addAssignment}
              className="w-full h-10 text-xs font-bold mt-1"
              data-testid="add-ta-btn"
            >
              <Plus className="h-4 w-4" /> Save Dispatch Schedule
            </Button>
          </div>
        )}

        <div>
          {assignments.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No transit dispatches" hint="Assign a vehicle to a team above." />
            </div>
          ) : (
            <>
              {/* MOBILE: CARD LIST */}
              <div className="grid gap-2.5 lg:hidden">
                {assignments.map((a, i) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-white/10 bg-obsidian-950 p-3.5 space-y-2"
                    data-testid={`ta-card-${a.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                        <p className="font-heading font-bold text-white text-sm">{a.team_name || "—"}</p>
                        <p className="text-xs text-gold font-mono font-bold mt-0.5">
                          {a.vehicle_label || "—"}
                        </p>
                      </div>
                      {canEdit && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => del("assignments", a.id)}
                          className="h-7 text-xs"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 font-body border-t border-white/5 pt-2">
                      <strong className="text-slate-400">Route:</strong> {a.pickup_location || "—"} →{" "}
                      {a.drop_location || "—"}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      {a.pickup_time ? formatDate(a.pickup_time) : "No pickup time specified"}
                    </p>
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
                      <TH>Vehicle</TH>
                      <TH>Pickup Point</TH>
                      <TH>Destination</TH>
                      <TH>Scheduled Time</TH>
                      <TH className="text-right">Action</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {assignments.map((a, i) => (
                      <TR key={a.id} data-testid={`ta-row-${a.id}`}>
                        <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                        <TD className="font-heading font-bold text-white text-sm">
                          {a.team_name || "—"}
                        </TD>
                        <TD className="text-gold font-mono font-bold text-xs">{a.vehicle_label || "—"}</TD>
                        <TD className="text-slate-300 font-body text-xs">{a.pickup_location || "—"}</TD>
                        <TD className="text-slate-300 font-body text-xs">{a.drop_location || "—"}</TD>
                        <TD className="text-slate-400 font-mono text-xs">
                          {a.pickup_time ? formatDate(a.pickup_time) : "—"}
                        </TD>
                        <TD className="text-right">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => del("assignments", a.id)}
                              data-testid={`delete-ta-${a.id}`}
                              title="Delete Dispatch"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          )}
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
    </div>
  );
}
