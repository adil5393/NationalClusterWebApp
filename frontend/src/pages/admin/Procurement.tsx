import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ShoppingCart,
  DollarSign,
  Package,
  Search,
  CheckCircle2,
  Tag,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { procurementStatusTone, formatMoney } from "@/lib/meta";
import { cn } from "@/lib/utils";

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
    statuses: ["Open", "Ordered", "Received", "Cancelled"],
    categories: ["General", "Sports Equipment", "Medical", "Catering", "Stationery"],
  });
  const [loading, setLoading] = useState(true);

  // Search and filter
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Modal
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
    api
      .get("/procurement/meta")
      .then((r) => {
        if (r.data?.statuses && r.data?.categories) {
          setMeta(r.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(load, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((p) => {
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.supplier && p.supplier.toLowerCase().includes(q)) ||
        (p.owner && p.owner.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));

      const matchesCat = filterCategory === "ALL" || p.category === filterCategory;
      const matchesStatus = filterStatus === "ALL" || p.status === filterStatus;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [items, search, filterCategory, filterStatus]);

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
    if (!form.title.trim()) return toast.error("Item title is required");
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      category: form.category || "General",
      status: form.status || "Open",
      currency: form.currency || "INR",
      supplier: form.supplier.trim() || null,
      owner: form.owner.trim() || null,
      notes: form.notes.trim() || null,
      quantity: form.quantity ? Number(form.quantity) : null,
      target_unit_price: form.target_unit_price ? Number(form.target_unit_price) : null,
      max_budget: form.max_budget ? Number(form.max_budget) : null,
    };
    try {
      if (editId) await api.put(`/procurement/${editId}`, payload);
      else await api.post("/procurement", payload);
      toast.success(editId ? "Requisition updated" : "Requisition created");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save requisition");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this procurement requisition?")) return;
    try {
      await api.delete(`/procurement/${id}`);
      toast.success("Requisition deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete item");
    }
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading procurement requisitions…" />
      </div>
    );
  }

  const openCount = items.filter((p) => p.status.toLowerCase() === "open").length;
  const totalBudget = items.reduce((sum, p) => sum + (Number(p.max_budget) || 0), 0);

  return (
    <div data-testid="admin-procurement" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            INVENTORY & REQUISITIONS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Procurement & Supplies
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Track equipment purchases, vendor quotes, quantities, and responsible leads across tournament departments.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={openNew}
          data-testid="add-procurement-btn"
          className="text-xs font-extrabold shrink-0"
        >
          <Plus className="h-4 w-4" /> Add Requisition Item
        </Button>
      </div>

      {/* METRIC PILLS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Requisitions
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-white">{items.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Open Requisitions
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-amber-400">{openCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Estimated Budget
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-gold">
            ₹{totalBudget.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Categories
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-slate-300">{meta.categories.length}</p>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search items, vendors, responsible owner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="procurement-search-input"
            />
          </div>

          <Select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-9 text-xs sm:w-44"
          >
            <option value="ALL">All Categories</option>
            {meta.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 text-xs sm:w-40"
          >
            <option value="ALL">All Statuses</option>
            {meta.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* CONTENT LIST */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No procurement items"
            hint="Create requisitions to track supplier quotations, costs, and equipment delivery."
          />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No matching requisitions"
            hint="Try changing your search terms or filter selections."
          />
        </div>
      ) : (
        <>
          {/* MOBILE: STACKED COMPACT CARDS */}
          <div className="grid gap-2.5 sm:hidden">
            {filteredItems.map((p) => (
              <div
                key={p.id}
                data-testid={`procurement-card-${p.id}`}
                className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-white text-sm truncate">{p.title}</h3>
                    <p className="text-xs text-slate-400 font-body mt-0.5 truncate">
                      {p.supplier ? `Vendor: ${p.supplier}` : "No supplier assigned"}
                    </p>
                  </div>
                  <Badge tone={procurementStatusTone(p.status)} size="sm">
                    {p.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Responsible / Owner</span>
                    <span className="font-medium text-slate-200">{p.owner || "—"}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block">Max Budget</span>
                    <span className="font-mono font-bold text-gold">{formatMoney(p.max_budget, p.currency)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-slate-400 font-mono">
                  <span>Qty: <strong className="text-white">{p.quantity ?? "—"}</strong></span>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(p)}
                      className="h-7 text-xs px-2.5"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(p.id)}
                      className="h-7 w-7 text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP & TABLET: STRUCTURED TABLE */}
          <div className="hidden sm:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">#</TH>
                  <TH>Item & Supplier</TH>
                  <TH>Category</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Quantity</TH>
                  <TH className="text-right">Target Price</TH>
                  <TH className="text-right">Max Budget</TH>
                  <TH>Responsible / Owner</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filteredItems.map((p, i) => (
                  <TR key={p.id} data-testid={`procurement-row-${p.id}`}>
                    <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                    <TD>
                      <div>
                        <p className="font-heading font-bold text-white text-xs">{p.title}</p>
                        {p.supplier && (
                          <p className="text-[11px] text-slate-400 font-body truncate max-w-xs">
                            {p.supplier}
                          </p>
                        )}
                      </div>
                    </TD>
                    <TD className="text-slate-300 text-xs font-body">{p.category || "General"}</TD>
                    <TD>
                      <Badge tone={procurementStatusTone(p.status)} size="sm">
                        {p.status}
                      </Badge>
                    </TD>
                    <TD className="text-right font-mono text-xs text-slate-200">
                      {p.quantity ?? "—"}
                    </TD>
                    <TD className="text-right font-mono text-xs text-slate-400">
                      {formatMoney(p.target_unit_price, p.currency)}
                    </TD>
                    <TD className="text-right font-mono text-xs font-bold text-gold">
                      {formatMoney(p.max_budget, p.currency)}
                    </TD>
                    <TD className="text-slate-200 text-xs font-body font-medium">
                      {p.owner ? (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3 text-gold/70" />
                          {p.owner}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </TD>
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

      {/* ADD / EDIT PROCUREMENT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit Requisition Item" : "New Requisition Item"}
        testId="procurement-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Item Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. Official Tournament Kabaddi Mats"
              data-testid="procurement-title-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(e) => setField("category", e.target.value)}>
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
                onChange={(e) => setField("status", e.target.value)}
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
                onChange={(e) => setField("quantity", e.target.value)}
                data-testid="procurement-qty-input"
              />
            </div>
            <div>
              <Label>Target / Unit Price (₹)</Label>
              <Input
                type="number"
                value={form.target_unit_price}
                onChange={(e) => setField("target_unit_price", e.target.value)}
              />
            </div>
            <div>
              <Label>Max Total Budget (₹)</Label>
              <Input
                type="number"
                value={form.max_budget}
                onChange={(e) => setField("max_budget", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier / Vendor</Label>
              <Input
                value={form.supplier}
                onChange={(e) => setField("supplier", e.target.value)}
                placeholder="Vendor company name"
              />
            </div>
            <div>
              <Label>Responsible / Owner</Label>
              <Input
                value={form.owner}
                onChange={(e) => setField("owner", e.target.value)}
                placeholder="Responsible department lead"
              />
            </div>
          </div>

          <div>
            <Label>Notes & Specifications</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Delivery deadlines, technical standards, warranty notes…"
              rows={2}
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
