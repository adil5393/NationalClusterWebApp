import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, ShieldOff, Crown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";

type PermissionLevel = "" | "view" | "edit";

interface StaffBrief { id: number; full_name: string }
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
const emptyForm: FormState = { username: "", full_name: "", password: "", is_admin: false, permissions: {}, staff_member_ids: [] };

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
      .then(([u, m, s]) => { setUsers(u.data); setModules(m.data.modules); setStaff(s.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
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
      staff_member_ids: f.staff_member_ids.includes(id) ? f.staff_member_ids.filter((x) => x !== id) : [...f.staff_member_ids, id],
    }));
  };

  const save = async () => {
    if (!form.username.trim()) return toast.error("Username is required");
    if (!form.id && (!form.password || form.password.length < 8)) return toast.error("Password must be at least 8 characters");
    if (form.password && form.password.length > 0 && form.password.length < 8) return toast.error("Password must be at least 8 characters");
    const permissions = Object.fromEntries(Object.entries(form.permissions).filter(([, v]) => v));
    try {
      if (form.id) {
        const payload: any = { username: form.username, full_name: form.full_name || null, is_admin: form.is_admin, permissions, staff_member_ids: form.staff_member_ids };
        if (form.password) payload.password = form.password;
        await api.put(`/organizer-users/${form.id}`, payload);
      } else {
        await api.post("/organizer-users", { username: form.username, full_name: form.full_name || null, password: form.password, is_admin: form.is_admin, permissions, staff_member_ids: form.staff_member_ids });
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
    <div data-testid="admin-accounts">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Accounts</h1>
          <p className="mt-1 text-sm text-slate-500">{users.length} organizer account{users.length === 1 ? "" : "s"} · each has their own login and access</p>
        </div>
        <Button onClick={openCreate} data-testid="add-account-btn"><Plus className="h-4 w-4" /> Add Account</Button>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white">
        {loading ? <Spinner /> : users.length === 0 ? (
          <div className="p-6"><EmptyState title="No accounts yet" hint="Add the first organizer account to log in with." /></div>
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>#</TH><TH>Username</TH><TH>Name</TH><TH>Staff Member(s)</TH><TH>Access</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR></THead>
            <tbody>
              {users.map((u, i) => (
                <TR key={u.id} data-testid={`account-row-${u.id}`}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="font-bold text-slate-900">{u.username}</TD>
                  <TD className="text-slate-600">{u.full_name || "—"}</TD>
                  <TD className="max-w-[14rem] text-xs text-slate-600">
                    {u.staff_members.length > 0 ? u.staff_members.map((s) => s.full_name).join(", ") : <span className="text-slate-400">Not linked</span>}
                  </TD>
                  <TD className="max-w-xs text-xs text-slate-500">
                    {u.is_admin && <span className="mr-1.5 inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 font-bold text-coral-600 ring-1 ring-orange-200"><Crown className="h-3 w-3" /> Admin</span>}
                    {!u.is_admin && <span>{summarize(u)}</span>}
                  </TD>
                  <TD>
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                        <ShieldCheck className="h-3.5 w-3.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                        <ShieldOff className="h-3.5 w-3.5" /> Deactivated
                      </span>
                    )}
                  </TD>
                  <TD><div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(u)} data-testid={`toggle-account-${u.id}`}>
                      {u.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)} data-testid={`edit-account-${u.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(u)} data-testid={`delete-account-${u.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={form.id ? "Edit Account" : "Add Account"} testId="account-dialog">
        <div className="space-y-4">
          <div><Label>Username *</Label><Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} data-testid="account-username-input" /></div>
          <div><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></div>
          <div>
            <Label>{form.id ? "New Password" : "Password *"}</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={form.id ? "Leave blank to keep current password" : "At least 8 characters"} data-testid="account-password-input" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Staff Member(s) ({form.staff_member_ids.length} linked)</Label>
              {form.staff_member_ids.length > 0 && (
                <button type="button" className="text-xs font-semibold text-slate-500" onClick={() => setForm((f) => ({ ...f, staff_member_ids: [] }))}>Clear</button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Every account here belongs to a real staff member — link who this login is for. One account can stand in for more than one person (e.g. a shared shift device).</p>
            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-slate-200 p-2" data-testid="account-staff-list">
              {staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={form.staff_member_ids.includes(s.id)} onChange={() => toggleFormStaff(s.id)} />
                  {s.full_name}
                </label>
              ))}
              {staff.length === 0 && <p className="p-2 text-sm text-slate-400">No staff members found — add them under Staff & Duties first.</p>}
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))} data-testid="account-is-admin-checkbox" />
            <span className="font-semibold text-slate-800">Admin</span>
            <span className="text-xs text-slate-500">— full access to every section, plus managing accounts</span>
          </label>

          {!form.is_admin && (
            <div>
              <Label>Module Access</Label>
              <div className="mt-1.5 divide-y divide-slate-200 rounded-md border border-slate-200">
                {Object.entries(modules).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm" data-testid={`account-module-${key}`}>
                    <span className="text-slate-700">{label}</span>
                    <div className="flex gap-1">
                      {(["", "view", "edit"] as PermissionLevel[]).map((level) => (
                        <button
                          key={level || "none"}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, permissions: { ...f.permissions, [key]: level } }))}
                          className={
                            "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors " +
                            ((form.permissions[key] ?? "") === level
                              ? "bg-coral text-white"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                          }
                        >
                          {level || "None"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-account-btn">Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
