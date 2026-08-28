import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2, Circle, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { ImportDialog } from "@/components/admin/ImportDialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess } from "@/lib/permissions";

interface Participant {
  id: number;
  team_id: number;
  full_name: string;
  registration_no?: string;
  role?: string;
  gender?: string;
  age?: number;
  age_group?: string;
  is_present?: boolean;
  notes?: string;
}
interface Team { id: number; name: string }

const PAGE_SIZE = 25;
const empty: Partial<Participant> = { full_name: "", role: "Player", is_present: false };

export default function Participants() {
  const { canEdit } = useModuleAccess("teams");
  const canMarkAttendance = canEdit;
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>("");
  const [presenceFilter, setPresenceFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<Partial<Participant>>(empty);

  const load = () => {
    setLoading(true);
    Promise.all([api.get<Participant[]>("/participants"), api.get<Team[]>("/teams")])
      .then(([p, t]) => { setParticipants(p.data); setTeams(t.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const ageGroups = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => { if (p.age_group) set.add(p.age_group); });
    return Array.from(set).sort((a, b) => {
      const ma = a.match(/(\d+)/), mb = b.match(/(\d+)/);
      const na = ma ? parseInt(ma[1], 10) : 999;
      const nb = mb ? parseInt(mb[1], 10) : 999;
      return na - nb || a.localeCompare(b);
    });
  }, [participants]);

  const teamName = (tid?: number) => teams.find((t) => t.id === tid)?.name || "—";
  const presentCount = participants.filter((p) => p.is_present).length;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return participants.filter((p) => {
      if (teamFilter && String(p.team_id) !== teamFilter) return false;
      if (ageGroupFilter && (p.age_group || "") !== ageGroupFilter) return false;
      if (presenceFilter === "present" && !p.is_present) return false;
      if (presenceFilter === "absent" && p.is_present) return false;
      if (!s) return true;
      return (
        p.full_name.toLowerCase().includes(s) ||
        (p.registration_no && p.registration_no.toLowerCase().includes(s)) ||
        teamName(p.team_id).toLowerCase().includes(s)
      );
    });
  }, [participants, teams, search, teamFilter, ageGroupFilter, presenceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, teamFilter, ageGroupFilter, presenceFilter]);

  const save = async () => {
    if (!form.full_name?.trim()) return toast.error("Full name is required");
    if (!form.team_id) return toast.error("Team is required");
    try {
      const payload = {
        ...form,
        team_id: Number(form.team_id),
        age: form.age ? Number(form.age) : undefined,
      };
      if (form.id) await api.put(`/participants/${form.id}`, payload);
      else await api.post("/participants", payload);
      toast.success(form.id ? "Participant updated" : "Participant created");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save participant");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this participant?")) return;
    await api.delete(`/participants/${id}`);
    toast.success("Participant deleted");
    load();
  };

  const toggleAttendance = async (p: Participant) => {
    const next = !p.is_present;
    setParticipants((rows) => rows.map((r) => (r.id === p.id ? { ...r, is_present: next } : r)));
    try {
      await api.post(`/participants/${p.id}/attendance`, { present: next });
    } catch {
      toast.error("Could not update attendance");
      setParticipants((rows) => rows.map((r) => (r.id === p.id ? { ...r, is_present: p.is_present } : r)));
    }
  };

  const set = (k: keyof Participant, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-participants">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-white">Participants</h1>
          <p className="mt-1 text-sm text-slate-400">
            {participants.length} participants across {teams.length} teams ·{" "}
            <span className="font-semibold text-emerald-400">{presentCount} present</span>
          </p>
        </div>
        {canEdit && <Button onClick={() => { setForm(empty); setOpen(true); }} data-testid="add-participant-btn"><Plus className="h-4 w-4" /> Add Participant</Button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canEdit && <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="import-participants-btn"><Upload className="h-4 w-4" /> Import from spreadsheet</Button>}
        <a href={`${(import.meta.env.REACT_APP_BACKEND_URL ?? "")}/api/export/participants.csv`} className="inline-flex min-w-0 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10" data-testid="export-participants-btn"><Download className="h-4 w-4 shrink-0" /> Export CSV</a>
      </div>

      <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or registration no…"
          className="w-full sm:max-w-xs"
          data-testid="participant-search-input"
        />
        <Select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="w-full sm:w-auto" data-testid="participant-team-filter">
          <option value="">All Teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {ageGroups.length > 0 && (
          <Select value={ageGroupFilter} onChange={(e) => setAgeGroupFilter(e.target.value)} className="w-full sm:w-auto" data-testid="participant-age-group-filter">
            <option value="">All Age Groups</option>
            {ageGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        )}
        <Select value={presenceFilter} onChange={(e) => setPresenceFilter(e.target.value)} className="w-full sm:w-auto" data-testid="participant-presence-filter">
          <option value="">Present + Absent</option>
          <option value="present">Present only</option>
          <option value="absent">Absent only</option>
        </Select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-slate-900">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="p-6"><EmptyState title="No participants found" hint="Try a different search or filter." /></div>
        ) : (
          <>
            {/* MOBILE: participant cards */}
            <div className="grid gap-2 p-2 lg:hidden">
              {paged.map((p, i) => (
                <div key={p.id} data-testid={`participant-card-${p.id}`} className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-obsidian p-3">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold leading-tight text-slate-500">#{(page - 1) * PAGE_SIZE + i + 1}</div>
                      <div className="break-words text-sm font-bold leading-tight text-white">{p.full_name}</div>
                      <div className="truncate text-[11px] text-slate-400">{teamName(p.team_id)}</div>
                    </div>
                    {canMarkAttendance ? (
                      <button onClick={() => toggleAttendance(p)} data-testid={`attendance-toggle-mobile-${p.id}`} className="shrink-0" title={p.is_present ? "Mark absent" : "Mark present"}>
                        {p.is_present ? <Badge tone="green"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Present</Badge> : <Badge tone="neutral"><Circle className="mr-1 h-3.5 w-3.5" /> Absent</Badge>}
                      </button>
                    ) : p.is_present ? <Badge tone="green"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Present</Badge> : <Badge tone="neutral"><Circle className="mr-1 h-3.5 w-3.5" /> Absent</Badge>}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.registration_no && <span className="max-w-full truncate rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">Reg: {p.registration_no}</span>}
                    {p.role && <span className="rounded bg-coral/15 px-1.5 py-0.5 text-[10px] font-bold text-coral">{p.role}</span>}
                    {p.age != null && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">Age {p.age}</span>}
                    {p.gender && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{p.gender}</span>}
                    {p.age_group && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">{p.age_group}</span>}
                  </div>

                  {canEdit && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-white/10 pt-2">
                      <Button variant="outline" size="sm" className="h-8 min-w-0 px-1 text-[11px]" onClick={() => { setForm(p); setOpen(true); }} data-testid={`edit-participant-mobile-${p.id}`}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button variant="danger" size="sm" className="h-8 min-w-0 px-1 text-[11px]" onClick={() => remove(p.id)} data-testid={`delete-participant-mobile-${p.id}`}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* DESKTOP: table */}
            <div className="hidden lg:block">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>#</TH><TH>Name</TH><TH>Reg. No.</TH><TH>Team</TH><TH>Role</TH><TH className="text-right">Age</TH><TH>Age Group</TH><TH>Attendance</TH><TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <tbody>
                {paged.map((p, i) => (
                  <TR key={p.id} data-testid={`participant-row-${p.id}`}>
                    <TD className="text-slate-400">{(page - 1) * PAGE_SIZE + i + 1}</TD>
                    <TD className="font-bold text-white">{p.full_name}</TD>
                    <TD className="text-slate-400">{p.registration_no || "—"}</TD>
                    <TD className="text-slate-300">{teamName(p.team_id)}</TD>
                    <TD className="text-slate-300">{p.role || "—"}</TD>
                    <TD className="text-right text-slate-300">{p.age ?? "—"}</TD>
                    <TD className="text-slate-300">{p.age_group || "—"}</TD>
                    <TD>
                      {canMarkAttendance ? (
                        <button
                          onClick={() => toggleAttendance(p)}
                          data-testid={`attendance-toggle-${p.id}`}
                          className="inline-flex items-center"
                          title={p.is_present ? "Mark absent" : "Mark present"}
                        >
                          {p.is_present ? (
                            <Badge tone="green"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Present</Badge>
                          ) : (
                            <Badge tone="neutral"><Circle className="mr-1 h-3.5 w-3.5" /> Absent</Badge>
                          )}
                        </button>
                      ) : p.is_present ? (
                        <Badge tone="green"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Present</Badge>
                      ) : (
                        <Badge tone="neutral"><Circle className="mr-1 h-3.5 w-3.5" /> Absent</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => { setForm(p); setOpen(true); }} data-testid={`edit-participant-${p.id}`}><Pencil className="h-4 w-4" /></Button>}
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => remove(p.id)} data-testid={`delete-participant-${p.id}`}><Trash2 className="h-4 w-4 text-red-400" /></Button>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            </div>
            <div className="flex flex-col gap-2 border-t border-white/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4" data-testid="participant-pagination">
              <span className="text-xs text-slate-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="participant-page-prev">Previous</Button>
                <span className="text-xs font-semibold text-slate-300">Page {page} of {pageCount}</span>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} data-testid="participant-page-next">Next</Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={form.id ? "Edit Participant" : "Add Participant"} testId="participant-dialog">
        <div className="space-y-4">
          <div>
            <Label>Team *</Label>
            <Select value={form.team_id ?? ""} onChange={(e) => set("team_id", e.target.value)} data-testid="participant-team-select">
              <option value="">Select team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div><Label>Full Name *</Label><Input value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} data-testid="participant-name-input" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label>Role</Label><Input value={form.role ?? ""} onChange={(e) => set("role", e.target.value)} /></div>
            <div><Label>Gender</Label><Input value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)} /></div>
            <div><Label>Age</Label><Input type="number" value={form.age ?? ""} onChange={(e) => set("age", e.target.value)} /></div>
          </div>
          <div><Label>Age Group</Label><Input value={form.age_group ?? ""} onChange={(e) => set("age_group", e.target.value)} placeholder="e.g. Under 14" /></div>
          <div><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-participant-btn">Save</Button>
          </div>
        </div>
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="participants" onDone={load} />
    </div>
  );
}
