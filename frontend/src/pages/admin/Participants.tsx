import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2, Circle, Upload, Download, Users, Search, Filter, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { api, BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
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

interface Team {
  id: number;
  name: string;
}

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
      .then(([p, t]) => {
        setParticipants(p.data);
        setTeams(t.data);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const ageGroups = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => {
      if (p.age_group) set.add(p.age_group);
    });
    return Array.from(set).sort((a, b) => {
      const ma = a.match(/(\d+)/);
      const mb = b.match(/(\d+)/);
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

  useEffect(() => {
    setPage(1);
  }, [search, teamFilter, ageGroupFilter, presenceFilter]);

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
    <div data-testid="admin-participants" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            ATHLETE ACCREDITATION & ROSTERS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Participants & Attendance
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            {participants.length} registered athletes across {teams.length} delegations ·{" "}
            <span className="font-bold text-emerald-400 font-mono">{presentCount} Verified Present</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              data-testid="import-participants-btn"
              className="text-xs font-semibold"
            >
              <Upload className="h-3.5 w-3.5 text-gold" /> Import Excel/CSV
            </Button>
          )}
          <a
            href={`${BASE_URL}/api/export/participants.csv`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
            data-testid="export-participants-btn"
          >
            <Download className="h-3.5 w-3.5 text-slate-400" /> Export CSV
          </a>
          <a
            href={`${BASE_URL}/api/export/participants.xlsx`}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            data-testid="export-participants-xlsx-btn"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" /> Export XLSX
          </a>
          {canEdit && (
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setForm(empty);
                setOpen(true);
              }}
              data-testid="add-participant-btn"
              className="text-xs font-extrabold"
            >
              <Plus className="h-4 w-4" /> Add Participant
            </Button>
          )}
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="grid gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3 rounded-xl border border-white/10 bg-obsidian-900 p-3 shadow-sm">
        <div className="w-full sm:w-72">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, reg no, team…"
            className="h-9 text-xs"
            data-testid="participant-search-input"
          />
        </div>

        <div className="w-full sm:w-48">
          <Select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="h-9 text-xs"
            data-testid="participant-team-filter"
          >
            <option value="">All Teams ({teams.length})</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>

        {ageGroups.length > 0 && (
          <div className="w-full sm:w-40">
            <Select
              value={ageGroupFilter}
              onChange={(e) => setAgeGroupFilter(e.target.value)}
              className="h-9 text-xs"
              data-testid="participant-age-group-filter"
            >
              <option value="">All Age Groups</option>
              {ageGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="w-full sm:w-40">
          <Select
            value={presenceFilter}
            onChange={(e) => setPresenceFilter(e.target.value)}
            className="h-9 text-xs"
            data-testid="participant-presence-filter"
          >
            <option value="">All Attendance</option>
            <option value="present">Present Only ({presentCount})</option>
            <option value="absent">Absent Only ({participants.length - presentCount})</option>
          </Select>
        </div>

        <div className="ml-auto text-xs text-slate-400 font-mono hidden xl:block">
          {filtered.length} Matches
        </div>
      </div>

      {/* PARTICIPANTS CONTENT */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 py-16">
            <Spinner label="Loading participant rosters…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 p-6">
            <EmptyState
              title="No participants found"
              hint="Try clearing filters or searching another athlete name."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {paged.map((p, i) => (
                <div
                  key={p.id}
                  data-testid={`participant-card-${p.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">
                        #{(page - 1) * PAGE_SIZE + i + 1}
                      </span>
                      <h3 className="font-heading font-bold text-white text-sm">{p.full_name}</h3>
                      <p className="text-xs text-gold font-body">{teamName(p.team_id)}</p>
                    </div>

                    {canMarkAttendance ? (
                      <button
                        onClick={() => toggleAttendance(p)}
                        data-testid={`attendance-toggle-mobile-${p.id}`}
                        title={p.is_present ? "Mark absent" : "Mark present"}
                        className="shrink-0"
                      >
                        {p.is_present ? (
                          <Badge tone="live" size="sm">
                            <CheckCircle2 className="h-3 w-3" /> Present
                          </Badge>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            <Circle className="h-3 w-3" /> Absent
                          </Badge>
                        )}
                      </button>
                    ) : p.is_present ? (
                      <Badge tone="live" size="sm">
                        <CheckCircle2 className="h-3 w-3" /> Present
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        <Circle className="h-3 w-3" /> Absent
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 text-[11px] pt-1">
                    {p.registration_no && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-slate-300">
                        Reg: {p.registration_no}
                      </span>
                    )}
                    {p.role && (
                      <span className="rounded bg-gold/15 px-1.5 py-0.5 font-bold text-gold">
                        {p.role}
                      </span>
                    )}
                    {p.age != null && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300 font-mono">
                        Age {p.age}
                      </span>
                    )}
                    {p.gender && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">
                        {p.gender}
                      </span>
                    )}
                    {p.age_group && (
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-bold text-blue-300">
                        {p.age_group}
                      </span>
                    )}
                  </div>

                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setForm(p);
                          setOpen(true);
                        }}
                        data-testid={`edit-participant-mobile-${p.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => remove(p.id)}
                        data-testid={`delete-participant-mobile-${p.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* DESKTOP: PROFESSIONAL OPERATIONS TABLE */}
            <div className="hidden lg:block">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12">#</TH>
                    <TH>Athlete Name</TH>
                    <TH>Reg. Number</TH>
                    <TH>Team / School</TH>
                    <TH>Role</TH>
                    <TH className="text-right">Age</TH>
                    <TH>Age Group</TH>
                    <TH>Attendance Verification</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {paged.map((p, i) => (
                    <TR key={p.id} data-testid={`participant-row-${p.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">
                        {(page - 1) * PAGE_SIZE + i + 1}
                      </TD>
                      <TD className="font-bold text-white text-sm">{p.full_name}</TD>
                      <TD className="font-mono text-xs text-slate-400">
                        {p.registration_no || "—"}
                      </TD>
                      <TD className="text-slate-300 font-body text-xs">{teamName(p.team_id)}</TD>
                      <TD>
                        <span className="rounded bg-white/5 px-2 py-0.5 text-xs font-bold text-slate-300">
                          {p.role || "Player"}
                        </span>
                      </TD>
                      <TD className="text-right font-mono text-xs text-slate-300">
                        {p.age ?? "—"}
                      </TD>
                      <TD>
                        {p.age_group ? (
                          <span className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-300">
                            {p.age_group}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </TD>
                      <TD>
                        {canMarkAttendance ? (
                          <button
                            onClick={() => toggleAttendance(p)}
                            data-testid={`attendance-toggle-${p.id}`}
                            className="inline-flex items-center hover:opacity-80 transition-opacity"
                            title={p.is_present ? "Click to mark absent" : "Click to mark present"}
                          >
                            {p.is_present ? (
                              <Badge tone="live" size="sm">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Present
                              </Badge>
                            ) : (
                              <Badge tone="neutral" size="sm">
                                <Circle className="h-3.5 w-3.5 text-slate-500" /> Absent
                              </Badge>
                            )}
                          </button>
                        ) : p.is_present ? (
                          <Badge tone="live" size="sm">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Present
                          </Badge>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            <Circle className="h-3.5 w-3.5 text-slate-500" /> Absent
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setForm(p);
                                setOpen(true);
                              }}
                              data-testid={`edit-participant-${p.id}`}
                              title="Edit Athlete Record"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => remove(p.id)}
                              data-testid={`delete-participant-${p.id}`}
                              title="Delete Athlete Record"
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

            {/* PAGINATION BAR */}
            <div
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-obsidian-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between shadow-sm"
              data-testid="participant-pagination"
            >
              <span className="text-xs text-slate-400 font-body">
                Showing <strong className="text-white">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</strong> of{" "}
                <strong className="text-white">{filtered.length}</strong> participants
              </span>
              <div className="flex items-center justify-between gap-2 sm:justify-start">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  data-testid="participant-page-prev"
                  className="text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs font-mono font-bold text-gold px-2">
                  Page {page} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="participant-page-next"
                  className="text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ADD / EDIT PARTICIPANT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Edit Participant Details" : "Register New Participant"}
        testId="participant-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Team Delegation *</Label>
            <Select
              value={form.team_id ?? ""}
              onChange={(e) => set("team_id", e.target.value)}
              data-testid="participant-team-select"
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Full Name *</Label>
            <Input
              value={form.full_name ?? ""}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="e.g. Rahul Sharma"
              data-testid="participant-name-input"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Role</Label>
              <Input
                value={form.role ?? ""}
                onChange={(e) => set("role", e.target.value)}
                placeholder="Player / Captain / Coach"
              />
            </div>
            <div>
              <Label>Gender</Label>
              <Input
                value={form.gender ?? ""}
                onChange={(e) => set("gender", e.target.value)}
                placeholder="M / F"
              />
            </div>
            <div>
              <Label>Age</Label>
              <Input
                type="number"
                value={form.age ?? ""}
                onChange={(e) => set("age", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Age Group</Label>
              <Input
                value={form.age_group ?? ""}
                onChange={(e) => set("age_group", e.target.value)}
                placeholder="e.g. Under 19"
              />
            </div>
            <div>
              <Label>CBSE Registration No.</Label>
              <Input
                value={form.registration_no ?? ""}
                onChange={(e) => set("registration_no", e.target.value)}
                placeholder="CBSE-2026-XXXX"
              />
            </div>
          </div>
          <div>
            <Label>Medical / Operational Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any relevant medical history or team notes..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-participant-btn">
              {form.id ? "Update Athlete" : "Save Athlete"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="participants" onDone={load} />
    </div>
  );
}
