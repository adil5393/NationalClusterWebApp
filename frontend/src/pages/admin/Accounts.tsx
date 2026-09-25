import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  Crown,
  KeyRound,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  User,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MultiStaffSelector, StaffOption } from "@/components/admin/StaffSelector";

type PermissionLevel = "" | "view" | "edit";

interface StaffBrief {
  id: number;
  full_name: string;
  category?: string | null;
  phone?: string | null;
}

interface OrganizerUser {
  id: number;
  username: string;
  full_name?: string | null;
  is_active: boolean;
  is_admin: boolean;
  permissions: Record<string, "view" | "edit">;
  staff_members: StaffBrief[];
  created_at: string;
}

interface FormState {
  id?: number;
  username: string;
  full_name: string;
  password: string;
  is_admin: boolean;
  permissions: Record<string, PermissionLevel>;
  staff_member_ids: number[];
}

// One-click permission bundles from the backend (schemas.PERMISSION_PRESETS).
interface PermissionPreset {
  label: string;
  description: string;
  permissions: Record<string, "view" | "edit">;
}

const emptyForm: FormState = {
  username: "",
  full_name: "",
  password: "",
  is_admin: false,
  permissions: {},
  staff_member_ids: [],
};

export default function Accounts() {
  const [users, setUsers] = useState<OrganizerUser[]>([]);
  const [modules, setModules] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<Record<string, PermissionPreset>>({});
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"ALL" | "ADMIN" | "OFFICER">("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<OrganizerUser[]>("/organizer-users"),
      api.get<{ modules: Record<string, string>; presets?: Record<string, PermissionPreset> }>("/organizer-users/modules"),
      api.get<StaffOption[]>("/staff"),
    ])
      .then(([u, m, s]) => {
        setUsers(u.data);
        setModules(m.data.modules);
        setPresets(m.data.presets ?? {});
        setStaff(s.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        u.staff_members.some((s) => s.full_name.toLowerCase().includes(q));

      const matchesRole =
        filterRole === "ALL" ||
        (filterRole === "ADMIN" && u.is_admin) ||
        (filterRole === "OFFICER" && !u.is_admin);

      const matchesStatus =
        filterStatus === "ALL" ||
        (filterStatus === "ACTIVE" && u.is_active) ||
        (filterStatus === "INACTIVE" && !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, filterRole, filterStatus]);

  const openCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (u: OrganizerUser) => {
    setForm({
      id: u.id,
      username: u.username,
      full_name: u.full_name ?? "",
      password: "",
      is_admin: u.is_admin,
      permissions: Object.fromEntries(Object.keys(modules).map((k) => [k, u.permissions?.[k] ?? ""])),
      staff_member_ids: u.staff_members.map((s) => s.id),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.username.trim()) return toast.error("Username is required");
    if (!form.id && (!form.password || form.password.length < 8))
      return toast.error("Password must be at least 8 characters");
    if (form.password && form.password.length > 0 && form.password.length < 8)
      return toast.error("Password must be at least 8 characters");

    const permissions = Object.fromEntries(Object.entries(form.permissions).filter(([, v]) => v));

    try {
      if (form.id) {
        const payload: any = {
          username: form.username.trim(),
          full_name: form.full_name.trim() || null,
          is_admin: form.is_admin,
          permissions,
          staff_member_ids: form.staff_member_ids,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/organizer-users/${form.id}`, payload);
      } else {
        await api.post("/organizer-users", {
          username: form.username.trim(),
          full_name: form.full_name.trim() || null,
          password: form.password,
          is_admin: form.is_admin,
          permissions,
          staff_member_ids: form.staff_member_ids,
        });
      }
      toast.success(form.id ? "Account updated" : "Account created");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save account");
    }
  };

  const toggleActive = async (u: OrganizerUser) => {
    try {
      await api.put(`/organizer-users/${u.id}`, { is_active: !u.is_active });
      toast.success(u.is_active ? "Account deactivated" : "Account reactivated");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update account");
    }
  };

  const remove = async (u: OrganizerUser) => {
    if (!confirm(`Delete the account "${u.username}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/organizer-users/${u.id}`);
      toast.success("Account deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete account");
    }
  };

  const summarizePermissions = (u: OrganizerUser) => {
    if (u.is_admin) return "Full Administrator Access";
    const entries = Object.entries(u.permissions || {});
    if (entries.length === 0) return "No module permissions";
    return entries.map(([k, v]) => `${modules[k] ?? k} (${v})`).join(", ");
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading organizer accounts & access control…" />
      </div>
    );
  }

  const adminCount = users.filter((u) => u.is_admin).length;
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div data-testid="admin-accounts" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            ACCESS & IDENTITY MANAGEMENT
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Accounts & Access Control
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Manage who can sign into the Organizer Portal, assign administrative privileges, and configure module-level
            view/edit permissions.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={openCreate}
          data-testid="add-account-btn"
          className="text-xs font-extrabold shrink-0"
        >
          <Plus className="h-4 w-4" /> Create Account
        </Button>
      </div>

      {/* METRIC PILLS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Accounts
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-white">{users.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Active Accounts
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Administrators
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-gold">{adminCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Officers / Staff
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-slate-300">{users.length - adminCount}</p>
        </div>
      </div>

      {/* SEARCH AND FILTER */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search by username, full name, or linked staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="account-search-input"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilterRole(filterRole === "ALL" ? "ADMIN" : filterRole === "ADMIN" ? "OFFICER" : "ALL")}
              className={cn(
                "h-9 rounded-lg border px-3 text-xs font-heading font-bold transition-colors",
                filterRole !== "ALL"
                  ? "bg-gold/15 text-gold border-gold/30"
                  : "border-white/10 bg-obsidian-950 text-slate-400 hover:text-white",
              )}
            >
              Role: {filterRole}
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus(filterStatus === "ALL" ? "ACTIVE" : filterStatus === "ACTIVE" ? "INACTIVE" : "ALL")}
              className={cn(
                "h-9 rounded-lg border px-3 text-xs font-heading font-bold transition-colors",
                filterStatus !== "ALL"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "border-white/10 bg-obsidian-950 text-slate-400 hover:text-white",
              )}
            >
              Status: {filterStatus}
            </button>
          </div>
        </div>
      </div>

      {/* ACCOUNTS DISPLAY */}
      {users.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No organizer accounts"
            hint="Create accounts for tournament staff and administrators."
          />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No matching accounts found"
            hint="Try changing your search terms or filter selections."
          />
        </div>
      ) : (
        <>
          {/* MOBILE: STACKED ACCESS CARDS */}
          <div className="grid gap-2.5 sm:hidden">
            {filteredUsers.map((u) => (
              <div
                key={u.id}
                data-testid={`account-card-${u.id}`}
                className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-heading font-black text-white text-base">@{u.username}</span>
                      {u.is_admin ? (
                        <span className="inline-flex items-center gap-1 rounded bg-gold/20 border border-gold/40 px-1.5 py-0.2 text-[9px] font-heading font-black text-gold">
                          <Crown className="h-2.5 w-2.5" /> ADMIN
                        </span>
                      ) : (
                        <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] font-medium text-slate-400">
                          OFFICER
                        </span>
                      )}
                    </div>
                    {u.full_name && <p className="text-xs text-slate-300 font-body mt-0.5">{u.full_name}</p>}
                  </div>

                  <Badge tone={u.is_active ? "green" : "neutral"} size="sm">
                    {u.is_active ? "Active" : "Deactivated"}
                  </Badge>
                </div>

                {/* LINKED STAFF (SECONDARY) */}
                {u.staff_members.length > 0 ? (
                  <div className="border-t border-white/5 pt-2 text-[11px] text-slate-400 font-body flex items-center gap-1.5">
                    <User className="h-3 w-3 text-gold/70" />
                    <span>Linked to: <strong className="text-slate-200">{u.staff_members.map((s) => s.full_name).join(", ")}</strong></span>
                  </div>
                ) : (
                  <p className="border-t border-white/5 pt-2 text-[11px] text-slate-500 font-body italic">
                    Standalone login (unlinked to staff member)
                  </p>
                )}

                {/* PERMISSION SUMMARY */}
                <p className="text-[11px] text-slate-400 font-body border-t border-white/5 pt-1.5">
                  {u.is_admin ? (
                    <span className="text-gold font-bold">Unrestricted Full System Control</span>
                  ) : (
                    summarizePermissions(u)
                  )}
                </p>

                {/* ACTIONS */}
                <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => toggleActive(u)}
                  >
                    {u.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-bold text-gold"
                    onClick={() => openEdit(u)}
                  >
                    Manage
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => remove(u)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP & TABLET: STRUCTURED ACCESS TABLE */}
          <div className="hidden sm:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">#</TH>
                  <TH>Account (Username)</TH>
                  <TH>Role / Privilege</TH>
                  <TH>Linked Staff Member</TH>
                  <TH>Module Access Rights</TH>
                  <TH className="text-center">Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filteredUsers.map((u, i) => (
                  <TR key={u.id} data-testid={`account-row-${u.id}`}>
                    <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                    <TD>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-heading font-black text-white text-xs">@{u.username}</span>
                        </div>
                        {u.full_name && (
                          <p className="text-[11px] text-slate-400 font-body">{u.full_name}</p>
                        )}
                      </div>
                    </TD>
                    <TD>
                      {u.is_admin ? (
                        <span className="inline-flex items-center gap-1 rounded bg-gold/15 border border-gold/30 px-2 py-0.5 font-heading font-black text-[11px] text-gold">
                          <Crown className="h-3 w-3" /> ADMINISTRATOR
                        </span>
                      ) : (
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                          OFFICER
                        </span>
                      )}
                    </TD>
                    <TD className="text-xs text-slate-300 font-body max-w-xs">
                      {u.staff_members.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-gold/70 shrink-0" />
                          <span className="truncate">{u.staff_members.map((s) => s.full_name).join(", ")}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Unlinked</span>
                      )}
                    </TD>
                    <TD className="text-xs text-slate-400 font-body max-w-sm">
                      {u.is_admin ? (
                        <span className="text-gold font-semibold text-xs">Full system control</span>
                      ) : (
                        <span className="line-clamp-1">{summarizePermissions(u)}</span>
                      )}
                    </TD>
                    <TD className="text-center">
                      <Badge tone={u.is_active ? "green" : "neutral"} size="sm">
                        {u.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(u)}
                          data-testid={`edit-account-${u.id}`}
                          className="h-7 text-xs px-2.5 font-bold"
                          title="Manage Access & Permissions"
                        >
                          <Pencil className="h-3 w-3" /> Manage Access
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(u)}
                          data-testid={`toggle-account-${u.id}`}
                          className="h-7 text-xs text-slate-400"
                        >
                          {u.is_active ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => remove(u)}
                          data-testid={`delete-account-${u.id}`}
                          title="Delete Account"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}

      {/* ADD / EDIT ACCOUNT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Manage Account Access" : "Create New Organizer Account"}
        testId="account-dialog"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Username *</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="e.g. ground_supervisor"
                data-testid="account-username-input"
              />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. Ramesh Kumar"
              />
            </div>
          </div>

          <div>
            <Label>{form.id ? "New Password (Leave blank to keep unchanged)" : "Password *"}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={form.id ? "••••••••" : "Minimum 8 characters"}
              data-testid="account-password-input"
            />
          </div>

          {/* LINKED STAFF PERSONNEL (SEARCHABLE MULTI-SELECTOR) */}
          <div>
            <Label>Linked Staff Member(s)</Label>
            <p className="text-[11px] text-slate-500 font-body mb-1.5">
              Optionally link this login to physical staff directory records.
            </p>
            <MultiStaffSelector
              staff={staff}
              selectedIds={form.staff_member_ids}
              onChange={(ids) => setForm((f) => ({ ...f, staff_member_ids: ids }))}
            />
          </div>

          {/* ADMIN PRIVILEGE TOGGLE */}
          <label className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-obsidian-950 px-3.5 py-2.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_admin}
              onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))}
              data-testid="account-is-admin-checkbox"
              className="rounded border-white/20 text-gold focus:ring-gold"
            />
            <div>
              <span className="font-heading font-bold text-white flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-gold" /> Full System Administrator
              </span>
              <p className="text-slate-400 font-body text-[11px] mt-0.5">
                Grants unrestricted access across all competition matches, accommodation, and system settings.
              </p>
            </div>
          </label>

          {/* MODULE PERMISSIONS MATRIX */}
          {!form.is_admin && (
            <div className="space-y-2">
              {Object.keys(presets).length > 0 && (
                <div className="space-y-1.5" data-testid="account-presets">
                  <Label>Role Presets</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(presets).map(([key, preset]) => {
                      const matches =
                        Object.keys(modules).every((k) => (form.permissions[k] ?? "") === (preset.permissions[k] ?? ""));
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            // Replaces the whole matrix with the bundle; every
                            // row stays editable below afterwards.
                            setForm((f) => ({
                              ...f,
                              permissions: Object.fromEntries(
                                Object.keys(modules).map((k) => [k, preset.permissions[k] ?? ""]),
                              ),
                            }))
                          }
                          data-testid={`account-preset-${key}`}
                          aria-pressed={matches}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-left transition-colors",
                            matches
                              ? "border-gold/50 bg-gold/10"
                              : "border-white/10 bg-obsidian-950 hover:border-white/20 hover:bg-white/5",
                          )}
                        >
                          <span className={cn("block font-heading text-xs font-bold", matches ? "text-gold" : "text-white")}>
                            {preset.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-slate-400 font-body">
                            {preset.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 font-body">
                    A preset fills in the permissions below — adjust any of them afterwards. Own tasks &amp; duties come
                    from linking the account to a staff member.
                  </p>
                </div>
              )}
              <Label>Granular Module Permissions</Label>
              <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-obsidian-950 max-h-64 overflow-y-auto">
                {Object.entries(modules).map(([key, label]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    data-testid={`account-module-${key}`}
                  >
                    <span className="font-medium text-slate-300">{label}</span>
                    <div className="flex gap-1">
                      {(["", "view", "edit"] as PermissionLevel[]).map((level) => (
                        <button
                          key={level || "none"}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              permissions: { ...f.permissions, [key]: level },
                            }))
                          }
                          className={cn(
                            "rounded px-2 py-0.5 text-[11px] font-heading font-bold transition-colors",
                            (form.permissions[key] ?? "") === level
                              ? "bg-gold text-obsidian shadow-sm font-black"
                              : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          {level === "" ? "None" : level.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-account-btn">
              {form.id ? "Update Account" : "Create Account"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
