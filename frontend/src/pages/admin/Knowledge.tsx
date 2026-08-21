import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { KnowledgeDetail } from "@/components/admin/KnowledgeDetail";
import { knowledgeStatusTone, formatDate } from "@/lib/meta";

interface KItem {
  id: number;
  title: string;
  category: string;
  status: string;
  description?: string;
  decision?: string;
  reason?: string;
  owner?: string;
  tags: string[];
  notes?: string;
  updated_at?: string;
}

const emptyForm = {
  title: "", category: "General", status: "Idea", description: "", decision: "",
  reason: "", owner: "", tags: "", notes: "",
};

export default function Knowledge() {
  const [items, setItems] = useState<KItem[]>([]);
  const [meta, setMeta] = useState<{ categories: string[]; statuses: string[] }>({ categories: [], statuses: [] });
  const [loading, setLoading] = useState(true);
  const [fCat, setFCat] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (fCat) params.category = fCat;
    if (fStatus) params.status = fStatus;
    api.get<KItem[]>("/knowledge", { params }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { api.get("/knowledge/meta").then((r) => setMeta(r.data)); }, []);
  useEffect(load, [fCat, fStatus]);

  const openNew = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const openEdit = (it: KItem) => {
    setForm({
      title: it.title, category: it.category, status: it.status, description: it.description ?? "",
      decision: it.decision ?? "", reason: it.reason ?? "", owner: it.owner ?? "",
      tags: (it.tags ?? []).join(", "), notes: it.notes ?? "",
    });
    setEditId(it.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    const payload = { ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    try {
      if (editId) await api.put(`/knowledge/${editId}`, payload);
      else await api.post("/knowledge", payload);
      toast.success(editId ? "Decision updated" : "Decision created");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this knowledge item?")) return;
    await api.delete(`/knowledge/${id}`);
    toast.success("Deleted");
    load();
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-knowledge">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Knowledge Base</h1>
          <p className="mt-1 text-sm text-slate-500">Decisions with the reasoning behind them — the single source of truth.</p>
        </div>
        <Button onClick={openNew} data-testid="add-knowledge-btn"><Plus className="h-4 w-4" /> New Decision</Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Select value={fCat} onChange={(e) => setFCat(e.target.value)} className="w-auto" data-testid="filter-category">
          <option value="">All Categories</option>
          {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="w-auto" data-testid="filter-status">
          <option value="">All Statuses</option>
          {meta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="mt-6"><EmptyState title="No decisions recorded" hint="Capture your first decision and the reasoning behind it." /></div>
      ) : (
        <div className="mt-6 space-y-3" data-testid="knowledge-list">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-5" data-testid={`knowledge-${it.id}`}>
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="flex shrink-0 flex-col gap-2 md:w-40">
                  <Badge tone="slate">{it.category}</Badge>
                  <Badge tone={knowledgeStatusTone(it.status)}>{it.status}</Badge>
                  {it.owner && <span className="text-xs text-slate-500">Owner: <strong className="text-slate-700">{it.owner}</strong></span>}
                  <span className="text-xs text-slate-400">Updated {formatDate(it.updated_at)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-lg font-bold text-slate-950">{it.title}</h3>
                  {it.description && <p className="mt-1 text-sm text-slate-600">{it.description}</p>}
                  {it.decision && (
                    <div className="mt-3 rounded-md border-l-2 border-coral bg-orange-50/60 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-coral-600">Decision</p>
                      <p className="text-sm font-semibold text-slate-800">{it.decision}</p>
                    </div>
                  )}
                  {it.reason && (
                    <div className="mt-2 rounded-md bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reason / Why</p>
                      <p className="text-sm text-slate-700">{it.reason}</p>
                    </div>
                  )}
                  {it.tags?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {it.tags.map((t) => <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setDetailId(it.id)} data-testid={`details-knowledge-${it.id}`}><Paperclip className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(it)} data-testid={`edit-knowledge-${it.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(it.id)} data-testid={`delete-knowledge-${it.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editId ? "Edit Decision" : "New Decision"} className="max-w-2xl" testId="knowledge-dialog">
        <div className="space-y-4">
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="knowledge-title-input" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(e) => set("category", e.target.value)} data-testid="knowledge-category-select">
                {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => set("status", e.target.value)} data-testid="knowledge-status-select">
                {meta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
          <div><Label>Decision</Label><Textarea value={form.decision} onChange={(e) => set("decision", e.target.value)} /></div>
          <div><Label>Reason / Context (the WHY)</Label><Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Owner</Label><Input value={form.owner} onChange={(e) => set("owner", e.target.value)} /></div>
            <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-knowledge-btn">Save Decision</Button>
          </div>
        </div>
      </Dialog>

      <KnowledgeDetail itemId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
