import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  HardHat,
  Search,
  KeyRound,
  Eye,
  CheckSquare,
  Phone,
  Mail,
  Users,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useModuleAccess } from "@/lib/permissions";
import {
  StaffDetailDrawer,
  StaffDetailMember,
  StaffDutyItem,
  StaffTaskItem,
} from "@/components/admin/StaffDetailDrawer";

interface StaffMember {
  id: number;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
  notes?: string | null;
  login_username?: string | null;
}

const emptyMember = { full_name: "", phone: "", email: "", category: "", notes: "" };

export default function Staff() {
  const { canEdit } = useModuleAccess("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [duties, setDuties] = useState<StaffDutyItem[]>([]);
  const [tasks, setTasks] = useState<StaffTaskItem[]>([]);
  const [staffCategories, setStaffCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [loginFilter, setLoginFilter] = useState<"ALL" | "HAS_LOGIN" | "NO_LOGIN">("ALL");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Modals & Drawer State
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openFormDialog, setOpenFormDialog] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Credential creation popup
  const [newLogin, setNewLogin] = useState<{ full_name: string; username: string; password: string } | null>(null);
  const [creatingCredentialId, setCreatingCredentialId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<StaffMember[]>("/staff"),
      api.get<StaffDutyItem[]>("/staff/duties"),
      api.get<StaffTaskItem[]>("/tasks"),
      api.get<{ duty_types: string[]; staff_categories: string[] }>("/staff/meta"),
    ])
      .then(([s, d, t, m]) => {
        setStaff(s.data);
        setDuties(d.data);
        setTasks(t.data);
        setStaffCategories(m.data.staff_categories);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Compute duty count map and task count map for O(1) lookups
  const dutyCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of duties) {
      map.set(d.staff_id, (map.get(d.staff_id) || 0) + 1);
    }
    return map;
  }, [duties]);

  const taskCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of tasks) {
      if (t.assigned_staff_id) {
        map.set(t.assigned_staff_id, (map.get(t.assigned_staff_id) || 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  // Filtered staff members
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      const matchesSearch =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === "ALL" || (s.category || "").toLowerCase() === selectedCategory.toLowerCase();

      const matchesLogin =
        loginFilter === "ALL" ||
        (loginFilter === "HAS_LOGIN" && Boolean(s.login_username)) ||
        (loginFilter === "NO_LOGIN" && !s.login_username);

      return matchesSearch && matchesCat && matchesLogin;
    });
  }, [staff, search, selectedCategory, loginFilter]);

  // Pagination
  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, loginFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const pagedStaff = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredStaff.slice(start, start + PAGE_SIZE);
  }, [filteredStaff, page]);

  // Keep drawer staff in sync if list updates
  useEffect(() => {
    if (selectedStaff) {
      const updated = staff.find((s) => s.id === selectedStaff.id);
      if (updated) setSelectedStaff(updated);
    }
  }, [staff]);

  const openCreateDialog = () => {
    setEditingId(null);
    setMemberForm(emptyMember);
    setOpenFormDialog(true);
  };

  const openEditDialog = (s: StaffMember) => {
    setEditingId(s.id);
    setMemberForm({
      full_name: s.full_name,
      phone: s.phone ?? "",
      email: s.email ?? "",
      category: s.category ?? "",
      notes: s.notes ?? "",
    });
    setOpenFormDialog(true);
  };

  const saveMember = async () => {
    if (!memberForm.full_name.trim()) return toast.error("Staff name required");
    const payload = {
      full_name: memberForm.full_name.trim(),
      phone: memberForm.phone.trim() || null,
      email: memberForm.email.trim() || null,
      category: memberForm.category.trim() || null,
      notes: memberForm.notes.trim() || null,
    };
    try {
      if (editingId) {
        await api.put(`/staff/${editingId}`, payload);
        toast.success("Staff member updated");
      } else {
        await api.post("/staff", payload);
        toast.success("Staff member added to directory");
      }
      setOpenFormDialog(false);
      setMemberForm(emptyMember);
      setEditingId(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save staff member");
    }
  };

  const delMember = async (id: number) => {
    if (!confirm("Delete this staff member? Duty assignments will be removed too.")) return;
    try {
      await api.delete(`/staff/${id}`);
      if (selectedStaff?.id === id) {
        setDrawerOpen(false);
        setSelectedStaff(null);
      }
      toast.success("Staff member removed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete staff member");
    }
  };

  const createCredential = async (s: StaffMember) => {
    setCreatingCredentialId(s.id);
    try {
      const r = await api.post<{ login_username: string; login_password: string }>(`/staff/${s.id}/credential`);
      setNewLogin({ full_name: s.full_name, username: r.data.login_username, password: r.data.login_password });
      toast.success(`Login created for ${s.full_name}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create credential");
    } finally {
      setCreatingCredentialId(null);
    }
  };

  const handleOpenDrawer = (s: StaffMember) => {
    setSelectedStaff(s);
    setDrawerOpen(true);
  };

  const handleToggleTask = async (task: StaffTaskItem) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await api.put(`/tasks/${task.id}`, { status: nextStatus });
    } catch {
      toast.error("Could not update task status");
      load();
    }
  };

  const handleDeleteDuty = async (dutyId: number) => {
    if (!confirm("Remove this duty allotment?")) return;
    try {
      await api.delete(`/staff/duties/${dutyId}`);
      toast.success("Duty removed");
      load();
    } catch {
      toast.error("Could not remove duty");
    }
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading staff personnel directory…" />
      </div>
    );
  }

  const totalLogins = staff.filter((s) => s.login_username).length;

  return (
    <div data-testid="admin-staff" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            PEOPLE DIRECTORY
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Staff Personnel
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Central directory of tournament personnel, duty allotments, assigned operational tasks, and login access.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={openCreateDialog}
            data-testid="add-staff-btn"
            className="text-xs font-extrabold shrink-0"
          >
            <Plus className="h-4 w-4" /> Add Staff Member
          </Button>
        )}
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Personnel
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-white">{staff.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Active Portal Logins
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">{totalLogins}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Allotted Duties
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-gold">{duties.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Staff Tasks
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-cyan-400">{tasks.length}</p>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* SEARCH */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search by name, phone, email, or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="staff-search-input"
            />
          </div>

          {/* CATEGORY SELECT */}
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 text-xs sm:w-48"
          >
            <option value="ALL">All Categories</option>
            {staffCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          {/* LOGIN FILTER */}
          <Select
            value={loginFilter}
            onChange={(e) => setLoginFilter(e.target.value as any)}
            className="h-9 text-xs sm:w-40"
          >
            <option value="ALL">All Accounts</option>
            <option value="HAS_LOGIN">With Login</option>
            <option value="NO_LOGIN">No Login</option>
          </Select>
        </div>

        {/* ACTIVE FILTER PILLS */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] text-slate-400 font-mono">Showing {filteredStaff.length} of {staff.length}</span>
          {selectedCategory !== "ALL" && (
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className="inline-flex items-center gap-1 rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-[10px] font-bold text-gold"
            >
              Category: {selectedCategory} ×
            </button>
          )}
          {loginFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => setLoginFilter("ALL")}
              className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
            >
              Login: {loginFilter === "HAS_LOGIN" ? "With Login" : "No Login"} ×
            </button>
          )}
        </div>
      </div>

      {/* STAFF LIST / DIRECTORY */}
      {staff.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No staff personnel enrolled"
            hint="Add staff members to assign duties, tasks, and mobile portal access."
          />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No matching staff found"
            hint="Try changing your search query or category filters."
          />
        </div>
      ) : (
        <>
          {/* MOBILE: STACKED COMPACT CARDS */}
          <div className="grid gap-2.5 sm:hidden">
            {pagedStaff.map((s) => {
              const dCount = dutyCounts.get(s.id) || 0;
              const tCount = taskCounts.get(s.id) || 0;
              return (
                <div
                  key={s.id}
                  data-testid={`staff-card-${s.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold/15 text-gold font-heading font-black text-xs">
                        {s.full_name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-heading font-bold text-white text-sm truncate">{s.full_name}</h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {s.category && (
                            <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-semibold text-gold">
                              {s.category}
                            </span>
                          )}
                          {s.phone && <span className="text-[11px] text-slate-400 font-mono">· {s.phone}</span>}
                        </div>
                      </div>
                    </div>

                    <Badge tone={s.login_username ? "green" : "neutral"} size="sm">
                      {s.login_username ? "Login Active" : "No Login"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-slate-400 font-mono">
                    <span>Duties: <strong className="text-white">{dCount}</strong></span>
                    <span>Tasks: <strong className="text-white">{tCount}</strong></span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDrawer(s)}
                      className="h-7 text-xs px-2.5"
                    >
                      <Eye className="h-3 w-3" /> View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP & TABLET: CLEAN COMPACT TABLE */}
          <div className="hidden sm:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">#</TH>
                  <TH>Personnel</TH>
                  <TH>Category / Role</TH>
                  <TH>Contact Details</TH>
                  <TH className="text-center">Login Access</TH>
                  <TH className="text-center">Duties</TH>
                  <TH className="text-center">Tasks</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {pagedStaff.map((s, i) => {
                  const dCount = dutyCounts.get(s.id) || 0;
                  const tCount = taskCounts.get(s.id) || 0;
                  const serial = (page - 1) * PAGE_SIZE + i + 1;
                  return (
                    <TR key={s.id} data-testid={`staff-row-${s.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{serial}</TD>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gold/15 text-gold font-heading font-black text-xs">
                            {s.full_name.slice(0, 1).toUpperCase()}
                          </div>
                          <span className="font-heading font-bold text-white text-xs tracking-wide">
                            {s.full_name}
                          </span>
                        </div>
                      </TD>
                      <TD>
                        {s.category ? (
                          <Badge tone="gold" size="sm">
                            {s.category}
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </TD>
                      <TD>
                        <div className="space-y-0.5 text-xs">
                          {s.phone && (
                            <p className="text-slate-300 font-mono text-[11px] flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5 text-gold" /> {s.phone}
                            </p>
                          )}
                          {s.email && (
                            <p className="text-slate-400 text-[11px] flex items-center gap-1">
                              <Mail className="h-2.5 w-2.5 text-slate-500" /> {s.email}
                            </p>
                          )}
                          {!s.phone && !s.email && <span className="text-slate-500 text-xs">—</span>}
                        </div>
                      </TD>
                      <TD className="text-center">
                        {s.login_username ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            <KeyRound className="h-3 w-3" /> @{s.login_username}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">No Login</span>
                        )}
                      </TD>
                      <TD className="text-center font-mono text-xs">
                        <span className={cn("px-2 py-0.5 rounded font-bold", dCount > 0 ? "bg-gold/15 text-gold" : "text-slate-500")}>
                          {dCount}
                        </span>
                      </TD>
                      <TD className="text-center font-mono text-xs">
                        <span className={cn("px-2 py-0.5 rounded font-bold", tCount > 0 ? "bg-cyan-500/15 text-cyan-300" : "text-slate-500")}>
                          {tCount}
                        </span>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDrawer(s)}
                            data-testid={`view-staff-${s.id}`}
                            className="h-7 text-xs px-2"
                            title="View Staff Profile & Assignments"
                          >
                            <Eye className="h-3 w-3" /> View
                          </Button>
                          {canEdit && (
                            <>
                              {!s.login_username && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => createCredential(s)}
                                  disabled={creatingCredentialId === s.id}
                                  data-testid={`create-credential-${s.id}`}
                                  title="Create Portal Login"
                                >
                                  <KeyRound className="h-3.5 w-3.5 text-gold" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEditDialog(s)}
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
                            </>
                          )}
                        </div>
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
                Page {page} of {totalPages} · {filteredStaff.length} Total Staff
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
      )}

      {/* ADD / EDIT STAFF DIALOG */}
      <Dialog
        open={openFormDialog}
        onClose={() => setOpenFormDialog(false)}
        title={editingId ? "Edit Staff Member" : "Add Staff Member"}
        testId="staff-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Full Name *</Label>
            <Input
              placeholder="e.g. Ramesh Kumar"
              value={memberForm.full_name}
              onChange={(e) => setMemberForm((m) => ({ ...m, full_name: e.target.value }))}
              data-testid="staff-name-input"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Category / Role</Label>
              <Select
                value={memberForm.category}
                onChange={(e) => setMemberForm((m) => ({ ...m, category: e.target.value }))}
                data-testid="staff-category-select"
              >
                <option value="">Select Category…</option>
                {staffCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input
                placeholder="e.g. 9876543210"
                value={memberForm.phone}
                onChange={(e) => setMemberForm((m) => ({ ...m, phone: e.target.value }))}
                data-testid="staff-phone-input"
              />
            </div>
          </div>

          <div>
            <Label>Email (Optional)</Label>
            <Input
              type="email"
              placeholder="e.g. ramesh@example.com"
              value={memberForm.email}
              onChange={(e) => setMemberForm((m) => ({ ...m, email: e.target.value }))}
            />
          </div>

          <div>
            <Label>Operational Notes</Label>
            <Textarea
              placeholder="Designation, hostel block, shift preference, or special instructions…"
              rows={3}
              value={memberForm.notes}
              onChange={(e) => setMemberForm((m) => ({ ...m, notes: e.target.value }))}
              data-testid="staff-notes-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenFormDialog(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveMember} data-testid="save-staff-btn">
              {editingId ? "Update Staff" : "Save to Directory"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* STAFF DETAIL DRAWER */}
      <StaffDetailDrawer
        staff={selectedStaff}
        duties={duties}
        tasks={tasks}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canEdit={canEdit}
        onEditStaff={(s) => {
          setDrawerOpen(false);
          openEditDialog(s);
        }}
        onDeleteStaff={delMember}
        onCreateCredential={createCredential}
        onDeleteDuty={handleDeleteDuty}
        onToggleTask={handleToggleTask}
        creatingCredential={creatingCredentialId === selectedStaff?.id}
      />

      {/* NEW LOGIN CREDENTIALS MODAL */}
      <Dialog
        open={Boolean(newLogin)}
        onClose={() => setNewLogin(null)}
        title="Staff Portal Login Provisioned"
        testId="new-staff-login-dialog"
      >
        {newLogin && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 font-body leading-relaxed">
              Organizer portal credentials for <strong>{newLogin.full_name}</strong> have been generated. Share these
              with the staff member now — the temporary password cannot be retrieved once closed.
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
                Dismiss & Copy
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
