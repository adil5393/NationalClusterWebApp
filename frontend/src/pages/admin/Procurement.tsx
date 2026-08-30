import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShoppingCart, DollarSign, Package } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { procurementStatusTone, formatMoney } from "@/lib/meta";

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
  title: "",
  category: "General",
  status: "Open",
  quantity: "",
  target_unit_price: "",
  max_budget: "",
  currency: "INR",
  supplier: "",
  owner: "",
  notes: "",
};

export default function Procurement() {
  const [items, setItems] = useState<PItem[]>([]);
  const [meta, setMeta] = useState<{ statuses: string[]; categories: string[] }>({
    statuses: [],
    categories: [],
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  const load = () => {
    setLoading(true);
    api
      .get<PItem[]>("/procurement")
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    api.get("/procurement/meta").then((r) => setMeta(r.data));
  }, []);
  useEffect(load, []);

  const openNew = () => {
    setForm(emptyForm);
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (it: PItem) => {
    setForm({
      title: it.title,
      category: it.category ?? "General",
      status: it.status,
      quantity: String(it.quantity ?? ""),
      target_unit_price: String(it.target_unit_price ?? ""),
      max_budget: String(it.max_budget ?? ""),
      currency: it.currency ?? "INR",
      supplier: it.supplier ?? "",
      owner: it.owner ?? "",
      notes: it.notes ?? "",
    });
    setEditId(it.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    const payload: Record<string, unknown> = {
      title: form.title,
      category: form.category,
      status: form.status,
      currency: form.currency,
      supplier: form.supplier,
      owner: form.owner,
      notes: form.notes,
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
    <div data-testid="admin-procurement" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            REQUISITIONS & TOURNAMENT ASSETS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Procurement & Inventory
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            {items.length} items tracked · manage vendor quotes, orders, and event supplies.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={openNew}
          data-testid="add-procurement-btn"
          className="text-xs font-extrabold"
        >
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      {/* PROCUREMENT CONTENT */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
            <Spinner label="Loading procurement requisitions…" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState
              title="No procurement items"
              hint="Track supplier quotations, quantities, and allocations here."
            />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {items.map((p, i) => (
                <div
                  key={p.id}
                  data-testid={`procurement-card-${p.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                      <h3 className="font-heading font-bold text-white text-base">{p.title}</h3>
                      <p className="text-xs text-slate-400 font-body">
                        {p.supplier || p.owner || "No supplier assigned"}
                      </p>
                    </div>
                    <Badge tone={procurementStatusTone(p.status)} size="sm">
                      {p.status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2 text-[11px]">
                    <span className="rounded bg-white/5 px-2 py-0.5 font-bold text-slate-300">
                      {p.category}
                    </span>
                    <span className="rounded bg-white/5 px-2 py-0.5 text-slate-300 font-mono">
                      Qty: {p.quantity ?? "—"}
                    </span>
                    <span className="rounded bg-gold/15 border border-gold/30 px-2 py-0.5 font-mono font-bold text-gold">
                      {formatMoney(p.max_budget, p.currency)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => remove(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
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
                    <TH>Item & Supplier</TH>
                    <TH>Category</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Qty</TH>
                    <TH className="text-right">Target / Unit</TH>
                    <TH className="text-right">Max Budget</TH>
                    <TH>Lead / Owner</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((p, i) => (
                    <TR key={p.id} data-testid={`procurement-row-${p.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                      <TD>
                        <div>
                          <p className="font-heading font-bold text-white text-sm">{p.title}</p>
                          {p.supplier && (
                            <p className="text-xs text-slate-400 font-body line-clamp-1">{p.supplier}</p>
                          )}
                        </div>
                      </TD>
                      <TD className="text-slate-300 font-body text-xs">{p.category}</TD>
                      <TD>
                        <Badge tone={procurementStatusTone(p.status)} size="sm">
                          {p.status}
                        </Badge>
                      </TD>
                      <TD className="text-right font-mono text-xs text-slate-300">
                        {p.quantity ?? "—"}
                      </TD>
                      <TD className="text-right font-mono text-xs text-slate-400">
                        {formatMoney(p.target_unit_price, p.currency)}
                      </TD>
                      <TD className="text-right font-mono text-xs font-bold text-gold">
                        {formatMoney(p.max_budget, p.currency)}
                      </TD>
                      <TD className="text-slate-300 text-xs font-body">{p.owner || "—"}</TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(p)}
                            data-testid={`edit-procurement-${p.id}`}
                            title="Edit Item"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-300" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(p.id)}
                            data-testid={`delete-procurement-${p.id}`}
                            title="Delete Item"
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

      {/* ADD / EDIT PROCUREMENT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit Requisition Item" : "New Requisition Item"}
        className="max-w-2xl"
        testId="procurement-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Item Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. 50x Official Match Kabaddi Mats"
              data-testid="procurement-title-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
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
                data-testid="procurement-status-select"
              >
                {meta.statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                data-testid="procurement-qty-input"
              />
            </div>
            <div>
              <Label>Target / Unit Price</Label>
              <Input
                type="number"
                value={form.target_unit_price}
                onChange={(e) => set("target_unit_price", e.target.value)}
              />
            </div>
            <div>
              <Label>Max Budget</Label>
              <Input
                type="number"
                value={form.max_budget}
                onChange={(e) => set("max_budget", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier / Vendor</Label>
              <Input
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
                placeholder="Vendor name"
              />
            </div>
            <div>
              <Label>Responsible Owner</Label>
              <Input
                value={form.owner}
                onChange={(e) => set("owner", e.target.value)}
                placeholder="Staff lead"
              />
            </div>
          </div>
          <div>
            <Label>Notes & Specifications</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Delivery dates, warranty, payment terms..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-procurement-btn">
              {editId ? "Update Item" : "Save Item"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
