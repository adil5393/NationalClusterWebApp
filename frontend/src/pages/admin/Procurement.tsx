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
import { procurementStatusTone, formatMoney } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";

interface PItem {
  id: number;
  title: string;
  category?: string;
  status: string;
  quantity?: number;
  target_unit_price?: string | number;
  max_budget?: string | number;
  currency?: string;
  supplier?: string;
  owner?: string;
  notes?: string;
}

const emptyForm = {
  title: "", category: "General", status: "Open", quantity: "", target_unit_price: "",
  max_budget: "", currency: "INR", supplier: "", owner: "", notes: "",
};

export default function Procurement() {
  const [items, setItems] = useState<PItem[]>([]);
  const [meta, setMeta] = useState<{ statuses: string[]; categories: string[] }>({ statuses: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  const load = () => {
    setLoading(true);
    api.get<PItem[]>("/procurement").then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { api.get("/procurement/meta").then((r) => setMeta(r.data)); }, []);
  useEffect(load, []);

  const openNew = () => { setForm(emptyForm); setEditId(null); setOpen(true); };
  const openEdit = (it: PItem) => {
    setForm({
      title: it.title, category: it.category ?? "General", status: it.status,
      quantity: String(it.quantity ?? ""), target_unit_price: String(it.target_unit_price ?? ""),
      max_budget: String(it.max_budget ?? ""), currency: it.currency ?? "INR",
      supplier: it.supplier ?? "", owner: it.owner ?? "", notes: it.notes ?? "",
    });
    setEditId(it.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    const payload: Record<string, unknown> = {
      title: form.title, category: form.category, status: form.status, currency: form.currency,
      supplier: form.supplier, owner: form.owner, notes: form.notes,
      quantity: form.quantity ? Number(form.quantity) : null,
      target_unit_price: form.target_unit_price ? Number(form.target_unit_price) : null,
      max_budget: form.max_budget ? Number(form.max_budget) : null,
    };
    try {
      if (editId) await api.put(`/procurement/${editId}`, payload);
      else await api.post("/procurement", payload);
      toast.success(editId ? "Item updated" : "Item created");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this procurement item?")) return;
    await api.delete(`/procurement/${id}`);
    toast.success("Deleted");
    load();
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-procurement">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-white lg:text-slate-950">Procurement</h1>
          <p className="mt-1 text-sm text-slate-400 lg:text-slate-500">{items.length} items tracked</p>
        </div>
        <Button onClick={openNew} data-testid="add-procurement-btn"><Plus className="h-4 w-4" /> Add Item</Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-white/5 lg:border-slate-200 lg:bg-white">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="p-6"><EmptyState title="No procurement items" hint="Track quotations, quantities and budgets here." /></div>
        ) : (<>
          <div className="grid gap-2 p-2 lg:hidden">{items.map((p, i) => <div key={p.id} data-testid={`procurement-card-${p.id}`} className="w-full min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[10px] font-semibold text-slate-500">#{i + 1}</div><div className="break-words text-sm font-bold text-white">{p.title}</div><div className="truncate text-[11px] text-slate-400">{p.supplier || p.owner || "No supplier/owner"}</div></div><Badge tone={procurementStatusTone(p.status)}>{p.status}</Badge></div><div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2"><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{p.category}</span><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">Qty {p.quantity ?? "—"}</span><span className="rounded bg-coral/15 px-1.5 py-0.5 text-[10px] font-bold text-coral">{formatMoney(p.max_budget, p.currency)}</span></div><div className="mt-2 grid grid-cols-2 gap-1.5"><Button variant="outline" size="sm" className="h-8 min-w-0 border-white/15 bg-white/5 px-1 text-[11px] text-slate-200 hover:bg-white/10" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button variant="danger" size="sm" className="h-8 min-w-0 border-red-500/30 bg-red-500/10 px-1 text-[11px] text-red-400 hover:bg-red-500/20" onClick={() => remove(p.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button></div></div>)}</div>
          <div className="hidden lg:block"><Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>#</TH><TH>Item</TH><TH>Category</TH><TH>Status</TH>
                <TH className="text-right">Qty</TH><TH className="text-right">Target/Unit</TH>
                <TH className="text-right">Max Budget</TH><TH>Owner</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {items.map((p, i) => (
                <TR key={p.id} data-testid={`procurement-row-${p.id}`}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="font-bold text-slate-900">{p.title}{p.supplier && <div className="text-xs font-normal text-slate-500">{p.supplier}</div>}</TD>
                  <TD className="text-slate-600">{p.category}</TD>
                  <TD><Badge tone={procurementStatusTone(p.status)}>{p.status}</Badge></TD>
                  <TD className="text-right">{p.quantity ?? "—"}</TD>
                  <TD className="text-right">{formatMoney(p.target_unit_price, p.currency)}</TD>
                  <TD className="text-right font-semibold">{formatMoney(p.max_budget, p.currency)}</TD>
                  <TD className="text-slate-600">{p.owner || "—"}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`edit-procurement-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)} data-testid={`delete-procurement-${p.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table></div>
        </>)}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={editId ? "Edit Procurement Item" : "Add Procurement Item"} className="max-w-2xl" testId="procurement-dialog">
        <div className="space-y-4">
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="procurement-title-input" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
                {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => set("status", e.target.value)} data-testid="procurement-status-select">
                {meta.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} data-testid="procurement-qty-input" /></div>
            <div><Label>Target / Unit</Label><Input type="number" value={form.target_unit_price} onChange={(e) => set("target_unit_price", e.target.value)} /></div>
            <div><Label>Max Budget</Label><Input type="number" value={form.max_budget} onChange={(e) => set("max_budget", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></div>
            <div><Label>Owner</Label><Input value={form.owner} onChange={(e) => set("owner", e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-procurement-btn">Save Item</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
