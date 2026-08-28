import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";

interface Team { id: number; name: string }
interface Venue { id: number; name: string }
interface Event {
  id: number; title: string; team_id?: number; team_name?: string; venue_name?: string;
  start_time?: string; end_time?: string; description?: string;
}

const empty = { title: "", team_id: "", venue_id: "", start_time: "", end_time: "", description: "" };

export default function Schedule() {
  const { canEdit } = useModuleAccess("schedule");
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(empty);

  const load = () => {
    setLoading(true);
    Promise.all([api.get<Event[]>("/schedule"), api.get<Team[]>("/teams"), api.get<Venue[]>("/venues")])
      .then(([e, t, v]) => { setEvents(e.data); setTeams(t.data); setVenues(v.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    try {
      await api.post("/schedule", {
        title: form.title,
        team_id: form.team_id ? Number(form.team_id) : null,
        venue_id: form.venue_id ? Number(form.venue_id) : null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        description: form.description || null,
      });
      toast.success("Event added");
      setForm(empty);
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save event");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this event?")) return;
    await api.delete(`/schedule/${id}`);
    toast.success("Deleted");
    load();
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-schedule">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-white">Schedule</h1>
          <p className="mt-1 text-sm text-slate-400">Fixtures &amp; ceremonies. Team-linked events appear on that team's portal.</p>
        </div>
        {canEdit && <Button onClick={() => { setForm(empty); setOpen(true); }} data-testid="add-event-btn"><Plus className="h-4 w-4" /> Add Event</Button>}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
        {loading ? (
          <Spinner />
        ) : events.length === 0 ? (
          <div className="p-6"><EmptyState title="No events yet" hint="Add fixtures and ceremonies." /></div>
        ) : (<>
          <div className="grid gap-2 p-2 lg:hidden">{events.map((e, i) => <div key={e.id} data-testid={`event-card-${e.id}`} className="w-full min-w-0 rounded-lg border border-slate-800 bg-obsidian p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[10px] font-semibold text-slate-500">#{i + 1}</div><div className="break-words text-sm font-bold text-white">{e.title}</div><div className="truncate text-[11px] text-slate-400">{e.venue_name || "No venue"}</div></div>{canEdit && <Button variant="danger" size="sm" className="h-8 shrink-0 px-2 text-[11px]" onClick={() => remove(e.id)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>}</div><div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2 text-[10px]">{e.team_name ? <Badge tone="coral">{e.team_name}</Badge> : <span className="rounded bg-white/5 px-1.5 py-0.5 font-bold text-slate-300">All teams</span>}<span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">{e.start_time ? formatDate(e.start_time) : "No start time"}</span></div>{e.description && <p className="mt-2 line-clamp-2 text-[11px] text-slate-400">{e.description}</p>}</div>)}</div>
          <div className="hidden lg:block"><Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>#</TH><TH>Event</TH><TH>Team</TH><TH>Venue</TH><TH>Starts</TH><TH>Ends</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {events.map((e, i) => (
                <TR key={e.id} data-testid={`event-row-${e.id}`}>
                  <TD className="text-slate-400">{i + 1}</TD>
                  <TD className="font-bold text-white">{e.title}{e.description && <div className="text-xs font-normal text-slate-400">{e.description}</div>}</TD>
                  <TD>{e.team_name ? <Badge tone="coral">{e.team_name}</Badge> : <span className="text-slate-400">All teams</span>}</TD>
                  <TD className="text-slate-300">{e.venue_name || "—"}</TD>
                  <TD className="text-slate-300">{e.start_time ? formatDate(e.start_time) : "—"}</TD>
                  <TD className="text-slate-300">{e.end_time ? formatDate(e.end_time) : "—"}</TD>
                  <TD><div className="flex justify-end">{canEdit && <Button variant="ghost" size="icon" onClick={() => remove(e.id)} data-testid={`delete-event-${e.id}`}><Trash2 className="h-4 w-4 text-red-400" /></Button>}</div></TD>
                </TR>
              ))}
            </tbody>
          </Table></div>
        </>)}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Add Event" testId="event-dialog">
        <div className="space-y-4">
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="event-title-input" /></div>
          <div>
            <Label>Team (optional)</Label>
            <Select value={form.team_id} onChange={(e) => set("team_id", e.target.value)} data-testid="event-team-select">
              <option value="">All teams / general</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Venue (optional)</Label>
            <Select value={form.venue_id} onChange={(e) => set("venue_id", e.target.value)} data-testid="event-venue-select">
              <option value="">No venue</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Starts</Label><Input type="datetime-local" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} /></div>
            <div><Label>Ends</Label><Input type="datetime-local" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} /></div>
          </div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-event-btn">Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
