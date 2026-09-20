import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, toDateTimeLocal } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";

interface Team {
  id: number;
  name: string;
}
interface Venue {
  id: number;
  name: string;
}
interface Event {
  id: number;
  title: string;
  team_id?: number | null;
  team_name?: string;
  venue_id?: number | null;
  venue_name?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
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
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.get<Event[]>("/schedule"), api.get<Team[]>("/teams"), api.get<Venue[]>("/venues")])
      .then(([e, t, v]) => {
        setEvents(e.data);
        setTeams(t.data);
        setVenues(v.data);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    // datetime-local gives a zone-less "YYYY-MM-DDTHH:mm" meant in the
    // organizer's local time; sending it as-is makes the server read it as UTC
    // and shifts every time by the zone offset. toISOString() pins the instant.
    const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
    if (form.start_time && form.end_time && new Date(form.end_time) <= new Date(form.start_time)) {
      return toast.error("End time must be after the start time");
    }
    const payload = {
      title: form.title.trim(),
      team_id: form.team_id ? Number(form.team_id) : null,
      venue_id: form.venue_id ? Number(form.venue_id) : null,
      start_time: toIso(form.start_time),
      end_time: toIso(form.end_time),
      description: form.description.trim() || null,
    };
    try {
      if (editingId) await api.put(`/schedule/${editingId}`, payload);
      else await api.post("/schedule", payload);
      toast.success(editingId ? "Event updated" : "Event added");
      setForm(empty);
      setEditingId(null);
      setOpen(false);
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Could not save event");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this event?")) return;
    await api.delete(`/schedule/${id}`);
    toast.success("Deleted");
    load();
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditingId(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (e: Event) => {
    setEditingId(e.id);
    setForm({
      title: e.title,
      team_id: e.team_id ? String(e.team_id) : "",
      venue_id: e.venue_id ? String(e.venue_id) : "",
      start_time: toDateTimeLocal(e.start_time),
      end_time: toDateTimeLocal(e.end_time),
      description: e.description ?? "",
    });
    setOpen(true);
  };

  return (
    <div data-testid="admin-schedule" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            CEREMONIES & TOURNAMENT CALENDAR
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Schedule & Events Master
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Fixtures, meetings, and ceremonies. Team-linked events automatically sync to team portals.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={openAdd}
            data-testid="add-event-btn"
            className="text-xs font-extrabold"
          >
            <Plus className="h-4 w-4" /> Add Event
          </Button>
        )}
      </div>

      {/* SCHEDULE TABLE */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
            <Spinner label="Loading tournament events…" />
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState title="No scheduled events yet" hint="Add fixtures, weigh-ins, or ceremonies." />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {events.map((e, i) => (
                <div
                  key={e.id}
                  data-testid={`event-card-${e.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                      <h3 className="font-heading font-bold text-white text-base">{e.title}</h3>
                      <p className="text-xs text-slate-400 font-body flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3.5 w-3.5 text-gold" /> {e.venue_name || "No venue assigned"}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openEdit(e)}
                          data-testid={`edit-event-card-${e.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="danger" size="sm" className="h-7 text-xs" onClick={() => remove(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2 text-[11px]">
                    {e.team_name ? (
                      <Badge tone="gold" size="sm">
                        {e.team_name}
                      </Badge>
                    ) : (
                      <span className="rounded bg-white/5 px-2 py-0.5 font-bold text-slate-300">
                        All Delegations
                      </span>
                    )}
                    <span className="text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      {e.start_time ? formatDateTime(e.start_time) : "No start time"}
                      {e.end_time ? ` – ${formatDateTime(e.end_time)}` : ""}
                    </span>
                  </div>

                  {e.description && (
                    <p className="text-xs text-slate-400 font-body line-clamp-2">{e.description}</p>
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
                    <TH>Event Title & Details</TH>
                    <TH>Target Delegation</TH>
                    <TH>Venue / Court</TH>
                    <TH>Start Time</TH>
                    <TH>End Time</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {events.map((e, i) => (
                    <TR key={e.id} data-testid={`event-row-${e.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                      <TD>
                        <div>
                          <p className="font-heading font-bold text-white text-sm">{e.title}</p>
                          {e.description && (
                            <p className="text-xs text-slate-400 font-body line-clamp-1">{e.description}</p>
                          )}
                        </div>
                      </TD>
                      <TD>
                        {e.team_name ? (
                          <Badge tone="gold" size="sm">
                            {e.team_name}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-xs">All Delegations</span>
                        )}
                      </TD>
                      <TD className="text-slate-300 font-body text-xs">{e.venue_name || "—"}</TD>
                      <TD className="text-slate-300 font-mono text-xs">
                        {e.start_time ? formatDateTime(e.start_time) : "—"}
                      </TD>
                      <TD className="text-slate-300 font-mono text-xs">
                        {e.end_time ? formatDateTime(e.end_time) : "—"}
                      </TD>
                      <TD className="text-right">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEdit(e)}
                              data-testid={`edit-event-${e.id}`}
                              title="Edit Event"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => remove(e.id)}
                              data-testid={`delete-event-${e.id}`}
                              title="Delete Event"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* ADD EVENT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit Event" : "Schedule Event / Match Ceremony"}
        testId="event-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Event Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Captains Technical Briefing"
              data-testid="event-title-input"
            />
          </div>
          <div>
            <Label>Target Team (Optional)</Label>
            <Select
              value={form.team_id}
              onChange={(e) => set("team_id", e.target.value)}
              data-testid="event-team-select"
            >
              <option value="">All teams / General public</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Venue / Court (Optional)</Label>
            <Select
              value={form.venue_id}
              onChange={(e) => set("venue_id", e.target.value)}
              data-testid="event-venue-select"
            >
              <option value="">No specific venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Starts</Label>
              <Input
                type="datetime-local"
                value={form.start_time}
                onChange={(e) => set("start_time", e.target.value)}
              />
            </div>
            <div>
              <Label>Ends</Label>
              <Input
                type="datetime-local"
                value={form.end_time}
                onChange={(e) => set("end_time", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Description / Instructions</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Event agenda, requirements, dress code..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-event-btn">
              {editingId ? "Update Event" : "Save Event"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
