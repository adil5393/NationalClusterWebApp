import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Bus,
  UserCog,
  MapPin,
  Clock,
  Phone,
  Users,
  Search,
  CheckCircle2,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { cn } from "@/lib/utils";
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
  is_active?: boolean;
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

  // Tab State
  const [activeTab, setActiveTab] = useState<"vehicles" | "drivers" | "dispatches">("vehicles");
  const [search, setSearch] = useState("");

  // Modals State
  const [openVehicleModal, setOpenVehicleModal] = useState(false);
  const [openDriverModal, setOpenDriverModal] = useState(false);
  const [openDispatchModal, setOpenDispatchModal] = useState(false);

  // Forms
  const [driverForm, setDriverForm] = useState({ name: "", phone: "" });
  const [vehicleForm, setVehicleForm] = useState({ label: "", capacity: "", driver_id: "" });
  const [dispatchForm, setDispatchForm] = useState({
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

  // Map active assignments to vehicle labels for quick lookup
  const vehicleDispatchesMap = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (a.vehicle_label) {
        if (!map.has(a.vehicle_label)) map.set(a.vehicle_label, []);
        map.get(a.vehicle_label)!.push(a);
      }
    }
    return map;
  }, [assignments]);

  const addDriver = async () => {
    if (!driverForm.name.trim()) return toast.error("Driver name is required");
    try {
      await api.post("/transport/drivers", {
        name: driverForm.name.trim(),
        phone: driverForm.phone.trim() || null,
      });
      toast.success("Driver added to registry");
      setDriverForm({ name: "", phone: "" });
      setOpenDriverModal(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not add driver");
    }
  };

  const addVehicle = async () => {
    if (!vehicleForm.label.trim()) return toast.error("Vehicle label is required (e.g. Bus B04)");
    try {
      await api.post("/transport/vehicles", {
        label: vehicleForm.label.trim(),
        capacity: vehicleForm.capacity ? Number(vehicleForm.capacity) : null,
        driver_id: vehicleForm.driver_id ? Number(vehicleForm.driver_id) : null,
      });
      toast.success("Vehicle added to fleet");
      setVehicleForm({ label: "", capacity: "", driver_id: "" });
      setOpenVehicleModal(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not add vehicle");
    }
  };

  const addAssignment = async () => {
    if (!dispatchForm.vehicle_id) return toast.error("Select a vehicle");
    if (!dispatchForm.team_id) return toast.error("Select a team delegation");
    try {
      await api.post("/transport/assignments", {
        vehicle_id: Number(dispatchForm.vehicle_id),
        team_id: Number(dispatchForm.team_id),
        pickup_location: dispatchForm.pickup_location.trim() || null,
        drop_location: dispatchForm.drop_location.trim() || null,
        pickup_time: dispatchForm.pickup_time || null,
        route: dispatchForm.route.trim() || null,
      });
      toast.success("Transit dispatch schedule saved");
      setDispatchForm({
        vehicle_id: "",
        team_id: "",
        pickup_location: "",
        drop_location: "",
        pickup_time: "",
        route: "",
      });
      setOpenDispatchModal(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not assign transit schedule");
    }
  };

  const del = async (kind: "drivers" | "vehicles" | "assignments", id: number) => {
    if (!confirm("Delete this transport record?")) return;
    try {
      await api.delete(`/transport/${kind}/${id}`);
      toast.success("Record deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete record");
    }
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading transport fleet & dispatches…" />
      </div>
    );
  }

  const totalCapacity = vehicles.reduce((sum, v) => sum + (v.capacity || 0), 0);

  return (
    <div data-testid="admin-transport" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            FLEET & TRANSIT LOGISTICS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Transport Operations
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Manage tournament fleet buses, assigned drivers, and station/airport pickup schedules published to team portals.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2 shrink-0">
            {activeTab === "vehicles" && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => setOpenVehicleModal(true)}
                className="text-xs font-extrabold"
              >
                <Plus className="h-4 w-4" /> Add Vehicle
              </Button>
            )}
            {activeTab === "drivers" && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => setOpenDriverModal(true)}
                className="text-xs font-extrabold"
              >
                <Plus className="h-4 w-4" /> Add Driver
              </Button>
            )}
            {activeTab === "dispatches" && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => setOpenDispatchModal(true)}
                className="text-xs font-extrabold"
              >
                <Plus className="h-4 w-4" /> Create Dispatch
              </Button>
            )}
          </div>
        )}
      </div>

      {/* METRIC PILLS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Fleet Vehicles
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-white">{vehicles.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Certified Drivers
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-gold">{drivers.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Team Dispatches
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">{assignments.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Fleet Capacity
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-cyan-400">{totalCapacity} seats</p>
        </div>
      </div>

      {/* SEGMENTED NAVIGATION TABS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex w-full sm:w-auto gap-1 bg-obsidian-950 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("vehicles")}
            className={cn(
              "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-heading font-bold transition-colors",
              activeTab === "vehicles"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <Bus className="h-4 w-4" />
            <span>Vehicles ({vehicles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("drivers")}
            className={cn(
              "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-heading font-bold transition-colors",
              activeTab === "drivers"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <UserCog className="h-4 w-4" />
            <span>Drivers ({drivers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dispatches")}
            className={cn(
              "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-heading font-bold transition-colors",
              activeTab === "dispatches"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <MapPin className="h-4 w-4" />
            <span>Dispatches ({assignments.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder={`Search ${activeTab}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* TAB 1: VEHICLES */}
      {activeTab === "vehicles" && (
        <div className="space-y-4">
          {vehicles.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No vehicles in the fleet"
                hint="Add buses, vans, and shuttles to organize tournament transit."
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles
                .filter((v) => !search || v.label.toLowerCase().includes(search.toLowerCase()) || (v.driver_name && v.driver_name.toLowerCase().includes(search.toLowerCase())))
                .map((v) => {
                  const currentDispatches = vehicleDispatchesMap.get(v.label) || [];
                  return (
                    <div
                      key={v.id}
                      data-testid={`vehicle-card-${v.id}`}
                      className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3 shadow-sm hover:border-gold/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
                            <Bus className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-heading font-black text-white text-base">{v.label}</h3>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                              {v.capacity ? `${v.capacity} Passenger Seats` : "Capacity unspecified"}
                            </p>
                          </div>
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

                      {/* DRIVER INFO */}
                      <div className="rounded-lg bg-obsidian-950 p-2.5 border border-white/5 space-y-1">
                        <p className="text-[10px] font-heading font-extrabold uppercase text-slate-500">
                          Assigned Driver
                        </p>
                        <p className="text-xs font-heading font-bold text-white flex items-center gap-1.5">
                          <UserCog className="h-3.5 w-3.5 text-gold" />
                          {v.driver_name || <span className="text-slate-500 font-normal">Unassigned</span>}
                        </p>
                      </div>

                      {/* ACTIVE DISPATCHES */}
                      <div className="border-t border-white/5 pt-2 text-xs">
                        <p className="text-[10px] font-heading font-bold uppercase text-slate-500 mb-1">
                          Active Dispatches ({currentDispatches.length})
                        </p>
                        {currentDispatches.length === 0 ? (
                          <p className="text-slate-500 text-[11px] italic">No active delegations assigned</p>
                        ) : (
                          <div className="space-y-1">
                            {currentDispatches.map((a) => (
                              <div key={a.id} className="text-[11px] text-slate-300 flex items-center gap-1">
                                <span className="text-gold font-bold">•</span>
                                <span className="font-semibold text-white">{a.team_name}</span>
                                {a.pickup_location && <span className="text-slate-400">({a.pickup_location})</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DRIVERS */}
      {activeTab === "drivers" && (
        <div className="space-y-4">
          {drivers.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No drivers registered"
                hint="Register drivers with their contact numbers for tournament operations."
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {drivers
                .filter((d) => !search || d.name.toLowerCase().includes(search.toLowerCase()) || (d.phone && d.phone.includes(search)))
                .map((d) => {
                  const assignedVehicle = vehicles.find((v) => v.driver_id === d.id);
                  return (
                    <div
                      key={d.id}
                      data-testid={`driver-card-${d.id}`}
                      className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3 shadow-sm hover:border-gold/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-white font-heading font-bold">
                            {d.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-heading font-bold text-white text-base">{d.name}</h3>
                            {d.phone ? (
                              <a
                                href={`tel:${d.phone}`}
                                className="text-xs text-gold font-mono flex items-center gap-1 hover:underline mt-0.5"
                              >
                                <Phone className="h-3 w-3" /> {d.phone}
                              </a>
                            ) : (
                              <p className="text-xs text-slate-500 italic mt-0.5">No phone number</p>
                            )}
                          </div>
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

                      <div className="rounded-lg bg-obsidian-950 p-2.5 border border-white/5 space-y-1">
                        <p className="text-[10px] font-heading font-extrabold uppercase text-slate-500">
                          Assigned Fleet Vehicle
                        </p>
                        <p className="text-xs font-heading font-bold text-white flex items-center gap-1.5">
                          <Bus className="h-3.5 w-3.5 text-gold" />
                          {assignedVehicle ? assignedVehicle.label : <span className="text-slate-500 font-normal">Standby / Unassigned</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DISPATCHES */}
      {activeTab === "dispatches" && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No transit dispatches"
                hint="Schedule pickups and drops for incoming and outgoing team delegations."
              />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden shadow-sm">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10">#</TH>
                    <TH>Team Delegation</TH>
                    <TH>Vehicle</TH>
                    <TH>Pickup Location</TH>
                    <TH>Destination</TH>
                    <TH>Scheduled Time</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {assignments
                    .filter((a) => !search || (a.team_name && a.team_name.toLowerCase().includes(search.toLowerCase())) || (a.vehicle_label && a.vehicle_label.toLowerCase().includes(search.toLowerCase())))
                    .map((a, i) => (
                      <TR key={a.id} data-testid={`dispatch-row-${a.id}`}>
                        <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                        <TD className="font-heading font-bold text-white text-xs">{a.team_name || "—"}</TD>
                        <TD>
                          <Badge tone="gold" size="sm">
                            <Bus className="h-3 w-3" /> {a.vehicle_label || "—"}
                          </Badge>
                        </TD>
                        <TD className="text-slate-300 text-xs font-body">{a.pickup_location || "—"}</TD>
                        <TD className="text-slate-300 text-xs font-body">{a.drop_location || "—"}</TD>
                        <TD className="text-slate-400 font-mono text-xs">
                          {a.pickup_time ? formatDate(a.pickup_time) : "—"}
                        </TD>
                        <TD className="text-right">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => del("assignments", a.id)}
                              data-testid={`delete-dispatch-${a.id}`}
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
          )}
        </div>
      )}

      {/* ADD DRIVER DIALOG */}
      <Dialog
        open={openDriverModal}
        onClose={() => setOpenDriverModal(false)}
        title="Register Certified Driver"
        testId="add-driver-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Driver Full Name *</Label>
            <Input
              value={driverForm.name}
              onChange={(e) => setDriverForm((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Ramesh Kumar"
              data-testid="driver-name-input"
            />
          </div>
          <div>
            <Label>Contact Phone Number</Label>
            <Input
              value={driverForm.phone}
              onChange={(e) => setDriverForm((d) => ({ ...d, phone: e.target.value }))}
              placeholder="e.g. 9876543210"
              data-testid="driver-phone-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenDriverModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={addDriver} data-testid="save-driver-btn">
              Register Driver
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ADD VEHICLE DIALOG */}
      <Dialog
        open={openVehicleModal}
        onClose={() => setOpenVehicleModal(false)}
        title="Add Fleet Vehicle"
        testId="add-vehicle-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Vehicle Label *</Label>
            <Input
              value={vehicleForm.label}
              onChange={(e) => setVehicleForm((v) => ({ ...v, label: e.target.value }))}
              placeholder="e.g. Bus 04 (UP72 AB 1234)"
              data-testid="vehicle-label-input"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Passenger Capacity</Label>
              <Input
                type="number"
                value={vehicleForm.capacity}
                onChange={(e) => setVehicleForm((v) => ({ ...v, capacity: e.target.value }))}
                placeholder="e.g. 45"
              />
            </div>
            <div>
              <Label>Assigned Driver</Label>
              <Select
                value={vehicleForm.driver_id}
                onChange={(e) => setVehicleForm((v) => ({ ...v, driver_id: e.target.value }))}
              >
                <option value="">No Driver Assigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenVehicleModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={addVehicle} data-testid="save-vehicle-btn">
              Add Vehicle
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CREATE DISPATCH DIALOG */}
      <Dialog
        open={openDispatchModal}
        onClose={() => setOpenDispatchModal(false)}
        title="Schedule Team Transit Dispatch"
        testId="add-dispatch-dialog"
      >
        <div className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Team Delegation *</Label>
              <Select
                value={dispatchForm.team_id}
                onChange={(e) => setDispatchForm((f) => ({ ...f, team_id: e.target.value }))}
                data-testid="ta-team-select"
              >
                <option value="">Select team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id} style={t.is_active === false ? { color: "#f59e0b" } : undefined}>
                    {t.is_active === false ? `${t.name} (Inactive)` : t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assigned Vehicle *</Label>
              <Select
                value={dispatchForm.vehicle_id}
                onChange={(e) => setDispatchForm((f) => ({ ...f, vehicle_id: e.target.value }))}
                data-testid="ta-vehicle-select"
              >
                <option value="">Select vehicle…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} {v.driver_name ? `(${v.driver_name})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Pickup Point</Label>
              <Input
                value={dispatchForm.pickup_location}
                onChange={(e) => setDispatchForm((f) => ({ ...f, pickup_location: e.target.value }))}
                placeholder="e.g. Central Railway Station"
              />
            </div>
            <div>
              <Label>Destination</Label>
              <Input
                value={dispatchForm.drop_location}
                onChange={(e) => setDispatchForm((f) => ({ ...f, drop_location: e.target.value }))}
                placeholder="e.g. Campus Hostel A"
              />
            </div>
          </div>

          <div>
            <Label>Scheduled Timing</Label>
            <Input
              type="datetime-local"
              value={dispatchForm.pickup_time}
              onChange={(e) => setDispatchForm((f) => ({ ...f, pickup_time: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenDispatchModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={addAssignment} data-testid="save-dispatch-btn">
              Save Dispatch
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
