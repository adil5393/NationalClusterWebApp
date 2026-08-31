import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, HardHat, ClipboardList, ChevronLeft, ChevronRight, Search, Clock, Building } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { formatDate, groupStaffByCategory } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { useModuleAccess } from "@/lib/permissions";

interface StaffMember {
  id: number;
  full_name: string;
  phone?: string;
  email?: string;
  category?: string;
  notes?: string;
}
interface RoomOpt {
  id: number;
  name: string;
  floor: string;
  building: string;
  label: string;
}
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

export default function Staff() {
  const { canEdit } = useModuleAccess("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [rooms, setRooms] = useState<RoomOpt[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [dutyTypes, setDutyTypes] = useState<string[]>([]);
  const [staffCategories, setStaffCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffPage, setStaffPage] = useState(1);
  const [staffSearch, setStaffSearch] = useState("");
  const STAFF_PAGE_SIZE = 5;

  const emptyMember = { full_name: "", phone: "", email: "", category: "", notes: "" };
  const [member, setMember] = useState(emptyMember);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newLogin, setNewLogin] = useState<{ full_name: string; username: string; password: string } | null>(null);
  const [assign, setAssign] = useState({
    staff_id: "",
    room_id: "",
    duty_type: "",
    start_time: "",
    end_time: "",
    notes: "",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<StaffMember[]>("/staff"),
      api.get<RoomOpt[]>("/accommodation/rooms"),
      api.get<Duty[]>("/staff/duties"),
      api.get<{ duty_types: string[]; staff_categories: string[] }>("/staff/meta"),
    ])
      .then(([s, r, d, m]) => {
        setStaff(s.data);
        setRooms(r.data);
        setDuties(d.data);
        setDutyTypes(m.data.duty_types);
        setStaffCategories(m.data.staff_categories);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const saveMember = async () => {
    if (!member.full_name.trim()) return toast.error("Staff name required");
    const payload = {
      full_name: member.full_name,
      phone: member.phone || null,
      email: member.email || null,
      category: member.category || null,
      notes: member.notes || null,
    };
    try {
      if (editingId) {
        await api.put(`/staff/${editingId}`, payload);
        toast.success("Staff member updated");
      } else {
        const r = await api.post<{ full_name: string; login_username: string; login_password: string }>("/staff", payload);
        toast.success("Staff member added");
        setNewLogin({ full_name: r.data.full_name, username: r.data.login_username, password: r.data.login_password });
      }
      setMember(emptyMember);
      setEditingId(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save staff member");
    }
  };

  const startEdit = (s: StaffMember) => {
    setEditingId(s.id);
    setMember({
      full_name: s.full_name,
      phone: s.phone ?? "",
      email: s.email ?? "",
      category: s.category ?? "",
      notes: s.notes ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setMember(emptyMember);
  };

  const addDuty = async () => {
    if (!assign.staff_id) return toast.error("Select a staff member");
    if (!assign.room_id) return toast.error("Select a room");
    if (!assign.duty_type.trim()) return toast.error("Enter a duty type");
    try {
      await api.post("/staff/duties", {
        staff_id: Number(assign.staff_id),
        room_id: Number(assign.room_id),
        duty_type: assign.duty_type.trim(),
        start_time: assign.start_time || null,
        end_time: assign.end_time || null,
        notes: assign.notes || null,
      });
      toast.success("Duty assigned");
      setAssign({ staff_id: "", room_id: "", duty_type: "", start_time: "", end_time: "", notes: "" });
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not assign duty");
    }
  };

  const delMember = async (id: number) => {
    if (!confirm("Delete this staff member? Their duty assignments will be removed too.")) return;
    await api.delete(`/staff/${id}`);
    if (editingId === id) cancelEdit();
    toast.success("Staff member removed");
    load();
  };

  const delDuty = async (id: number) => {
    if (!confirm("Remove this duty assignment?")) return;
    await api.delete(`/staff/duties/${id}`);
    toast.success("Duty removed");
    load();
  };

  // Group duties by building -> floor -> room for the floor-wise / room-wise view.
  const grouped = useMemo(() => {
    const byFloor = new Map<string, { floor: string; building: string; rows: Duty[] }>();
    for (const d of duties) {
      const key = `${d.building_name ?? "—"} / ${d.floor_name ?? "—"}`;
      if (!byFloor.has(key))
        byFloor.set(key, { floor: d.floor_name ?? "—", building: d.building_name ?? "—", rows: [] });
      byFloor.get(key)!.rows.push(d);
    }
    return Array.from(byFloor.values()).sort(
      (a, b) => a.building.localeCompare(b.building) || a.floor.localeCompare(b.floor),
    );
  }, [duties]);

  // Continuous serial numbers across the grouped (floor-by-floor) roster.
  const dutySerials = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    for (const g of grouped) for (const d of g.rows) map.set(d.id, ++n);
    return map;
  }, [grouped]);

  const staffByCategory = useMemo(() => groupStaffByCategory(staff), [staff]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => s.full_name.toLowerCase().includes(q));
  }, [staff, staffSearch]);

  useEffect(() => {
    setStaffPage(1);
  }, [staffSearch]);

  const staffPageCount = Math.max(1, Math.ceil(filteredStaff.length / STAFF_PAGE_SIZE));
  useEffect(() => {
    if (staffPage > staffPageCount) setStaffPage(staffPageCount);
  }, [staffPage, staffPageCount]);
  const pagedStaff = filteredStaff.slice((staffPage - 1) * STAFF_PAGE_SIZE, staffPage * STAFF_PAGE_SIZE);

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading staff personnel & duty rosters…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-staff" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          OPERATIONAL MANPOWER
        </span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          Staff & Duty Allotments
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
          Organize event staff, wardens, catering, and medical personnel across hostel floors and courts.
        </p>
      </div>

      {/* TOP GRID: STAFF MEMBERS & ASSIGN DUTY */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* STAFF MEMBERS PANEL */}
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold text-white">
              <HardHat className="h-4 w-4 text-gold" /> Personnel Directory ({staff.length})
            </h2>
          </div>

          {canEdit && (
            <div className="space-y-3 rounded-lg border border-white/5 bg-white/[0.02] p-3.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Input
                  placeholder="Full name *"
                  value={member.full_name}
                  onChange={(e) => setMember((m) => ({ ...m, full_name: e.target.value }))}
                  className="h-9 text-xs"
                  data-testid="staff-name-input"
                />
                <Select
                  value={member.category}
                  onChange={(e) => setMember((m) => ({ ...m, category: e.target.value }))}
                  className="h-9 text-xs"
                  data-testid="staff-category-select"
                >
                  <option value="">Category…</option>
                  {staffCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="Contact Phone"
                  value={member.phone}
                  onChange={(e) => setMember((m) => ({ ...m, phone: e.target.value }))}
                  className="h-9 text-xs"
                />
                <Input
                  placeholder="Email"
                  value={member.email}
                  onChange={(e) => setMember((m) => ({ ...m, email: e.target.value }))}
                  className="h-9 text-xs"
                />
                <Textarea
                  placeholder="Operational Notes..."
                  className="col-span-2 text-xs"
                  rows={2}
                  value={member.notes}
                  onChange={(e) => setMember((m) => ({ ...m, notes: e.target.value }))}
                  data-testid="staff-notes-input"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="gold"
                  size="sm"
                  onClick={saveMember}
                  className="flex-1 text-xs font-bold"
                  data-testid="save-staff-btn"
                >
                  {editingId ? (
                    <>
                      <Pencil className="h-3.5 w-3.5" /> Update Member
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> Add Staff Member
                    </>
                  )}
                </Button>
                {editingId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    data-testid="cancel-edit-staff-btn"
                    className="text-xs"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                )}
              </div>
            </div>
          )}

          {staff.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search staff by name…"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="pl-9 h-8 text-xs"
                data-testid="staff-search-input"
              />
            </div>
          )}

          <div className="space-y-2">
            {staff.length === 0 && <p className="text-xs text-slate-400 py-3">No staff members enrolled yet.</p>}
            {staff.length > 0 && filteredStaff.length === 0 && (
              <p className="text-xs text-slate-400 py-3">No staff member named "{staffSearch}".</p>
            )}
            {pagedStaff.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border p-3 text-xs transition-colors",
                  editingId === s.id
                    ? "border-gold bg-gold/15 text-white shadow-sm"
                    : "border-white/5 bg-white/[0.02] hover:border-white/15",
                )}
                data-testid={`staff-row-${s.id}`}
              >
                <div className="min-w-0">
                  <span className="font-heading font-bold text-white text-sm">{s.full_name}</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                    {s.category && <span className="font-semibold text-gold">{s.category}</span>}
                    {s.phone && <span>· {s.phone}</span>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEdit(s)}
                      data-testid={`edit-staff-${s.id}`}
                      title="Edit Staff"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-300" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => delMember(s.id)}
                      data-testid={`delete-staff-${s.id}`}
                      title="Delete Staff"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredStaff.length > STAFF_PAGE_SIZE && (
            <div
              className="flex items-center justify-between border-t border-white/10 pt-3 text-xs text-slate-400 font-mono"
              data-testid="staff-pagination"
            >
              <span>
                Page {staffPage} / {staffPageCount} · {filteredStaff.length} Staff
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={staffPage <= 1}
                  onClick={() => setStaffPage((p) => Math.max(1, p - 1))}
                  data-testid="staff-page-prev"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={staffPage >= staffPageCount}
                  onClick={() => setStaffPage((p) => Math.min(staffPageCount, p + 1))}
                  data-testid="staff-page-next"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ASSIGN DUTY PANEL */}
        {canEdit && (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4 shadow-sm">
            <div className="border-b border-white/10 pb-3">
              <h2 className="flex items-center gap-2 font-heading text-base font-bold text-white">
                <ClipboardList className="h-4 w-4 text-gold" /> Assign Operational Duty
              </h2>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Staff Personnel *</Label>
                <Select
                  value={assign.staff_id}
                  onChange={(e) => setAssign((a) => ({ ...a, staff_id: e.target.value }))}
                  className="h-9 text-xs"
                  data-testid="duty-staff-select"
                >
                  <option value="">Select staff member…</option>
                  {staffByCategory.map(([category, members]) => (
                    <optgroup key={category} label={category}>
                      {members.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Location / Room Assignment *</Label>
                <Select
                  value={assign.room_id}
                  onChange={(e) => setAssign((a) => ({ ...a, room_id: e.target.value }))}
                  className="h-9 text-xs"
                  data-testid="duty-room-select"
                >
                  <option value="">Select room…</option>
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
                  placeholder="e.g. Cleaning / Security / Warden / Medical"
                  list="duty-type-suggestions"
                  value={assign.duty_type}
                  onChange={(e) => setAssign((a) => ({ ...a, duty_type: e.target.value }))}
                  className="h-9 text-xs"
                  data-testid="duty-type-input"
                />
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <Label>Shift Start Time</Label>
                  <Input
                    type="datetime-local"
                    value={assign.start_time}
                    onChange={(e) => setAssign((a) => ({ ...a, start_time: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <Label>Shift End Time</Label>
                  <Input
                    type="datetime-local"
                    value={assign.end_time}
                    onChange={(e) => setAssign((a) => ({ ...a, end_time: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <Button
                variant="gold"
                onClick={addDuty}
                className="w-full h-10 text-xs font-bold mt-2"
                data-testid="add-duty-btn"
              >
                <Plus className="h-4 w-4" /> Save Duty Assignment
              </Button>
            </div>
          </div>
        )}
      </div>

      <datalist id="duty-type-suggestions">
        {dutyTypes.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {/* DUTY ROSTER GROUPED BY BUILDING & FLOOR */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 space-y-4 shadow-sm">
        <h2 className="font-heading text-base font-bold text-white tracking-tight">
          Duty Roster — Grouped by Building & Floor
        </h2>

        {duties.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No duties assigned yet" hint="Assign staff members to rooms above." />
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={`${g.building}-${g.floor}`} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <Building className="h-4 w-4 text-gold" />
                  <span className="font-heading font-bold text-sm text-gold uppercase tracking-wider">
                    {g.building} · {g.floor}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">({g.rows.length} Assignments)</span>
                </div>

                {/* MOBILE: CARD LIST */}
                <div className="grid gap-2 lg:hidden">
                  {g.rows.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-white/10 bg-obsidian-950 p-3.5 space-y-2"
                      data-testid={`duty-card-${d.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-heading font-bold text-white text-sm">{d.room_name || "Room"}</p>
                          <p className="text-xs text-slate-300 font-body mt-0.5">
                            {d.staff_name || "—"} · <span className="text-gold font-bold">{d.duty_type}</span>
                          </p>
                        </div>
                        {canEdit && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => delDuty(d.id)}
                            className="h-7 text-xs"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1 border-t border-white/5 pt-1.5">
                        <Clock className="h-3 w-3 text-slate-500" />
                        {d.start_time ? formatDate(d.start_time) : "No shift start"}
                        {d.end_time ? ` → ${formatDate(d.end_time)}` : ""}
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
                        <TH>Room Location</TH>
                        <TH>Duty Type</TH>
                        <TH>Staff Personnel</TH>
                        <TH>Shift Window</TH>
                        <TH className="text-right">Action</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {g.rows.map((d) => (
                        <TR key={d.id} data-testid={`duty-row-${d.id}`}>
                          <TD className="text-slate-500 font-mono text-xs">
                            {dutySerials.get(d.id)}
                          </TD>
                          <TD className="font-heading font-bold text-white text-sm">
                            {d.room_name || "—"}
                          </TD>
                          <TD>
                            <Badge tone="gold" size="sm">
                              {d.duty_type}
                            </Badge>
                          </TD>
                          <TD className="text-slate-200 font-body text-xs">{d.staff_name || "—"}</TD>
                          <TD className="text-slate-400 font-mono text-xs">
                            {d.start_time ? formatDate(d.start_time) : "—"}
                            {d.end_time ? ` → ${formatDate(d.end_time)}` : ""}
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
                      ))}
                    </TBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEW LOGIN CREDENTIALS — shown once, right after a staff member is created */}
      <Dialog
        open={!!newLogin}
        onClose={() => setNewLogin(null)}
        title="Staff Portal Login Created"
        testId="new-staff-login-dialog"
      >
        {newLogin && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 font-body">
              {newLogin.full_name} can now sign in to the Organizer Portal with base view access. Share these
              credentials now — the password can't be shown again after you close this (reset it from Accounts if lost).
            </p>
            <div className="space-y-2.5 rounded-lg border border-gold/30 bg-gold/5 p-4">
              <div>
                <Label>Username</Label>
                <p className="font-mono text-sm font-bold text-white" data-testid="new-staff-login-username">
                  {newLogin.username}
                </p>
              </div>
              <div>
                <Label>Password</Label>
                <p className="font-mono text-sm font-bold text-white" data-testid="new-staff-login-password">
                  {newLogin.password}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-white/10">
              <Button variant="gold" size="sm" onClick={() => setNewLogin(null)} data-testid="close-new-staff-login">
                Got It
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
