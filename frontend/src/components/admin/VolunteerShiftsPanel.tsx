import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, MapPin, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

interface VolunteerLite {
  id: number;
  full_name: string;
  student_class?: string | null;
}

interface VolunteerShift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  notes?: string | null;
  volunteers: (VolunteerLite & { phone?: string | null })[];
}

interface FormState {
  id?: number;
  name: string;
  start: string; // datetime-local value, in the browser's (event) local time
  end: string;
  location: string;
  notes: string;
  volunteerIds: number[];
}

const emptyForm = (): FormState => ({ name: "", start: "", end: "", location: "", notes: "", volunteerIds: [] });

/** ISO -> "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function timeRange(s: string, e: string): string {
  const f = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(s).toDateString() === new Date(e).toDateString();
  return sameDay ? `${f(s)} – ${f(e)}` : `${f(s)} – ${dayLabel(e)} ${f(e)}`;
}

/** Volunteers page → "Shifts" tab: create volunteer duty shifts and assign
 * volunteers to them (backend /volunteers/shifts). Volunteers see their own
 * on My ID Card. Separate from the staff shift system. */
export function VolunteerShiftsPanel({ volunteers, canEdit }: { volunteers: VolunteerLite[]; canEdit: boolean }) {
  const [shifts, setShifts] = useState<VolunteerShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [pickSearch, setPickSearch] = useState("");

  const load = () =>
    api
      .get<VolunteerShift[]>("/volunteers/shifts")
      .then((r) => setShifts(r.data))
      .catch(() => toast.error("Could not load volunteer shifts"))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, VolunteerShift[]>();
    for (const s of shifts) {
      const key = new Date(s.start_time).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.values());
  }, [shifts]);

  const pickable = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return volunteers
      .filter((v) => !q || v.full_name.toLowerCase().includes(q) || (v.student_class ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [volunteers, pickSearch]);

  const openNew = () => {
    setForm(emptyForm());
    setPickSearch("");
    setOpen(true);
  };
  const openEdit = (s: VolunteerShift) => {
    setForm({
      id: s.id,
      name: s.name,
      start: toLocalInput(s.start_time),
      end: toLocalInput(s.end_time),
      location: s.location ?? "",
      notes: s.notes ?? "",
      volunteerIds: s.volunteers.map((v) => v.id),
    });
    setPickSearch("");
    setOpen(true);
  };

  const toggleVolunteer = (id: number) =>
    setForm((f) => ({
      ...f,
      volunteerIds: f.volunteerIds.includes(id) ? f.volunteerIds.filter((x) => x !== id) : [...f.volunteerIds, id],
    }));

  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the shift a name");
    if (!form.start || !form.end) return toast.error("Set the start and end time");
    const start = new Date(form.start);
    const end = new Date(form.end);
    if (end <= start) return toast.error("The shift must end after it starts");
    const payload = {
      name: form.name.trim(),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
      volunteer_ids: form.volunteerIds,
    };
    setSaving(true);
    try {
      const r = form.id
        ? await api.put<VolunteerShift & { warnings: string[] }>(`/volunteers/shifts/${form.id}`, payload)
        : await api.post<VolunteerShift & { warnings: string[] }>("/volunteers/shifts", payload);
      toast.success(form.id ? "Shift updated" : "Shift created");
      for (const w of r.data.warnings ?? []) toast.warning(w, { duration: 8000 });
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save the shift");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: VolunteerShift) => {
    if (!confirm(`Delete the shift "${s.name}"? Its volunteers will be unassigned.`)) return;
    try {
      await api.delete(`/volunteers/shifts/${s.id}`);
      toast.success("Shift deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete the shift");
    }
  };

  return (
    <div className="space-y-4" data-testid="volunteer-shifts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400 font-body">
          {shifts.length} shift{shifts.length === 1 ? "" : "s"} · assigned volunteers see theirs on their My ID Card page.
        </p>
        {canEdit && (
          <Button variant="gold" size="sm" onClick={openNew} data-testid="add-volunteer-shift-btn">
            <Plus className="h-4 w-4" /> New Shift
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-12">
          <Spinner label="Loading shifts…" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState title="No volunteer shifts yet" hint="Create a shift, then tick the volunteers who are on it." />
        </div>
      ) : (
        <div className="space-y-5">
          {byDay.map((day) => (
            <div key={day[0].id} className="space-y-2">
              <h3 className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">{dayLabel(day[0].start_time)}</h3>
              <div className="grid gap-2.5 md:grid-cols-2">
                {day.map((s) => (
                  <div key={s.id} className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2" data-testid={`volunteer-shift-${s.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-heading text-sm font-bold text-white truncate">{s.name}</p>
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400 mt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" /> {timeRange(s.start_time, s.end_time)}
                          </span>
                          {s.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {s.location}
                            </span>
                          )}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => openEdit(s)} className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Edit shift" data-testid={`edit-volunteer-shift-${s.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => remove(s)} className="rounded p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-400" title="Delete shift" data-testid={`delete-volunteer-shift-${s.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {s.notes && <p className="text-xs text-slate-300 font-body">{s.notes}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                      <Users className="h-3.5 w-3.5 text-slate-500" />
                      {s.volunteers.length === 0 ? (
                        <span className="text-[11px] text-amber-300">No volunteers assigned</span>
                      ) : (
                        s.volunteers.map((v) => (
                          <span key={v.id} className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-200">
                            {v.full_name}
                            {v.student_class ? <span className="text-slate-500"> · {v.student_class}</span> : null}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={form.id ? "Edit Volunteer Shift" : "New Volunteer Shift"} testId="volunteer-shift-dialog">
        <div className="space-y-3">
          <div>
            <Label>Shift name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Gate 2 — Morning" data-testid="volunteer-shift-name" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Starts *</Label>
              <Input type="datetime-local" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value, end: f.end || e.target.value }))} data-testid="volunteer-shift-start" />
            </div>
            <div>
              <Label>Ends *</Label>
              <Input type="datetime-local" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} data-testid="volunteer-shift-end" />
            </div>
          </div>
          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Gate 2, Mat 1, Dining Hall" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="What they should do, who to report to…" />
          </div>
          <div>
            <Label>
              Volunteers <span className="text-slate-500 font-normal normal-case tracking-normal">({form.volunteerIds.length} selected)</span>
            </Label>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} placeholder="Search name or class…" className="pl-8" />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-obsidian-950 divide-y divide-white/5">
              {pickable.length === 0 ? (
                <p className="p-3 text-xs text-slate-500">No volunteers match.</p>
              ) : (
                pickable.map((v) => {
                  const on = form.volunteerIds.includes(v.id);
                  return (
                    <label key={v.id} className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs", on ? "bg-gold/10 text-white" : "text-slate-300 hover:bg-white/5")}>
                      <input type="checkbox" checked={on} onChange={() => toggleVolunteer(v.id)} className="rounded border-white/20 text-gold focus:ring-gold" />
                      <span className="flex-1 font-medium">{v.full_name}</span>
                      {v.student_class && <span className="text-[11px] text-slate-500">{v.student_class}</span>}
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} disabled={saving} data-testid="save-volunteer-shift-btn">
              {saving ? "Saving…" : form.id ? "Save Changes" : "Create Shift"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
