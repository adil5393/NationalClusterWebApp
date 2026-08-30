import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, MapPin, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess } from "@/lib/permissions";

interface Venue {
  id: number;
  name: string;
  venue_type?: string;
  capacity?: number;
  location?: string;
  description?: string;
}
const empty: Partial<Venue> = { name: "", venue_type: "", location: "" };

export default function Venues() {
  const { canEdit } = useModuleAccess("venues");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Venue>>(empty);

  const load = () => {
    setLoading(true);
    api
      .get<Venue[]>("/venues")
      .then((r) => setVenues(r.data))
      .finally(() => setLoading(false));
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
    <div data-testid="admin-venues" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            COMPETITION COURTS & INFRASTRUCTURE
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Venues & Match Arenas
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            {venues.length} registered venues & courts used by fixtures, schedules, and ceremonies.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              setForm(empty);
              setOpen(true);
            }}
            data-testid="add-venue-btn"
            className="text-xs font-extrabold"
          >
            <Plus className="h-4 w-4" /> Add Venue / Court
          </Button>
        )}
      </div>

      {/* VENUES CONTENT */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
            <Spinner label="Loading venue registries…" />
          </div>
        ) : venues.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState title="No venues registered yet" hint="Add competition courts or dining arenas." />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {venues.map((v, i) => (
                <div
                  key={v.id}
                  data-testid={`venue-card-${v.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                      <h3 className="font-heading font-bold text-white text-base">{v.name}</h3>
                      <p className="text-xs text-slate-400 font-body flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3.5 w-3.5 text-gold" /> {v.location || "No location specified"}
                      </p>
                    </div>
                    {v.capacity != null && (
                      <span className="rounded bg-white/5 border border-white/5 px-2 py-0.5 text-xs font-mono font-bold text-slate-300 shrink-0">
                        {v.capacity} Cap.
                      </span>
                    )}
                  </div>

                  {v.venue_type && (
                    <div className="pt-1">
                      <Badge tone="gold" size="sm">
                        {v.venue_type}
                      </Badge>
                    </div>
                  )}

                  {v.description && (
                    <p className="text-xs text-slate-400 font-body leading-relaxed">{v.description}</p>
                  )}

                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setForm(v);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => remove(v.id)}
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
                    <TH>Venue / Court Name</TH>
                    <TH>Facility Type</TH>
                    <TH>Location / Map Pin</TH>
                    <TH className="text-right">Seating Capacity</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {venues.map((v, i) => (
                    <TR key={v.id} data-testid={`venue-row-${v.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                      <TD>
                        <div>
                          <p className="font-heading font-bold text-white text-sm">{v.name}</p>
                          {v.description && (
                            <p className="text-xs text-slate-400 font-body line-clamp-1">{v.description}</p>
                          )}
                        </div>
                      </TD>
                      <TD>
                        {v.venue_type ? (
                          <Badge tone="gold" size="sm">
                            {v.venue_type}
                          </Badge>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </TD>
                      <TD className="text-slate-300 font-body text-xs">{v.location || "—"}</TD>
                      <TD className="text-right font-mono text-xs font-bold text-slate-200">
                        {v.capacity ? `${v.capacity} Seats` : "—"}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setForm(v);
                                setOpen(true);
                              }}
                              data-testid={`edit-venue-${v.id}`}
                              title="Edit Venue"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => remove(v.id)}
                              data-testid={`delete-venue-${v.id}`}
                              title="Delete Venue"
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

      {/* ADD / EDIT VENUE DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Edit Venue / Court" : "Register New Venue / Court"}
        testId="venue-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Venue Name *</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Court 1 (Main Broadcast Mat)"
              data-testid="venue-name-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Facility Type</Label>
              <Input
                value={form.venue_type ?? ""}
                onChange={(e) => set("venue_type", e.target.value)}
                placeholder="Arena / Dining / Medical"
              />
            </div>
            <div>
              <Label>Spectator Capacity</Label>
              <Input
                type="number"
                value={form.capacity ?? ""}
                onChange={(e) => set("capacity", e.target.value)}
                placeholder="e.g. 500"
              />
            </div>
          </div>
          <div>
            <Label>Campus Location</Label>
            <Input
              value={form.location ?? ""}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Sports Complex Ground Floor"
            />
          </div>
          <div>
            <Label>Description / Specifications</Label>
            <Textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Specifications, mat dimensions, camera platforms..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-venue-btn">
              {form.id ? "Update Venue" : "Save Venue"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
