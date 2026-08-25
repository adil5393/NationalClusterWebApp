import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Upload, Download, CheckCircle2, Circle } from "lucide-react";
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

interface Team { id: number; name: string }
interface Participant {
  id: number; team_id: number; full_name: string; registration_no?: string | null;
  gender?: string; age?: number; age_group?: string; role?: string; notes?: string;
  is_present?: boolean; checked_in_at?: string | null;
}

const empty: Partial<Participant> = { full_name: "", role: "", gender: "", team_id: undefined };
const PAGE_SIZE = 25;

export default function Participants() {
  const { canEdit } = useModuleAccess("teams");
  const { canEdit: canMarkAttendance } = useModuleAccess("attendance");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [ageGroupFilter, setAgeGroupFilter] = useState("");
  const [presenceFilter, setPresenceFilter] = useState("");
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

  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? "—";

  const ageGroupRank = (g: string) => {
    const m = g.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 999;
  };
  const ageGroups = useMemo(() => {
    const set = new Set(participants.map((p) => p.age_group).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b));
  }, [participants]);

  const presentCount = useMemo(() => participants.filter((p) => p.is_present).length, [participants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants
      .filter((p) => (teamFilter ? p.team_id === Number(teamFilter) : true))
      .filter((p) => (ageGroupFilter ? p.age_group === ageGroupFilter : true))
      .filter((p) => (presenceFilter === "present" ? p.is_present : presenceFilter === "absent" ? !p.is_present : true))
      .filter((p) => (q ? p.full_name.toLowerCase().includes(q) || (p.registration_no ?? "").toLowerCase().includes(q) : true));
  }, [participants, teamFilter, ageGroupFilter, presenceFilter, search]);

  useEffect(() => { setPage(1); }, [search, teamFilter, ageGroupFilter, presenceFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const save = async () => {
    if (!form.full_name?.trim()) return toast.error("Name is required");
    if (!form.team_id) return toast.error("Select a team");
    const payload = { ...form, age: form.age ? Number(form.age) : null, team_id: Number(form.team_id) };
    try {
      if (form.id) await api.put(`/participants/${form.id}`, payload);
      else await api.post("/participants", payload);
      toast.success(form.id ? "Participant updated" : "Participant added");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save participant");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this participant?")) return;
    await api.delete(`/participants/${id}`);
    toast.success("Deleted");
    load();
  };

  const toggleAttendance = async (p: Participant) => {
    const next = !p.is_present;
    setParticipants((rows) => rows.map((r) => (r.id === p.id ? { ...r, is_present: next } : r))); // optimistic
    try {
      await api.post(`/participants/${p.id}/attendance`, { present: next });
    } catch {
      toast.error("Could not update attendance");
      setParticipants((rows) => rows.map((r) => (r.id === p.id ? { ...r, is_present: p.is_present } : r))); // revert
    }
  };

  const set = (k: keyof Participant, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-participants">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Participants</h1>
          <p className="mt-1 text-sm text-slate-500">
            {participants.length} participants across {teams.length} teams ·{" "}
            <span className="font-semibold text-emerald-600">{presentCount} present</span>
          </p>
        </div>
        {canEdit && <Button onClick={() => { setForm(empty); setOpen(true); }} data-testid="add-participant-btn"><Plus className="h-4 w-4" /> Add Participant</Button>}
      </div>
      <div className="mt-3 flex gap-2">
        {canEdit && <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="import-participants-btn"><Upload className="h-4 w-4" /> Import from spreadsheet</Button>}
        <a href={`${(import.meta.env.REACT_APP_BACKEND_URL ?? "")}/api/export/participants.csv`} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" data-testid="export-participants-btn"><Download className="h-4 w-4" /> Export CSV</a>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or registration no…"
          className="w-full max-w-xs"
          data-testid="participant-search-input"
        />
        <Select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="w-auto" data-testid="participant-team-filter">
          <option value="">All Teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {ageGroups.length > 0 && (
          <Select value={ageGroupFilter} onChange={(e) => setAgeGroupFilter(e.target.value)} className="w-auto" data-testid="participant-age-group-filter">
            <option value="">All Age Groups</option>
            {ageGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        )}
        <Select value={presenceFilter} onChange={(e) => setPresenceFilter(e.target.value)} className="w-auto" data-testid="participant-presence-filter">
          <option value="">Present + Absent</option>
          <option value="present">Present only</option>
          <option value="absent">Absent only</option>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="p-6"><EmptyState title="No participants found" hint="Try a different search or filter." /></div>
        ) : (
          <>
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
                    <TD className="font-bold text-slate-900">{p.full_name}</TD>
                    <TD className="text-slate-500">{p.registration_no || "—"}</TD>
                    <TD className="text-slate-600">{teamName(p.team_id)}</TD>
                    <TD>{p.role || "—"}</TD>
                    <TD className="text-right">{p.age ?? "—"}</TD>
                    <TD className="text-slate-600">{p.age_group || "—"}</TD>
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
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => remove(p.id)} data-testid={`delete-participant-${p.id}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3" data-testid="participant-pagination">
              <span className="text-xs text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="participant-page-prev">Previous</Button>
                <span className="text-xs font-semibold text-slate-600">Page {page} of {pageCount}</span>
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
          <div className="grid grid-cols-3 gap-4">
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
