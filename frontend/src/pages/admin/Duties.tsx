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

interface Duty {
  id: number;
  staff_id: number;
  staff_name?: string;
  category?: string;
  room_id: number;
  room_name?: string;
  floor_id?: number;
  floor_name?: string;
  building_id?: number;
  building_name?: string;
  duty_type: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
}

interface RoomOpt {
  id: number;
  name: string;
  floor: string;
  building: string;
  label: string;
}

const emptyAssignForm = {
  staff_id: null as number | null,
  room_id: "",
  duty_type: "",
  start_time: "",
  end_time: "",
  notes: "",
};

export default function Duties() {
  const { canEdit } = useModuleAccess("staff");
  const [duties, setDuties] = useState<Duty[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [dutyTypes, setDutyTypes] = useState<string[]>([]);
  const [staffCategories, setStaffCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStaffId, setFilterStaffId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterDutyType, setFilterDutyType] = useState<string>("ALL");
  const [filterBuilding, setFilterBuilding] = useState<string>("ALL");
  const [filterDate, setFilterDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");

  // Create Duty Modal
  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState(emptyAssignForm);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Duty[]>("/staff/duties"),
      api.get<StaffOption[]>("/staff"),
      api.get<RoomOpt[]>("/accommodation/rooms"),
      api.get<{ duty_types: string[]; staff_categories: string[] }>("/staff/meta"),
    ])
      .then(([d, s, r, m]) => {
        setDuties(d.data);
        setStaff(s.data);
        setRooms(r.data);
        setDutyTypes(m.data.duty_types);
        setStaffCategories(m.data.staff_categories);
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

  // Distinct duty types currently assigned
  const allDutyTypes = useMemo(() => {
    const set = new Set<string>(dutyTypes);
    for (const d of duties) {
      if (d.duty_type) set.add(d.duty_type);
    }
    return Array.from(set).sort();
  }, [dutyTypes, duties]);

  // Filtered duties
  const filteredDuties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return duties.filter((d) => {
      const matchesSearch =
        !q ||
        (d.staff_name && d.staff_name.toLowerCase().includes(q)) ||
        (d.duty_type && d.duty_type.toLowerCase().includes(q)) ||
        (d.room_name && d.room_name.toLowerCase().includes(q)) ||
        (d.building_name && d.building_name.toLowerCase().includes(q)) ||
        (d.notes && d.notes.toLowerCase().includes(q));

      const matchesStaff = !filterStaffId || d.staff_id === filterStaffId;
      const matchesCat =
        filterCategory === "ALL" || (d.category || "").toLowerCase() === filterCategory.toLowerCase();
      const matchesType =
        filterDutyType === "ALL" || (d.duty_type || "").toLowerCase() === filterDutyType.toLowerCase();
      const matchesBldg =
        filterBuilding === "ALL" || (d.building_name || "").toLowerCase() === filterBuilding.toLowerCase();
      const matchesDate =
        !filterDate ||
        (d.start_time && d.start_time.startsWith(filterDate)) ||
        (d.end_time && d.end_time.startsWith(filterDate));

      return matchesSearch && matchesStaff && matchesCat && matchesType && matchesBldg && matchesDate;
    });
  }, [duties, search, filterStaffId, filterCategory, filterDutyType, filterBuilding, filterDate]);

  // Pagination for list view
  useEffect(() => {
    setPage(1);
  }, [search, filterStaffId, filterCategory, filterDutyType, filterBuilding, filterDate]);

  const totalPages = Math.max(1, Math.ceil(filteredDuties.length / PAGE_SIZE));
  const pagedDuties = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredDuties.slice(start, start + PAGE_SIZE);
  }, [filteredDuties, page]);

  // Grouped by Building & Floor for grouped view
  const grouped = useMemo(() => {
    const byFloor = new Map<string, { floor: string; building: string; rows: Duty[] }>();
    for (const d of filteredDuties) {
      const key = `${d.building_name ?? "General Areas"} / ${d.floor_name ?? "General"}`;
      if (!byFloor.has(key)) {
        byFloor.set(key, {
          floor: d.floor_name ?? "General",
          building: d.building_name ?? "General Areas",
          rows: [],
        });
      }
      byFloor.get(key)!.rows.push(d);
    }
    return Array.from(byFloor.values()).sort(
      (a, b) => a.building.localeCompare(b.building) || a.floor.localeCompare(b.floor),
    );
  }, [filteredDuties]);

  const addDuty = async () => {
    if (!form.staff_id) return toast.error("Select a staff member");
    if (!form.room_id) return toast.error("Select a location / room");
    if (!form.duty_type.trim()) return toast.error("Duty type is required");

    try {
      await api.post("/staff/duties", {
        staff_id: Number(form.staff_id),
        room_id: Number(form.room_id),
        duty_type: form.duty_type.trim(),
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        notes: form.notes.trim() || null,
      });
      toast.success("Duty assignment saved");
      setOpenModal(false);
      setForm(emptyAssignForm);
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

  const clearAllFilters = () => {
    setSearch("");
    setFilterStaffId(null);
    setFilterCategory("ALL");
    setFilterDutyType("ALL");
    setFilterBuilding("ALL");
    setFilterDate("");
  };

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(filterStaffId) ||
    filterCategory !== "ALL" ||
    filterDutyType !== "ALL" ||
    filterBuilding !== "ALL" ||
    Boolean(filterDate);

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading staff duty rosters & assignments…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-staff-duties" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            ASSIGNMENT ROSTER
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Staff Duties & Allotments
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Assign and monitor tournament personnel: <strong>WHO</strong> is deployed to <strong>WHAT</strong> duty,{" "}
            <strong>WHERE</strong> (building/room), and <strong>WHEN</strong> (shift window).
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              setForm(emptyAssignForm);
              setOpenModal(true);
            }}
            data-testid="add-duty-btn"
            className="text-xs font-extrabold shrink-0"
          >
            <Plus className="h-4 w-4" /> Assign New Duty
          </Button>
        )}
      </div>

      {/* FILTER PANEL */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3 shadow-sm">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* SEARCH */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search staff, duty, location…"
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
            <option value="ALL">All Duty Types</option>
            {allDutyTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          {/* BUILDING LOCATION */}
          <Select
            value={filterBuilding}
            onChange={(e) => setFilterBuilding(e.target.value)}
            className="h-9 text-xs"
          >
            <option value="ALL">All Buildings</option>
            {buildings.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </div>

        {/* SECONDARY ROW: CATEGORY, DATE, VIEW TOGGLE, RESET */}
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
              Building View
            </button>
          </div>
        </div>
      </div>

      {/* DUTIES DISPLAY */}
      {duties.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No duty allotments yet"
            hint="Click 'Assign New Duty' above to assign personnel to rooms and shifts."
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
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge tone="gold" size="sm">
                        {d.duty_type}
                      </Badge>
                      <span className="text-xs text-slate-300 font-medium truncate">
                        {d.room_name || "Assigned Area"}
                      </span>
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

                {(d.building_name || d.floor_name) && (
                  <p className="text-xs text-slate-400 font-body flex items-center gap-1">
                    <Building className="h-3 w-3 text-slate-500" />
                    {d.building_name} {d.floor_name ? `· ${d.floor_name}` : ""}
                  </p>
                )}

                <div className="border-t border-white/5 pt-2 text-[11px] font-mono text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3 text-slate-500" />
                  {d.start_time ? formatDate(d.start_time) : "No shift start"}
                  {d.end_time ? ` → ${formatDate(d.end_time)}` : ""}
                </div>

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
                  <TH>Duty Type (WHAT)</TH>
                  <TH>Location & Room (WHERE)</TH>
                  <TH>Shift Window (WHEN)</TH>
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
                          <p className="font-heading font-bold text-white text-xs">
                            {d.room_name || "—"}
                          </p>
                          {(d.building_name || d.floor_name) && (
                            <p className="text-[11px] text-slate-400 font-body">
                              {d.building_name} {d.floor_name ? `· ${d.floor_name}` : ""}
                            </p>
                          )}
                        </div>
                      </TD>
                      <TD className="text-slate-400 font-mono text-xs">
                        {d.start_time ? formatDate(d.start_time) : "—"}
                        {d.end_time ? ` → ${formatDate(d.end_time)}` : ""}
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
        /* GROUPED BUILDING VIEW */
        <div className="space-y-6">
          {grouped.map((g) => (
            <div
              key={`${g.building}-${g.floor}`}
              className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-gold" />
                  <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">
                    {g.building} · {g.floor}
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
                        <p className="text-[11px] text-slate-300 font-medium mt-0.5">{d.room_name || "Room"}</p>
                      </div>
                      <Badge tone="gold" size="sm">
                        {d.duty_type}
                      </Badge>
                    </div>

                    <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1 border-t border-white/5 pt-1.5">
                      <Clock className="h-2.5 w-2.5 text-slate-500" />
                      {d.start_time ? formatDate(d.start_time) : "Flexible"}
                      {d.end_time ? ` → ${formatDate(d.end_time)}` : ""}
                    </p>

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

      {/* ASSIGN DUTY DIALOG */}
      <Dialog
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Assign Operational Duty"
        testId="assign-duty-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Staff Personnel *</Label>
            <StaffSelector
              staff={staff}
              value={form.staff_id}
              onChange={(id) => setForm((f) => ({ ...f, staff_id: id }))}
              placeholder="Search staff to assign…"
              testId="assign-duty-staff-selector"
            />
          </div>

          <div>
            <Label>Location / Room Assignment *</Label>
            <Select
              value={form.room_id}
              onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
              data-testid="duty-room-select"
            >
              <option value="">Select room / station…</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Duty Type *</Label>
            <Input
              placeholder="e.g. Ground Supervisor, Security, Medical, Warden"
              list="duty-type-list"
              value={form.duty_type}
              onChange={(e) => setForm((f) => ({ ...f, duty_type: e.target.value }))}
              data-testid="duty-type-input"
            />
            <datalist id="duty-type-list">
              {allDutyTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Shift Start Time</Label>
              <Input
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div>
              <Label>Shift End Time</Label>
              <Input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Special Shift Notes</Label>
            <Textarea
              placeholder="Keys required, emergency protocol, communication channel…"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={addDuty} data-testid="save-duty-btn">
              Save Duty Assignment
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
