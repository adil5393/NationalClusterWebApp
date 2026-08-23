import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, HardHat, ClipboardList, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { cn } from "@/lib/utils";

interface StaffMember { id: number; full_name: string; phone?: string; email?: string; category?: string; notes?: string }
interface RoomOpt { id: number; name: string; floor: string; building: string; label: string }
interface Duty {
  id: number; staff_id: number; staff_name?: string; category?: string;
  room_id: number; room_name?: string; floor_id?: number; floor_name?: string;
  building_id?: number; building_name?: string;
  duty_type: string; start_time?: string; end_time?: string; notes?: string;
}

export default function Staff() {
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
  const [assign, setAssign] = useState({
    staff_id: "", room_id: "", duty_type: "", start_time: "", end_time: "", notes: "",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<StaffMember[]>("/staff"),
      api.get<RoomOpt[]>("/accommodation/rooms"),
      api.get<Duty[]>("/staff/duties"),
      api.get<{ duty_types: string[]; staff_categories: string[] }>("/staff/meta"),
    ]).then(([s, r, d, m]) => {
      setStaff(s.data); setRooms(r.data); setDuties(d.data);
      setDutyTypes(m.data.duty_types); setStaffCategories(m.data.staff_categories);
    }).finally(() => setLoading(false));
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
        await api.post("/staff", payload);
        toast.success("Staff member added");
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
      full_name: s.full_name, phone: s.phone ?? "", email: s.email ?? "",
      category: s.category ?? "", notes: s.notes ?? "",
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
      if (!byFloor.has(key)) byFloor.set(key, { floor: d.floor_name ?? "—", building: d.building_name ?? "—", rows: [] });
      byFloor.get(key)!.rows.push(d);
    }
    return Array.from(byFloor.values()).sort((a, b) => a.building.localeCompare(b.building) || a.floor.localeCompare(b.floor));
  }, [duties]);

  // Continuous serial numbers across the grouped (floor-by-floor) roster.
  const dutySerials = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    for (const g of grouped) for (const d of g.rows) map.set(d.id, ++n);
    return map;
  }, [grouped]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => s.full_name.toLowerCase().includes(q));
  }, [staff, staffSearch]);
  useEffect(() => { setStaffPage(1); }, [staffSearch]);
  const staffPageCount = Math.max(1, Math.ceil(filteredStaff.length / STAFF_PAGE_SIZE));
  useEffect(() => {
    if (staffPage > staffPageCount) setStaffPage(staffPageCount);
  }, [staffPage, staffPageCount]);
  const pagedStaff = filteredStaff.slice((staffPage - 1) * STAFF_PAGE_SIZE, staffPage * STAFF_PAGE_SIZE);

  if (loading) return <Spinner label="Loading staff…" />;

  return (
    <div data-testid="admin-staff">
      <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Staff & Duties</h1>
      <p className="mt-1 text-sm text-slate-500">School/event staff and their duty allotments — fooding, cleaning, medical, security and more — by floor and room.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Staff members */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-950"><HardHat className="h-4 w-4" /> Staff Members</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Input placeholder="Full name" value={member.full_name} onChange={(e) => setMember((m) => ({ ...m, full_name: e.target.value }))} data-testid="staff-name-input" />
            <Select value={member.category} onChange={(e) => setMember((m) => ({ ...m, category: e.target.value }))} data-testid="staff-category-select">
              <option value="">Category…</option>
              {staffCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input placeholder="Phone" value={member.phone} onChange={(e) => setMember((m) => ({ ...m, phone: e.target.value }))} />
            <Input placeholder="Email" value={member.email} onChange={(e) => setMember((m) => ({ ...m, email: e.target.value }))} />
            <Textarea placeholder="Notes" className="col-span-2" rows={2} value={member.notes} onChange={(e) => setMember((m) => ({ ...m, notes: e.target.value }))} data-testid="staff-notes-input" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={saveMember} className="flex-1" data-testid="save-staff-btn">
              {editingId ? <><Pencil className="h-4 w-4" /> Update Staff Member</> : <><Plus className="h-4 w-4" /> Add Staff Member</>}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={cancelEdit} data-testid="cancel-edit-staff-btn"><X className="h-4 w-4" /></Button>
            )}
          </div>
          {staff.length > 0 && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search staff by name…"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="pl-9"
                data-testid="staff-search-input"
              />
            </div>
          )}
          <div className="mt-4 space-y-2">
            {staff.length === 0 && <p className="text-sm text-slate-400">No staff members yet.</p>}
            {staff.length > 0 && filteredStaff.length === 0 && (
              <p className="text-sm text-slate-400">No staff member named "{staffSearch}".</p>
            )}
            {pagedStaff.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                  editingId === s.id ? "border-coral bg-orange-50" : "border-slate-200",
                )}
                data-testid={`staff-row-${s.id}`}
              >
                <span>
                  <span className="font-bold text-slate-900">{s.full_name}</span>
                  {s.category && <span className="text-slate-500"> · {s.category}</span>}
                  {s.phone && <span className="text-slate-500"> · {s.phone}</span>}
                </span>
                <span className="flex items-center gap-1">
                  <button onClick={() => startEdit(s)} className="text-slate-300 hover:text-coral-600" data-testid={`edit-staff-${s.id}`}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => delMember(s.id)} className="text-slate-300 hover:text-red-500" data-testid={`delete-staff-${s.id}`}><Trash2 className="h-4 w-4" /></button>
                </span>
              </div>
            ))}
          </div>
          {filteredStaff.length > STAFF_PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500" data-testid="staff-pagination">
              <span>Page {staffPage} of {staffPageCount} · {filteredStaff.length} staff</span>
              <div className="flex gap-1">
                <Button
                  variant="outline" size="icon"
                  disabled={staffPage <= 1}
                  onClick={() => setStaffPage((p) => Math.max(1, p - 1))}
                  data-testid="staff-page-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="icon"
                  disabled={staffPage >= staffPageCount}
                  onClick={() => setStaffPage((p) => Math.min(staffPageCount, p + 1))}
                  data-testid="staff-page-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Assign duty */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-950"><ClipboardList className="h-4 w-4" /> Assign a Duty</h2>
          <div className="mt-4 space-y-2">
            <Select value={assign.staff_id} onChange={(e) => setAssign((a) => ({ ...a, staff_id: e.target.value }))} data-testid="duty-staff-select">
              <option value="">Staff member…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
            <Select value={assign.room_id} onChange={(e) => setAssign((a) => ({ ...a, room_id: e.target.value }))} data-testid="duty-room-select">
              <option value="">Room…</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
            <Input placeholder="Duty type (e.g. Cleaning)" list="duty-type-suggestions" value={assign.duty_type} onChange={(e) => setAssign((a) => ({ ...a, duty_type: e.target.value }))} data-testid="duty-type-input" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Shift start</Label>
                <Input type="datetime-local" value={assign.start_time} onChange={(e) => setAssign((a) => ({ ...a, start_time: e.target.value }))} />
              </div>
              <div>
                <Label>Shift end</Label>
                <Input type="datetime-local" value={assign.end_time} onChange={(e) => setAssign((a) => ({ ...a, end_time: e.target.value }))} />
              </div>
            </div>
            <Button onClick={addDuty} className="w-full" data-testid="add-duty-btn"><Plus className="h-4 w-4" /> Assign Duty</Button>
          </div>
        </div>
      </div>

      <datalist id="duty-type-suggestions">
        {dutyTypes.map((t) => <option key={t} value={t} />)}
      </datalist>

      {/* Duty roster, floor-wise and room-wise */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-heading text-lg font-bold text-slate-950">Duty Roster — by Floor & Room</h2>
        {duties.length === 0 ? (
          <div className="mt-4"><EmptyState title="No duties assigned yet" hint="Assign a staff member to a room above." /></div>
        ) : (
          <div className="mt-4 space-y-6">
            {grouped.map((g) => (
              <div key={`${g.building}-${g.floor}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{g.building} · {g.floor}</p>
                <Table className="mt-2">
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>#</TH><TH>Room</TH><TH>Duty</TH><TH>Staff</TH><TH>Shift</TH><TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {g.rows.map((d) => (
                      <TR key={d.id} data-testid={`duty-row-${d.id}`}>
                        <TD className="text-slate-400">{dutySerials.get(d.id)}</TD>
                        <TD className="font-semibold text-slate-900">{d.room_name || "—"}</TD>
                        <TD><Badge tone="coral">{d.duty_type}</Badge></TD>
                        <TD>{d.staff_name || "—"}</TD>
                        <TD>{d.start_time ? formatDate(d.start_time) : "—"}{d.end_time ? ` → ${formatDate(d.end_time)}` : ""}</TD>
                        <TD><div className="flex justify-end"><Button variant="ghost" size="icon" onClick={() => delDuty(d.id)} data-testid={`delete-duty-${d.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
