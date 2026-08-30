import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, ShieldOff, Crown, User, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PermissionLevel = "" | "view" | "edit";

interface StaffBrief {
  id: number;
  full_name: string;
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
  const [staff, setStaff] = useState<StaffBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<OrganizerUser[]>("/organizer-users"),
      api.get<{ modules: Record<string, string> }>("/organizer-users/modules"),
      api.get<StaffBrief[]>("/staff"),
    ])
      .then(([u, m, s]) => {
        setUsers(u.data);
        setModules(m.data.modules);
        setStaff(s.data);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

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
  const toggleFormStaff = (id: number) => {
    setForm((f) => ({
      ...f,
      staff_member_ids: f.staff_member_ids.includes(id)
        ? f.staff_member_ids.filter((x) => x !== id)
        : [...f.staff_member_ids, id],
    }));
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
          username: form.username,
          full_name: form.full_name || null,
          is_admin: form.is_admin,
          permissions,
          staff_member_ids: form.staff_member_ids,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/organizer-users/${form.id}`, payload);
      } else {
        await api.post("/organizer-users", {
          username: form.username,
          full_name: form.full_name || null,
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
    if (!confirm(`Delete the account "${u.username}"? This can't be undone.`)) return;
    try {
      await api.delete(`/organizer-users/${u.id}`);
      toast.success("Deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete account");
    }
  };

  const summarize = (u: OrganizerUser) => {
    if (u.is_admin) return "Full access";
    const entries = Object.entries(u.permissions || {});
    if (entries.length === 0) return "No access yet";
    return entries.map(([k, v]) => `${modules[k] ?? k} (${v})`).join(", ");
  };

  return (
    <div data-testid="admin-accounts" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            ORGANIZER RBAC & ACCESS CONTROL
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            User Accounts & Security
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            {users.length} organizer account{users.length === 1 ? "" : "s"} · role-based permissions and staff device linking.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={openCreate}
          data-testid="add-account-btn"
          className="text-xs font-extrabold"
        >
          <Plus className="h-4 w-4" /> Add Organizer Account
        </Button>
      </div>

      {/* ACCOUNTS CONTENT */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
            <Spinner label="Loading organizer accounts…" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState title="No accounts found" hint="Add your first organizer account." />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {users.map((u) => (
                <div
                  key={u.id}
                  data-testid={`account-card-${u.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <User className="h-4 w-4 text-gold" />
                        <h3 className="font-heading font-bold text-white text-base">{u.username}</h3>
                        {u.is_admin && <Crown className="h-3.5 w-3.5 text-gold" />}
                      </div>
                      <p className="text-xs text-slate-400 font-body mt-0.5">
                        {u.full_name || "No full name specified"}
                      </p>
                    </div>
                    <Badge tone={u.is_active ? "green" : "neutral"} size="sm">
                      {u.is_active ? "Active" : "Deactivated"}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-300 font-body border-t border-white/5 pt-2">
                    {summarize(u)}
                  </p>

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
                      className="h-8 text-xs"
                      onClick={() => openEdit(u)}
                    >
                      Edit
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

            {/* DESKTOP: TABLE */}
            <div className="hidden lg:block">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12">#</TH>
                    <TH>Username</TH>
                    <TH>Full Name</TH>
                    <TH>Linked Staff Member</TH>
                    <TH>Module Access Rights</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {users.map((u, i) => (
                    <TR key={u.id} data-testid={`account-row-${u.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <span className="font-heading font-bold text-white text-sm">{u.username}</span>
                          {u.is_admin && <Crown className="h-3.5 w-3.5 text-gold shrink-0" />}
                        </div>
                      </TD>
                      <TD className="text-slate-300 font-body text-xs">{u.full_name || "—"}</TD>
                      <TD className="text-xs text-slate-300 font-body max-w-xs truncate">
                        {u.staff_members.length > 0
                          ? u.staff_members.map((s) => s.full_name).join(", ")
                          : "Not linked"}
                      </TD>
                      <TD className="text-xs text-slate-400 font-body max-w-sm">
                        {u.is_admin ? (
                          <span className="inline-flex items-center gap-1 rounded bg-gold/15 border border-gold/30 px-2 py-0.5 font-heading font-bold text-gold">
                            <Crown className="h-3 w-3" /> Full Administrator Access
                          </span>
                        ) : (
                          <span className="truncate">{summarize(u)}</span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={u.is_active ? "green" : "neutral"} size="sm">
                          {u.is_active ? "Active" : "Deactivated"}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActive(u)}
                            data-testid={`toggle-account-${u.id}`}
                            className="text-xs"
                          >
                            {u.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(u)}
                            data-testid={`edit-account-${u.id}`}
                            title="Edit Account"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-300" />
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
      </div>

      {/* ADD / EDIT ACCOUNT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Edit Account Details" : "Create New Organizer Account"}
        testId="account-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Username *</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="e.g. referee_desk1"
              data-testid="account-username-input"
            />
          </div>
          <div>
            <Label>Staff Full Name</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="e.g. Ramesh Kumar"
            />
          </div>
          <div>
            <Label>{form.id ? "New Password (Leave blank to preserve)" : "Password *"}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={form.id ? "••••••••" : "At least 8 characters"}
              data-testid="account-password-input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Link to Staff Personnel ({form.staff_member_ids.length} linked)</Label>
              {form.staff_member_ids.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-gold hover:underline"
                  onClick={() => setForm((f) => ({ ...f, staff_member_ids: [] }))}
                >
                  Clear Selection
                </button>
              )}
            </div>
            <div
              className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-obsidian-950 p-2 space-y-1"
              data-testid="account-staff-list"
            >
              {staff.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.staff_member_ids.includes(s.id)}
                    onChange={() => toggleFormStaff(s.id)}
                    className="rounded border-white/20 text-gold focus:ring-gold"
                  />
                  <span>{s.full_name}</span>
                </label>
              ))}
              {staff.length === 0 && (
                <p className="p-2 text-xs text-slate-400">No staff members enrolled yet.</p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-obsidian-950 px-3.5 py-2.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_admin}
              onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))}
              data-testid="account-is-admin-checkbox"
              className="rounded border-white/20 text-gold focus:ring-gold"
            />
            <div>
              <span className="font-heading font-bold text-white">Full System Administrator</span>
              <p className="text-slate-400 font-body text-[11px]">
                Grants unrestricted access across all modules, rosters, and user management.
              </p>
            </div>
          </label>

          {!form.is_admin && (
            <div className="space-y-2">
              <Label>Module Access Rights</Label>
              <div className="divide-y divide-white/10 rounded-lg border border-white/10 bg-obsidian-950 max-h-48 overflow-y-auto">
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
              {form.id ? "Update Account" : "Save Account"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
