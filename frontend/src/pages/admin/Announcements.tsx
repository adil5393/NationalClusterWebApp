import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { priorityTone, formatDate } from "@/lib/meta";

interface Ann {
  id: number;
  title: string;
  message: string;
  priority: string;
  audience: string;
  is_published: boolean;
  published_at?: string | null;
}

const emptyForm = { title: "", message: "", priority: "normal", audience: "everyone", is_published: "true" };

export default function AdminAnnouncements() {
  const [items, setItems] = useState<Ann[]>([]);
  const [meta, setMeta] = useState<{ priorities: string[]; audiences: string[] }>({ priorities: [], audiences: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  const load = () => {
    setLoading(true);
    api.get<Ann[]>("/announcements").then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { api.get("/announcements/meta").then((r) => setMeta(r.data)); }, []);
  useEffect(load, []);

  const openNew = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const openEdit = (a: Ann) => {
    setForm({ title: a.title, message: a.message, priority: a.priority, audience: a.audience, is_published: String(a.is_published) });
    setEditId(a.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.message.trim()) return toast.error("Title and message are required");
    const payload = {
      title: form.title, message: form.message, priority: form.priority,
      audience: form.audience, is_published: form.is_published === "true",
    };
    try {
      if (editId) await api.put(`/announcements/${editId}`, payload);
      else await api.post("/announcements", payload);
      toast.success(editId ? "Announcement updated" : "Announcement published");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this announcement?")) return;
    await api.delete(`/announcements/${id}`);
    toast.success("Deleted");
    load();
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-announcements">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Announcements</h1>
          <p className="mt-1 text-sm text-slate-500">{items.length} announcements</p>
        </div>
        <Button onClick={openNew} data-testid="add-announcement-btn"><Plus className="h-4 w-4" /> New Announcement</Button>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="p-6"><EmptyState title="No announcements" hint="Publish updates for participants and staff." /></div>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>#</TH><TH>Title</TH><TH>Priority</TH><TH>Audience</TH><TH>Status</TH><TH>Published</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {items.map((a, i) => (
                <TR key={a.id} data-testid={`announcement-row-${a.id}`}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="max-w-md font-bold text-slate-900">{a.title}<div className="truncate text-xs font-normal text-slate-500">{a.message}</div></TD>
                  <TD><Badge tone={priorityTone(a.priority)}>{a.priority.toUpperCase()}</Badge></TD>
                  <TD className="capitalize text-slate-600">{a.audience}</TD>
                  <TD>{a.is_published ? <Badge tone="green">Published</Badge> : <Badge tone="neutral">Draft</Badge>}</TD>
                  <TD className="text-slate-600">{formatDate(a.published_at)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)} data-testid={`edit-announcement-${a.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(a.id)} data-testid={`delete-announcement-${a.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={editId ? "Edit Announcement" : "New Announcement"} testId="announcement-dialog">
        <div className="space-y-4">
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="announcement-title-input" /></div>
          <div><Label>Message *</Label><Textarea value={form.message} onChange={(e) => set("message", e.target.value)} data-testid="announcement-message-input" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onChange={(e) => set("priority", e.target.value)} data-testid="announcement-priority-select">
                {meta.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div>
              <Label>Audience</Label>
              <Select value={form.audience} onChange={(e) => set("audience", e.target.value)}>
                {meta.audiences.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>Publish?</Label>
            <Select value={form.is_published} onChange={(e) => set("is_published", e.target.value)}>
              <option value="true">Published (visible on public site)</option>
              <option value="false">Draft (organizers only)</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-announcement-btn">Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
