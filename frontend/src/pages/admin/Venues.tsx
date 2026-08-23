import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";

interface Venue {
  id: number; name: string; venue_type?: string; capacity?: number; location?: string; description?: string;
}
const empty: Partial<Venue> = { name: "", venue_type: "", location: "" };

export default function Venues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Venue>>(empty);

  const load = () => {
    setLoading(true);
    api.get<Venue[]>("/venues").then((r) => setVenues(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Venue name is required");
    const payload = { ...form, capacity: form.capacity ? Number(form.capacity) : null };
    try {
      if (form.id) await api.put(`/venues/${form.id}`, payload);
      else await api.post("/venues", payload);
      toast.success(form.id ? "Venue updated" : "Venue added");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save venue");
    }
  };
  const remove = async (id: number) => {
    if (!confirm("Delete this venue?")) return;
    await api.delete(`/venues/${id}`);
    toast.success("Deleted");
    load();
  };
  const set = (k: keyof Venue, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-venues">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Venues</h1>
          <p className="mt-1 text-sm text-slate-500">{venues.length} venues · used by schedule events</p>
        </div>
        <Button onClick={() => { setForm(empty); setOpen(true); }} data-testid="add-venue-btn"><Plus className="h-4 w-4" /> Add Venue</Button>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white">
        {loading ? <Spinner /> : venues.length === 0 ? (
          <div className="p-6"><EmptyState title="No venues yet" hint="Add venues so schedule events can show a location." /></div>
        ) : (
          <Table>
            <THead><TR className="hover:bg-transparent"><TH>#</TH><TH>Name</TH><TH>Type</TH><TH>Location</TH><TH className="text-right">Capacity</TH><TH className="text-right">Actions</TH></TR></THead>
            <tbody>
              {venues.map((v, i) => (
                <TR key={v.id} data-testid={`venue-row-${v.id}`}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="font-bold text-slate-900">{v.name}</TD>
                  <TD>{v.venue_type || "—"}</TD>
                  <TD className="text-slate-600">{v.location || "—"}</TD>
                  <TD className="text-right">{v.capacity ?? "—"}</TD>
                  <TD><div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setForm(v); setOpen(true); }} data-testid={`edit-venue-${v.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(v.id)} data-testid={`delete-venue-${v.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={form.id ? "Edit Venue" : "Add Venue"} testId="venue-dialog">
        <div className="space-y-4">
          <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} data-testid="venue-name-input" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Type</Label><Input value={form.venue_type ?? ""} onChange={(e) => set("venue_type", e.target.value)} placeholder="Arena, Dining…" /></div>
            <div><Label>Capacity</Label><Input type="number" value={form.capacity ?? ""} onChange={(e) => set("capacity", e.target.value)} /></div>
          </div>
          <div><Label>Location</Label><Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-venue-btn">Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
