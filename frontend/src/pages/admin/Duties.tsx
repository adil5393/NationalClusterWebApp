import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  HardHat,
  Search,
  Building,
  Clock,
  Filter,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  User,
  CheckCircle2,
  MapPin,
  AlertTriangle,
  Pencil,
  Power,
  Shield,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { useModuleAccess } from "@/lib/permissions";
import { StaffSelector, StaffOption } from "@/components/admin/StaffSelector";

export interface Duty {
  id: number;
  staff_id: number;
  shift_id?: number | null;
  shift_name?: string | null;
  staff_name?: string;
  category?: string;
  room_id?: number | null;
  room_name?: string;
  location_id?: number | null;
  location_name?: string;
  location_type?: string;
  floor_id?: number;
  floor_name?: string;
  building_id?: number;
  building_name?: string;
  duty_type: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
  warning?: string | null;
}

export interface EventLocationItem {
  id: number;
  name: string;
  location_type: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  duty_count?: number;
}

export interface ShiftOption {
  id: number;
  shift_block_id?: number;
  shift_name?: string;
  staff_id: number;
  staff_name?: string;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

interface RoomOpt {
  id: number;
  name: string;
  floor: string;
  building: string;
  label: string;
}

export const LOCATION_TYPES = [
  "GROUND",
  "MAT",
  "GATE",
  "ROOM",
  "ACCOMMODATION",
  "FOOD",
  "TRANSPORT",
  "MEDICAL",
  "OPERATIONS",
  "PARKING",
  "OTHER",
] as const;

const emptyAssignForm = {
  staff_id: null as number | null,
  shift_id: "" as string,
  location_id: "" as string,
  room_id: "" as string,
  duty_type: "",
  start_time: "",
  end_time: "",
  notes: "",
};

const emptyLocationForm = {
  name: "",
  location_type: "GROUND",
  description: "",
  sort_order: 0,
  is_active: true,
};

export default function Duties() {
  const { canEdit } = useModuleAccess("staff");
  const [mainTab, setMainTab] = useState<"duties" | "locations">("duties");

  // Core data
  const [duties, setDuties] = useState<Duty[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [locations, setLocations] = useState<EventLocationItem[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [dutyTypes, setDutyTypes] = useState<string[]>([]);
  const [staffCategories, setStaffCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters for Duties
  const [search, setSearch] = useState("");
  const [filterStaffId, setFilterStaffId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterDutyType, setFilterDutyType] = useState<string>("ALL");
  const [filterBuilding, setFilterBuilding] = useState<string>("ALL");
  const [filterLocationId, setFilterLocationId] = useState<string>("ALL");
  const [filterDate, setFilterDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");

  // Create/Edit Duty Modal
  const [openDutyModal, setOpenDutyModal] = useState(false);
  const [dutyForm, setDutyForm] = useState(emptyAssignForm);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Event Location Modal
  const [openLocationModal, setOpenLocationModal] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Duty[]>("/staff/duties"),
      api.get<StaffOption[]>("/staff"),
      api.get<RoomOpt[]>("/accommodation/rooms"),
      api.get<EventLocationItem[]>("/event-locations"),
      api.get<ShiftOption[]>("/staff/shifts"),
      api.get<{ duty_types: string[]; staff_categories: string[] }>("/staff/meta"),
    ])
      .then(([d, s, r, l, sh, m]) => {
        setDuties(d.data);
        setStaff(s.data);
        setRooms(r.data);
        setLocations(l.data);
        setShifts(sh.data);
        setDutyTypes(m.data.duty_types);
        setStaffCategories(m.data.staff_categories);
      })
      .catch((err) => {
        console.error("Failed to load duties and operations data:", err);
        toast.error(err?.response?.data?.detail ?? "Failed to load operations data");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Distinct buildings from rooms for filter
  const buildings = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) {
      if (r.building) set.add(r.building);
    }
    return Array.from(set).sort();
  }, [rooms]);

  // Distinct duty types currently assigned or available
  const allDutyTypes = useMemo(() => {
    const set = new Set<string>(dutyTypes);
    for (const d of duties) {
      if (d.duty_type) set.add(d.duty_type);
    }
    return Array.from(set).sort();
  }, [dutyTypes, duties]);

  // Available shifts for selected staff in duty form
  const availableShiftsForStaff = useMemo(() => {
    if (!dutyForm.staff_id) return [];
    return shifts.filter((s) => s.staff_id === dutyForm.staff_id);
  }, [shifts, dutyForm.staff_id]);

  // Active locations for new duty selector
  const activeLocations = useMemo(() => {
    return locations.filter((l) => l.is_active);
  }, [locations]);

  // Filtered duties
  const filteredDuties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return duties.filter((d) => {
      const matchesSearch =
        !q ||
        (d.staff_name && d.staff_name.toLowerCase().includes(q)) ||
        (d.duty_type && d.duty_type.toLowerCase().includes(q)) ||
        (d.location_name && d.location_name.toLowerCase().includes(q)) ||
        (d.room_name && d.room_name.toLowerCase().includes(q)) ||
        (d.building_name && d.building_name.toLowerCase().includes(q)) ||
        (d.shift_name && d.shift_name.toLowerCase().includes(q)) ||
        (d.notes && d.notes.toLowerCase().includes(q));

      const matchesStaff = !filterStaffId || d.staff_id === filterStaffId;
      const matchesCat =
        filterCategory === "ALL" || (d.category || "").toLowerCase() === filterCategory.toLowerCase();
      const matchesType =
        filterDutyType === "ALL" || (d.duty_type || "").toLowerCase() === filterDutyType.toLowerCase();
      const matchesBldg =
        filterBuilding === "ALL" || (d.building_name || "").toLowerCase() === filterBuilding.toLowerCase();
      const matchesLoc =
        filterLocationId === "ALL" || String(d.location_id) === filterLocationId;
      const matchesDate =
        !filterDate ||
        (d.start_time && d.start_time.startsWith(filterDate)) ||
        (d.end_time && d.end_time.startsWith(filterDate));

      return matchesSearch && matchesStaff && matchesCat && matchesType && matchesBldg && matchesLoc && matchesDate;
    });
  }, [duties, search, filterStaffId, filterCategory, filterDutyType, filterBuilding, filterLocationId, filterDate]);

  // Pagination for list view
  useEffect(() => {
    setPage(1);
  }, [search, filterStaffId, filterCategory, filterDutyType, filterBuilding, filterLocationId, filterDate]);

  const totalPages = Math.max(1, Math.ceil(filteredDuties.length / PAGE_SIZE));
  const pagedDuties = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredDuties.slice(start, start + PAGE_SIZE);
  }, [filteredDuties, page]);

  // Grouped by Venue / Building for grouped view
  const grouped = useMemo(() => {
    const byVenue = new Map<string, { venue: string; rows: Duty[] }>();
    for (const d of filteredDuties) {
      const key = d.location_name
        ? `📍 ${d.location_name} (${d.location_type || "VENUE"})`
        : `${d.building_name ?? "General Areas"} / ${d.floor_name ?? "General"}`;
      if (!byVenue.has(key)) {
        byVenue.set(key, { venue: key, rows: [] });
      }
      byVenue.get(key)!.rows.push(d);
    }
    return Array.from(byVenue.values()).sort((a, b) => a.venue.localeCompare(b.venue));
  }, [filteredDuties]);

  const pad = (n: number) => String(n).padStart(2, "0");

  const formatDutyWindow = (startIso?: string | null, endIso?: string | null) => {
    if (!startIso && !endIso) return "Flexible / All Day";
    const sDate = startIso ? new Date(startIso) : null;
    const eDate = endIso ? new Date(endIso) : null;
    const sDateStr = sDate && !Number.isNaN(sDate.getTime()) ? formatDate(startIso) : "";
    const eDateStr = eDate && !Number.isNaN(eDate.getTime()) ? formatDate(endIso) : "";
    const sTime = sDate && !Number.isNaN(sDate.getTime()) ? `${pad(sDate.getHours())}:${pad(sDate.getMinutes())}` : "";
    const eTime = eDate && !Number.isNaN(eDate.getTime()) ? `${pad(eDate.getHours())}:${pad(eDate.getMinutes())}` : "";

    if (sDateStr && eDateStr && sDateStr === eDateStr) {
      return `${sDateStr} · ${sTime}${eTime ? ` – ${eTime}` : ""}`;
    }
    if (sDateStr && eDateStr) {
      return `${sDateStr} ${sTime} → ${eDateStr} ${eTime}`;
    }
    return sDateStr ? `${sDateStr} ${sTime}` : (eDateStr ? `${eDateStr} ${eTime}` : "Flexible");
  };

  // When staff selection changes in form, reset or auto-adjust shift
  const handleStaffChange = (staffId: number | null) => {
    setDutyForm((prev) => ({
      ...prev,
      staff_id: staffId,
      shift_id: "",
    }));
  };

  // When shift selection changes, optionally auto-populate start/end times
  const handleShiftSelect = (shiftIdStr: string) => {
    if (!shiftIdStr) {
      setDutyForm((prev) => ({ ...prev, shift_id: "" }));
      return;
    }
    const shift = shifts.find((s) => s.id === Number(shiftIdStr));
    if (shift) {
      // convert ISO to datetime-local format (YYYY-MM-DDTHH:MM)
      const toLocalIso = (isoStr: string) => {
        try {
          const d = new Date(isoStr);
          if (Number.isNaN(d.getTime())) return "";
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch {
          return "";
        }
      };

      setDutyForm((prev) => ({
        ...prev,
        shift_id: shiftIdStr,
        start_time: toLocalIso(shift.start_time),
        end_time: toLocalIso(shift.end_time),
      }));
    } else {
      setDutyForm((prev) => ({ ...prev, shift_id: shiftIdStr }));
    }
  };

  const addDuty = async () => {
    if (!dutyForm.staff_id) return toast.error("Select a staff member");
    if (!dutyForm.duty_type.trim()) return toast.error("Duty responsibility is required");

    let startIso: string | null = null;
    let endIso: string | null = null;
    if (dutyForm.start_time) {
      const d = new Date(dutyForm.start_time);
      if (!Number.isNaN(d.getTime())) startIso = d.toISOString();
    }
    if (dutyForm.end_time) {
      const d = new Date(dutyForm.end_time);
      if (!Number.isNaN(d.getTime())) endIso = d.toISOString();
    }

    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      return toast.error("Duty end time must be after start time");
    }

    try {
      const res = await api.post("/staff/duties", {
        staff_id: Number(dutyForm.staff_id),
        shift_id: dutyForm.shift_id ? Number(dutyForm.shift_id) : null,
        location_id: dutyForm.location_id ? Number(dutyForm.location_id) : null,
        room_id: dutyForm.room_id ? Number(dutyForm.room_id) : null,
        duty_type: dutyForm.duty_type.trim(),
        start_time: startIso,
        end_time: endIso,
        notes: dutyForm.notes.trim() || null,
      });

      if (res.data?.warning) {
        toast.warning(res.data.warning);
      } else {
        toast.success("Duty assignment saved");
      }
      setOpenDutyModal(false);
      setDutyForm(emptyAssignForm);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not assign duty");
    }
  };

  const delDuty = async (id: number) => {
    if (!confirm("Remove this duty assignment?")) return;
    try {
      await api.delete(`/staff/duties/${id}`);
      toast.success("Duty assignment removed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not remove duty assignment");
    }
  };

  // Location management actions
  const openCreateLocation = () => {
    setEditingLocationId(null);
    setLocationForm(emptyLocationForm);
    setOpenLocationModal(true);
  };

  const openEditLocation = (loc: EventLocationItem) => {
    setEditingLocationId(loc.id);
    setLocationForm({
      name: loc.name,
      location_type: loc.location_type,
      description: loc.description || "",
      sort_order: loc.sort_order ?? 0,
      is_active: loc.is_active,
    });
    setOpenLocationModal(true);
  };

  const saveLocation = async () => {
    if (!locationForm.name.trim()) return toast.error("Location name is required");
    try {
      if (editingLocationId) {
        await api.put(`/event-locations/${editingLocationId}`, {
          name: locationForm.name.trim(),
          location_type: locationForm.location_type,
          description: locationForm.description.trim() || null,
          sort_order: Number(locationForm.sort_order) || 0,
          is_active: locationForm.is_active,
        });
        toast.success("Event location updated");
      } else {
        await api.post("/event-locations", {
          name: locationForm.name.trim(),
          location_type: locationForm.location_type,
          description: locationForm.description.trim() || null,
          sort_order: Number(locationForm.sort_order) || 0,
          is_active: locationForm.is_active,
        });
        toast.success("Event location created");
      }
      setOpenLocationModal(false);
      setEditingLocationId(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save event location");
    }
  };

  const toggleLocationActive = async (loc: EventLocationItem) => {
    try {
      await api.put(`/event-locations/${loc.id}`, {
        is_active: !loc.is_active,
      });
      toast.success(`Location ${loc.is_active ? "deactivated" : "activated"}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update location status");
    }
  };

  const deleteLocation = async (loc: EventLocationItem) => {
    if (!confirm(`Delete location "${loc.name}"? If duties are attached, you should deactivate it instead.`)) return;
    try {
      await api.delete(`/event-locations/${loc.id}`);
      toast.success("Event location deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete location");
    }
  };

  const clearAllFilters = () => {
    setSearch("");
    setFilterStaffId(null);
    setFilterCategory("ALL");
    setFilterDutyType("ALL");
    setFilterBuilding("ALL");
    setFilterLocationId("ALL");
    setFilterDate("");
  };

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(filterStaffId) ||
    filterCategory !== "ALL" ||
    filterDutyType !== "ALL" ||
    filterBuilding !== "ALL" ||
    filterLocationId !== "ALL" ||
    Boolean(filterDate);

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading tournament operations & roster…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-staff-duties" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            TOURNAMENT OPERATIONS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Operational Duties & Venues
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Manage operational deployments: <strong>WHO</strong> (Staff), <strong>WHAT</strong> (Duty),{" "}
            <strong>WHERE</strong> (Event Location / Venue), and <strong>WHEN</strong> (Shift Window).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mainTab === "duties" && canEdit && (
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setDutyForm(emptyAssignForm);
                setOpenDutyModal(true);
              }}
              data-testid="add-duty-btn"
              className="text-xs font-extrabold shrink-0"
            >
              <Plus className="h-4 w-4" /> Assign New Duty
            </Button>
          )}
          {mainTab === "locations" && canEdit && (
            <Button
              variant="gold"
              size="sm"
              onClick={openCreateLocation}
              data-testid="add-location-btn"
              className="text-xs font-extrabold shrink-0"
            >
              <Plus className="h-4 w-4" /> + Add Event Location
            </Button>
          )}
        </div>
      </div>

      {/* TOP NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setMainTab("duties")}
          data-testid="tab-duties"
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-heading text-xs font-bold transition-all",
            mainTab === "duties"
              ? "bg-gold text-obsidian font-black shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>Duty Allotments ({duties.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab("locations")}
          data-testid="tab-locations"
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-heading text-xs font-bold transition-all",
            mainTab === "locations"
              ? "bg-gold text-obsidian font-black shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <MapPin className="h-3.5 w-3.5" />
          <span>Event Locations Catalogue ({locations.length})</span>
        </button>
      </div>

      {/* TAB 1: DUTY ALLOTMENTS */}
      {mainTab === "duties" && (
        <>
          {/* FILTER PANEL */}
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3 shadow-sm">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {/* SEARCH */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Search staff, duty, location, shift…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                  data-testid="duty-search-input"
                />
              </div>

              {/* STAFF FILTER */}
              <div>
                <StaffSelector
                  staff={staff}
                  value={filterStaffId}
                  onChange={setFilterStaffId}
                  placeholder="Filter by staff personnel…"
                  testId="duty-staff-filter"
                />
              </div>

              {/* DUTY TYPE */}
              <Select
                value={filterDutyType}
                onChange={(e) => setFilterDutyType(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="ALL">All Duty Responsibilities</option>
                {allDutyTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>

              {/* EVENT LOCATION FILTER */}
              <Select
                value={filterLocationId}
                onChange={(e) => setFilterLocationId(e.target.value)}
                className="h-9 text-xs"
              >
                <option value="ALL">All Event Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={String(loc.id)}>
                    {loc.name} ({loc.location_type})
                  </option>
                ))}
              </Select>
            </div>

            {/* SECONDARY ROW */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/5 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="h-8 text-xs w-36"
                >
                  <option value="ALL">All Categories</option>
                  {staffCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>

                {buildings.length > 0 && (
                  <Select
                    value={filterBuilding}
                    onChange={(e) => setFilterBuilding(e.target.value)}
                    className="h-8 text-xs w-36"
                  >
                    <option value="ALL">All Buildings</option>
                    {buildings.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                )}

                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="h-8 text-xs w-36"
                  placeholder="Filter date"
                />

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs font-semibold text-gold hover:underline"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* VIEW TOGGLE */}
              <div className="flex items-center gap-1 bg-obsidian-950 p-0.5 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-heading font-bold transition-colors",
                    viewMode === "list" ? "bg-gold text-obsidian font-black" : "text-slate-400 hover:text-white",
                  )}
                >
                  List View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grouped")}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-heading font-bold transition-colors",
                    viewMode === "grouped" ? "bg-gold text-obsidian font-black" : "text-slate-400 hover:text-white",
                  )}
                >
                  Venue View
                </button>
              </div>
            </div>
          </div>

          {/* DUTIES DISPLAY */}
          {duties.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No duty allotments yet"
                hint="Click 'Assign New Duty' above to assign personnel to operational venues and shifts."
              />
            </div>
          ) : filteredDuties.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No matching duties found"
                hint="Try broadening your search or resetting the active filters."
              />
            </div>
          ) : viewMode === "list" ? (
            <>
              {/* MOBILE: STACKED CARDS */}
              <div className="grid gap-2.5 sm:hidden">
                {pagedDuties.map((d) => (
                  <div
                    key={d.id}
                    data-testid={`duty-card-${d.id}`}
                    className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-bold text-white text-sm truncate">
                            {d.staff_name || "Unassigned"}
                          </span>
                          {d.category && (
                            <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-semibold text-gold">
                              {d.category}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <Badge tone="gold" size="sm">
                            {d.duty_type}
                          </Badge>
                          {d.location_name && (
                            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {d.location_name}
                            </span>
                          )}
                          {!d.location_name && d.room_name && (
                            <span className="text-xs text-slate-300 font-medium">
                              {d.room_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => delDuty(d.id)}
                          data-testid={`delete-duty-${d.id}`}
                          title="Remove Duty"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      )}
                    </div>

                    {d.shift_name && (
                      <p className="text-xs text-gold font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Shift: {d.shift_name}
                      </p>
                    )}

                    <div className="border-t border-white/5 pt-2 text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      {formatDutyWindow(d.start_time, d.end_time)}
                    </div>

                    {d.warning && (
                      <p className="text-[11px] text-amber-400 flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {d.warning}
                      </p>
                    )}

                    {d.notes && (
                      <p className="text-xs text-slate-300 font-body italic border-t border-white/5 pt-1.5">
                        "{d.notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* DESKTOP & TABLET: STRUCTURED TABLE */}
              <div className="hidden sm:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden shadow-sm">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-10">#</TH>
                      <TH>Personnel (WHO)</TH>
                      <TH>Responsibility (WHAT)</TH>
                      <TH>Operational Venue (WHERE)</TH>
                      <TH>Shift & Time (WHEN)</TH>
                      <TH>Notes</TH>
                      <TH className="text-right">Action</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pagedDuties.map((d, i) => {
                      const serial = (page - 1) * PAGE_SIZE + i + 1;
                      return (
                        <TR key={d.id} data-testid={`duty-row-${d.id}`}>
                          <TD className="text-slate-500 font-mono text-xs">{serial}</TD>
                          <TD>
                            <div>
                              <p className="font-heading font-bold text-white text-xs">{d.staff_name || "—"}</p>
                              {d.category && (
                                <span className="text-[10px] font-mono text-gold">{d.category}</span>
                              )}
                            </div>
                          </TD>
                          <TD>
                            <Badge tone="gold" size="sm">
                              {d.duty_type}
                            </Badge>
                          </TD>
                          <TD>
                            <div>
                              {d.location_name ? (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  <div>
                                    <p className="font-heading font-bold text-white text-xs">
                                      {d.location_name}
                                    </p>
                                    {d.location_type && (
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {d.location_type}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : d.room_name ? (
                                <div>
                                  <p className="font-heading font-bold text-white text-xs">
                                    {d.room_name}
                                  </p>
                                  {(d.building_name || d.floor_name) && (
                                    <p className="text-[11px] text-slate-400 font-body">
                                      {d.building_name} {d.floor_name ? `· ${d.floor_name}` : ""}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500 text-xs italic">Flexible / Roaming</span>
                              )}
                            </div>
                          </TD>
                          <TD className="text-slate-400 font-mono text-xs">
                            {d.shift_name && (
                              <span className="block font-heading font-bold text-gold text-xs">
                                {d.shift_name}
                              </span>
                            )}
                            <div>
                              {formatDutyWindow(d.start_time, d.end_time)}
                            </div>
                            {d.warning && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-sans mt-0.5" title={d.warning}>
                                <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> Outside shift
                              </span>
                            )}
                          </TD>
                          <TD className="text-slate-300 font-body text-xs max-w-xs truncate">
                            {d.notes || "—"}
                          </TD>
                          <TD className="text-right">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => delDuty(d.id)}
                                data-testid={`delete-duty-${d.id}`}
                                title="Remove Duty Assignment"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400 font-mono">
                  <span>
                    Page {page} of {totalPages} · {filteredDuties.length} Duties
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-8 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="h-8 text-xs"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* GROUPED VENUE VIEW */
            <div className="space-y-6">
              {grouped.map((g) => (
                <div
                  key={g.venue}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-emerald-400" />
                      <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">
                        {g.venue}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/20">
                      {g.rows.length} Allotment{g.rows.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {g.rows.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-lg border border-white/5 bg-obsidian-950 p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div>
                            <p className="font-heading font-bold text-white text-xs">{d.staff_name || "—"}</p>
                            {d.shift_name && (
                              <p className="text-[10px] text-gold font-mono">{d.shift_name}</p>
                            )}
                          </div>
                          <Badge tone="gold" size="sm">
                            {d.duty_type}
                          </Badge>
                        </div>

                        <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1 border-t border-white/5 pt-1.5">
                          <Clock className="h-2.5 w-2.5 text-slate-500" />
                          {formatDutyWindow(d.start_time, d.end_time)}
                        </p>

                        {d.warning && (
                          <p className="text-[10px] text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> {d.warning}
                          </p>
                        )}

                        {canEdit && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => delDuty(d.id)}
                              className="text-[11px] text-red-400 hover:underline flex items-center gap-1"
                            >
                              <Trash2 className="h-2.5 w-2.5" /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 2: EVENT LOCATIONS CATALOGUE */}
      {mainTab === "locations" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-heading font-bold text-white text-base">Operational Event Locations</h3>
              <p className="text-xs text-slate-400">
                Catalogue of physical event venues, match courts, gates, hospitality and operational stations.
              </p>
            </div>
            {canEdit && (
              <Button variant="gold" size="sm" onClick={openCreateLocation} data-testid="add-location-btn-top">
                <Plus className="h-3.5 w-3.5" /> New Location
              </Button>
            )}
          </div>

          {locations.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No event locations configured"
                hint="Add operational tournament venues such as Main Gate, Ground 1, Ground 2, Reception, etc."
              />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden shadow-sm">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10">#</TH>
                    <TH>Location Name</TH>
                    <TH>Type</TH>
                    <TH>Description</TH>
                    <TH className="text-center">Status</TH>
                    <TH className="text-center">Attached Duties</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {locations.map((loc, i) => (
                    <TR key={loc.id} data-testid={`location-row-${loc.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <MapPin className={cn("h-4 w-4 shrink-0", loc.is_active ? "text-emerald-400" : "text-slate-500")} />
                          <div>
                            <span className={cn("font-heading font-bold text-sm block", loc.is_active ? "text-white" : "text-slate-400 line-through")}>
                              {loc.name}
                            </span>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={loc.is_active ? "gold" : "neutral"} size="sm">
                          {loc.location_type}
                        </Badge>
                      </TD>
                      <TD className="text-xs text-slate-300 max-w-sm">
                        {loc.description || "—"}
                      </TD>
                      <TD className="text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-heading font-bold uppercase",
                            loc.is_active
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-slate-700/40 text-slate-400 border border-slate-700"
                          )}
                        >
                          {loc.is_active ? "Active" : "Inactive"}
                        </span>
                      </TD>
                      <TD className="text-center font-mono text-xs">
                        <span className="text-white font-bold">{loc.duty_count ?? 0}</span>
                      </TD>
                      <TD className="text-right">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => toggleLocationActive(loc)}
                              title={loc.is_active ? "Deactivate location" : "Activate location"}
                              data-testid={`toggle-location-${loc.id}`}
                            >
                              <Power className={cn("h-3.5 w-3.5", loc.is_active ? "text-amber-400" : "text-emerald-400")} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEditLocation(loc)}
                              title="Edit location"
                              data-testid={`edit-location-${loc.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteLocation(loc)}
                              title="Delete location"
                              data-testid={`delete-location-${loc.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </div>
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

      {/* ASSIGN DUTY DIALOG */}
      <Dialog
        open={openDutyModal}
        onClose={() => setOpenDutyModal(false)}
        title="Assign Operational Duty"
        testId="assign-duty-dialog"
      >
        <div className="space-y-3.5">
          {/* STAFF PERSONNEL */}
          <div>
            <Label>Staff Personnel *</Label>
            <StaffSelector
              staff={staff}
              value={dutyForm.staff_id}
              onChange={handleStaffChange}
              placeholder="Search staff to assign…"
              testId="assign-duty-staff-selector"
            />
          </div>

          {/* SHIFT SELECTION */}
          <div>
            <Label>Shift Assignment</Label>
            <Select
              value={dutyForm.shift_id}
              onChange={(e) => handleShiftSelect(e.target.value)}
              data-testid="duty-shift-select"
            >
              <option value="">No Shift / Emergency Duty (Flexible)</option>
              {availableShiftsForStaff.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.shift_name || `Shift #${sh.id}`} ({formatDate(sh.start_time)} → {formatDate(sh.end_time)})
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Select an assigned shift to synchronize timing, or choose "No Shift" for emergency assignments.
            </p>
          </div>

          {/* DUTY RESPONSIBILITY */}
          <div>
            <Label>Duty Responsibility *</Label>
            <Input
              placeholder="e.g. Ground Coordination, Match Control, Team Reception, Security"
              list="duty-type-list"
              value={dutyForm.duty_type}
              onChange={(e) => setDutyForm((f) => ({ ...f, duty_type: e.target.value }))}
              data-testid="duty-type-input"
            />
            <datalist id="duty-type-list">
              {allDutyTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          {/* OPERATIONAL VENUE (EVENT LOCATION) */}
          <div>
            <Label>Operational Location (WHERE)</Label>
            <Select
              value={dutyForm.location_id}
              onChange={(e) => setDutyForm((f) => ({ ...f, location_id: e.target.value, room_id: "" }))}
              data-testid="duty-location-select"
            >
              <option value="">Select Operational Venue (Ground, Gate, Reception…) </option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  📍 {loc.name} ({loc.location_type})
                </option>
              ))}
            </Select>
          </div>

          {/* LEGACY ROOM ASSIGNMENT (OPTIONAL) */}
          {rooms.length > 0 && !dutyForm.location_id && (
            <div>
              <Label>Or Legacy Room Assignment</Label>
              <Select
                value={dutyForm.room_id}
                onChange={(e) => setDutyForm((f) => ({ ...f, room_id: e.target.value, location_id: "" }))}
                data-testid="duty-room-select"
              >
                <option value="">None (Operational Venue above preferred)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* TIME WINDOW */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Duty Start Time</Label>
              <Input
                type="datetime-local"
                value={dutyForm.start_time}
                onChange={(e) => setDutyForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div>
              <Label>Duty End Time</Label>
              <Input
                type="datetime-local"
                value={dutyForm.end_time}
                onChange={(e) => setDutyForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Special Shift Notes</Label>
            <Textarea
              placeholder="Keys required, communication radio channel, responsibilities…"
              rows={2}
              value={dutyForm.notes}
              onChange={(e) => setDutyForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenDutyModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={addDuty} data-testid="save-duty-btn">
              Save Duty Assignment
            </Button>
          </div>
        </div>
      </Dialog>

      {/* EVENT LOCATION DIALOG */}
      <Dialog
        open={openLocationModal}
        onClose={() => setOpenLocationModal(false)}
        title={editingLocationId ? "Edit Event Location" : "Add Event Location"}
        testId="location-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Location Name *</Label>
            <Input
              placeholder="e.g. Ground 1, Main Gate, Reception, Dining Hall"
              value={locationForm.name}
              onChange={(e) => setLocationForm((f) => ({ ...f, name: e.target.value }))}
              data-testid="location-name-input"
            />
          </div>

          <div>
            <Label>Location Type *</Label>
            <Select
              value={locationForm.location_type}
              onChange={(e) => setLocationForm((f) => ({ ...f, location_type: e.target.value }))}
              data-testid="location-type-select"
            >
              {LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Description / Details</Label>
            <Textarea
              placeholder="Operational details, entry point, capacity, landmarks…"
              rows={2}
              value={locationForm.description}
              onChange={(e) => setLocationForm((f) => ({ ...f, description: e.target.value }))}
              data-testid="location-description-input"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={locationForm.sort_order}
                onChange={(e) => setLocationForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                data-testid="location-sort-order-input"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <label className="flex items-center gap-2 text-xs text-white font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={locationForm.is_active}
                  onChange={(e) => setLocationForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-white/20 bg-obsidian-900 text-gold focus:ring-gold"
                  data-testid="location-active-checkbox"
                />
                Active for new duty assignments
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenLocationModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveLocation} data-testid="save-location-btn">
              {editingLocationId ? "Update Location" : "Create Location"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
