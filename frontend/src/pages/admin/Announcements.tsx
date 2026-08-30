import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Megaphone, AlertCircle, Radio, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { priorityTone, formatDate } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";

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
  const { canEdit } = useModuleAccess("announcements");
  const [items, setItems] = useState<Ann[]>([]);
  const [meta, setMeta] = useState<{ priorities: string[]; audiences: string[] }>({
    priorities: [],
    audiences: [],
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  const load = () => {
    setLoading(true);
    api
      .get<Ann[]>("/announcements")
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    api.get("/announcements/meta").then((r) => setMeta(r.data));
  }, []);
  useEffect(load, []);

  const openNew = () => {
    setForm(emptyForm);
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (a: Ann) => {
    setForm({
      title: a.title,
      message: a.message,
      priority: a.priority,
      audience: a.audience,
      is_published: String(a.is_published),
    });
    setEditId(a.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.message.trim())
      return toast.error("Title and message are required");
    const payload = {
      title: form.title,
      message: form.message,
      priority: form.priority,
      audience: form.audience,
      is_published: form.is_published === "true",
    };
    try {
      if (editId) await api.put(`/announcements/${editId}`, payload);
      else await api.post("/announcements", payload);
      toast.success(editId ? "Announcement updated" : "Announcement published");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save announcement");
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
    <div data-testid="admin-announcements" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            BROADCAST DESK & OFFICIAL NOTICES
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Announcements Bulletin
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Publish real-time advisories, schedule changes, and technical notices to participants and coaches.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={openNew}
            data-testid="add-announcement-btn"
            className="text-xs font-extrabold"
          >
            <Plus className="h-4 w-4" /> Publish Announcement
          </Button>
        )}
      </div>

      {/* ANNOUNCEMENTS CONTENT */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
            <Spinner label="Loading bulletin notices…" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState
              title="No announcements posted"
              hint="Publish official bulletins for delegations, coaches, and staff."
            />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {items.map((a, i) => (
                <div
                  key={a.id}
                  data-testid={`announcement-card-${a.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                      <h3 className="font-heading font-bold text-white text-base">{a.title}</h3>
                    </div>
                    <Badge tone={priorityTone(a.priority)} size="sm">
                      {a.priority.toUpperCase()}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-300 font-body leading-relaxed line-clamp-3">
                    {a.message}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/5 pt-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-white/5 px-2 py-0.5 font-bold capitalize text-slate-300">
                        {a.audience}
                      </span>
                      {a.is_published ? (
                        <Badge tone="live" size="sm">
                          Published
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="sm">
                          Draft
                        </Badge>
                      )}
                    </div>
                    <span className="text-slate-400 font-mono">{formatDate(a.published_at)}</span>
                  </div>

                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => openEdit(a)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => remove(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* DESKTOP: TABLE */}
            <div className="hidden lg:block">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12">#</TH>
                    <TH>Notice Title & Message</TH>
                    <TH>Priority</TH>
                    <TH>Audience</TH>
                    <TH>Broadcast Status</TH>
                    <TH>Published Time</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((a, i) => (
                    <TR key={a.id} data-testid={`announcement-row-${a.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                      <TD className="max-w-md">
                        <div>
                          <p className="font-heading font-bold text-white text-sm">{a.title}</p>
                          <p className="text-xs text-slate-400 font-body line-clamp-2 mt-0.5">
                            {a.message}
                          </p>
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={priorityTone(a.priority)} size="sm">
                          {a.priority.toUpperCase()}
                        </Badge>
                      </TD>
                      <TD className="capitalize text-slate-300 font-body text-xs">{a.audience}</TD>
                      <TD>
                        {a.is_published ? (
                          <Badge tone="live" size="sm">
                            Published
                          </Badge>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            Draft
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-slate-400 font-mono text-xs">
                        {formatDate(a.published_at)}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEdit(a)}
                              data-testid={`edit-announcement-${a.id}`}
                              title="Edit Announcement"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => remove(a.id)}
                              data-testid={`delete-announcement-${a.id}`}
                              title="Delete Announcement"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          )}
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

      {/* ADD / EDIT ANNOUNCEMENT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit Broadcast Notice" : "Compose Broadcast Notice"}
        testId="announcement-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Notice Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Schedule Update: Court 1 Match Timing Moved"
              data-testid="announcement-title-input"
            />
          </div>
          <div>
            <Label>Notice Message Content *</Label>
            <Textarea
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Detailed announcement text..."
              rows={4}
              data-testid="announcement-message-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority Level</Label>
              <Select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                data-testid="announcement-priority-select"
              >
                {meta.priorities.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Target Audience</Label>
              <Select value={form.audience} onChange={(e) => set("audience", e.target.value)}>
                {meta.audiences.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Publishing Visibility</Label>
            <Select value={form.is_published} onChange={(e) => set("is_published", e.target.value)}>
              <option value="true">Live (Visible on Public Website & Ticker)</option>
              <option value="false">Draft (Visible to Organizers Only)</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-announcement-btn">
              {editId ? "Update Notice" : "Broadcast Notice"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
