import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Paperclip, BookOpen, Tag, CheckCircle2, MessageSquare } from "lucide-react";
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
  title: "",
  category: "General",
  status: "Idea",
  description: "",
  decision: "",
  reason: "",
  owner: "",
  tags: "",
  notes: "",
};

export default function Knowledge() {
  const [items, setItems] = useState<KItem[]>([]);
  const [meta, setMeta] = useState<{ categories: string[]; statuses: string[] }>({
    categories: [],
    statuses: [],
  });
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
    api
      .get<KItem[]>("/knowledge", { params })
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    api.get("/knowledge/meta").then((r) => setMeta(r.data));
  }, []);
  useEffect(load, [fCat, fStatus]);

  const openNew = () => {
    setForm(emptyForm);
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (it: KItem) => {
    setForm({
      title: it.title,
      category: it.category,
      status: it.status,
      description: it.description ?? "",
      decision: it.decision ?? "",
      reason: it.reason ?? "",
      owner: it.owner ?? "",
      tags: (it.tags ?? []).join(", "),
      notes: it.notes ?? "",
    });
    setEditId(it.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    const payload = {
      ...form,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
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
    <div data-testid="admin-knowledge" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            ORGANIZING COMMITTEE RULINGS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Knowledge Base & Decisions
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Decisions with the context and reasoning behind them — the single source of operational truth.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={openNew}
          data-testid="add-knowledge-btn"
          className="text-xs font-extrabold"
        >
          <Plus className="h-4 w-4" /> New Decision / Ruling
        </Button>
      </div>

      {/* FILTER TABS / SELECTORS */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={fCat}
          onChange={(e) => setFCat(e.target.value)}
          className="w-full sm:w-48 h-9 text-xs"
          data-testid="filter-category"
        >
          <option value="">All Categories ({meta.categories.length})</option>
          {meta.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="w-full sm:w-44 h-9 text-xs"
          data-testid="filter-status"
        >
          <option value="">All Statuses ({meta.statuses.length})</option>
          {meta.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {/* DECISION ITEMS FEED */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
            <Spinner label="Loading decision knowledge base…" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState
              title="No decisions recorded"
              hint="Capture your first committee decision and the reasoning behind it."
            />
          </div>
        ) : (
          <div className="space-y-4" data-testid="knowledge-list">
            {items.map((it) => (
              <div
                key={it.id}
                className="rounded-xl border border-white/10 bg-obsidian-900 p-5 shadow-sm space-y-3 hover:border-white/20 transition-colors"
                data-testid={`knowledge-${it.id}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral" size="sm">
                        {it.category}
                      </Badge>
                      <Badge tone={knowledgeStatusTone(it.status)} size="sm">
                        {it.status}
                      </Badge>
                      {it.owner && (
                        <span className="text-xs text-slate-400 font-mono">
                          Owner: <strong className="text-slate-200">{it.owner}</strong>
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500 font-mono">
                        Updated {formatDate(it.updated_at)}
                      </span>
                    </div>
                    <h3 className="font-heading font-bold text-white text-base sm:text-lg tracking-tight pt-1">
                      {it.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailId(it.id)}
                      data-testid={`details-knowledge-${it.id}`}
                      className="text-xs"
                    >
                      <Paperclip className="h-3.5 w-3.5 text-gold" /> Discussion & Files
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(it)}
                      data-testid={`edit-knowledge-${it.id}`}
                      title="Edit Decision"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-300" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(it.id)}
                      data-testid={`delete-knowledge-${it.id}`}
                      title="Delete Decision"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>

                {it.description && (
                  <p className="text-xs sm:text-sm text-slate-300 font-body leading-relaxed">
                    {it.description}
                  </p>
                )}

                {/* HIGHLIGHTED DECISION BOX */}
                {it.decision && (
                  <div className="rounded-lg border border-gold/40 bg-gold/10 p-3.5 space-y-1">
                    <p className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-gold">
                      Official Ruling / Decision
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                      {it.decision}
                    </p>
                  </div>
                )}

                {/* REASON / CONTEXT */}
                {it.reason && (
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1">
                    <p className="text-[10px] font-heading font-bold uppercase tracking-widest text-slate-400">
                      Reasoning & Context (The WHY)
                    </p>
                    <p className="text-xs text-slate-300 font-body leading-relaxed">{it.reason}</p>
                  </div>
                )}

                {it.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {it.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] font-mono text-slate-300"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD / EDIT KNOWLEDGE MODAL */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit Committee Decision" : "Record Committee Decision / Ruling"}
        className="max-w-2xl"
        testId="knowledge-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Decision Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Tie-Breaker Protocol for Pool Stage Standings"
              data-testid="knowledge-title-input"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Category</Label>
              <Select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                data-testid="knowledge-category-select"
              >
                {meta.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                data-testid="knowledge-status-select"
              >
                {meta.statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Summary / Problem Statement</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What situation or problem required this ruling?"
            />
          </div>
          <div>
            <Label>The Agreed Decision / Ruling</Label>
            <Textarea
              value={form.decision}
              onChange={(e) => set("decision", e.target.value)}
              placeholder="What is the official ruling to be enforced?"
            />
          </div>
          <div>
            <Label>Reasoning & Supporting Context (Why)</Label>
            <Textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="Justification, rules cited, or precedents..."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Owner / Lead Official</Label>
              <Input
                value={form.owner}
                onChange={(e) => set("owner", e.target.value)}
                placeholder="Official name"
              />
            </div>
            <div>
              <Label>Tags (Comma separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="rules, pools, tiebreaker"
              />
            </div>
          </div>
          <div>
            <Label>Operational Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Additional internal notes..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-knowledge-btn">
              {editId ? "Update Ruling" : "Save Ruling"}
            </Button>
          </div>
        </div>
      </Dialog>

      <KnowledgeDetail itemId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
