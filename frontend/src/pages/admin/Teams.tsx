import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, QrCode, Upload, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { QRDialog } from "@/components/admin/QRDialog";
import { ImportDialog } from "@/components/admin/ImportDialog";
import { AttendanceImportDialog } from "@/components/admin/AttendanceImportDialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Team {
  id: number;
  name: string;
  school?: string;
  region?: string;
  country?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  member_count?: number;
  notes?: string;
  participant_count?: number;
  accommodation_status?: "none" | "partial" | "full";
  accommodation_locations?: { room?: string | null; building?: string | null; whole_team: boolean; count: number }[];
  age_group_counts?: Record<string, number>;
  last_year_winner?: boolean;
  last_year_runner?: boolean;
}

type LastYearField = "last_year_winner" | "last_year_runner";

const MIN_SQUAD_SIZE = 12;

function ageGroupRank(g: string) {
  const m = g.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function AgeGroupCountsCell({ counts }: { counts?: Record<string, number> }) {
  const entries = Object.entries(counts ?? {}).sort(([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b));
  if (entries.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="space-y-0.5">
      {entries.map(([group, count]) => (
        <div key={group} className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-400">{group}</span>
          <span className={`tabular-nums font-bold ${count < MIN_SQUAD_SIZE ? "text-red-400" : "text-emerald-400"}`}>{count}</span>
        </div>
      ))}
    </div>
  );
}

const LAST_YEAR_FIELD_LABEL: Record<LastYearField, string> = {
  last_year_winner: "last year's winner",
  last_year_runner: "last year's runner-up",
};

function LastYearAwardCell({
  team, field, canEdit, onToggle,
}: {
  team: Team;
  field: LastYearField;
  canEdit: boolean;
  onToggle: (team: Team, field: LastYearField) => void;
}) {
  const isSet = !!team[field];
  const badge = isSet ? (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ring-1 bg-amber-500/15 text-amber-400 ring-amber-500/30">
      <Trophy className="h-3.5 w-3.5 shrink-0" /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ring-1 bg-white/5 text-slate-400 ring-white/10">
      <X className="h-3.5 w-3.5 shrink-0" /> No
    </span>
  );
  if (!canEdit) return badge;
  const label = LAST_YEAR_FIELD_LABEL[field];
  return (
    <button
      onClick={() => onToggle(team, field)}
      data-testid={`${field === "last_year_winner" ? "last-year-winner" : "last-year-runner"}-toggle-${team.id}`}
      className="inline-flex items-center"
      title={isSet ? `Mark as not ${label}` : `Mark as ${label}`}
    >
      {badge}
    </button>
  );
}

const ACCOMMODATION_LABEL: Record<string, string> = { none: "Not Set Up", partial: "Partial", full: "Set Up" };
const ACCOMMODATION_TONE: Record<string, "neutral" | "amber" | "green"> = { none: "neutral", partial: "amber", full: "green" };

function AccommodationCell({ t }: { t: Team }) {
  const status = t.accommodation_status ?? "none";
  const locations = t.accommodation_locations ?? [];
  return (
    <div>
      <Badge tone={ACCOMMODATION_TONE[status]}>{ACCOMMODATION_LABEL[status]}</Badge>
      {locations.length > 0 && (
        <div className="mt-1 space-y-0.5 text-xs text-slate-400">
          {locations.map((loc, i) => (
            <div key={i} className="truncate" title={`${loc.room ?? "Unknown room"} · ${loc.building ?? "Unknown building"}`}>
              {loc.room ?? "Unknown room"}
              {loc.building && <span className="text-slate-500"> · {loc.building}</span>}
              {!loc.whole_team && <span className="text-slate-500"> ({loc.count})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const empty: Partial<Team> = { name: "", school: "", region: "", country: "India", member_count: 0 };

export default function AdminTeams() {
  const { canEdit } = useModuleAccess("teams");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [qrTeam, setQrTeam] = useState<{ id: number; name: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [attendanceImportOpen, setAttendanceImportOpen] = useState(false);
  const [form, setForm] = useState<Partial<Team>>(empty);

  const load = () => {
    setLoading(true);
    api.get<Team[]>("/teams").then((r) => setTeams(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Team name is required");
    try {
      const payload = { ...form, member_count: Number(form.member_count) || 0 };
      if (form.id) await api.put(`/teams/${form.id}`, payload);
      else await api.post("/teams", payload);
      toast.success(form.id ? "Team updated" : "Team created");
      setOpen(false);
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : e?.message;
      toast.error(msg ? `Could not save team: ${msg}` : "Could not save team");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this team?")) return;
    await api.delete(`/teams/${id}`);
    toast.success("Team deleted");
    load();
  };

  const toggleLastYearAward = async (t: Team, field: LastYearField) => {
    const next = !t[field];
    try {
      await api.put(`/teams/${t.id}`, { [field]: next });
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : e?.message;
      toast.error(msg || `Could not update ${LAST_YEAR_FIELD_LABEL[field]} status`);
    }
  };

  const emptyTeamCount = teams.filter((t) => (t.participant_count ?? 0) === 0).length;

  const removeEmptyTeams = async () => {
    if (emptyTeamCount === 0) return toast.error("No teams with 0 players");
    if (!confirm(`Delete ${emptyTeamCount} team(s) with 0 players? This cannot be undone.`)) return;
    const r = await api.delete("/teams/empty");
    toast.success(`Deleted ${r.data.deleted} team(s) with 0 players`);
    load();
  };

  const set = (k: keyof Team, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-teams">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-white">Teams</h1>
          <p className="mt-1 text-sm text-slate-400">{teams.length} teams registered</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAttendanceImportOpen(true)} data-testid="import-attendance-list-btn"><Upload className="h-4 w-4" /> Import Attendance List</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="import-teams-btn"><Upload className="h-4 w-4" /> Import</Button>
            {emptyTeamCount > 0 && (
              <Button variant="outline" onClick={removeEmptyTeams} data-testid="delete-empty-teams-btn">
                <Trash2 className="h-4 w-4 text-red-400" /> Delete {emptyTeamCount} Team{emptyTeamCount === 1 ? "" : "s"} with 0 Players
              </Button>
            )}
            <Button onClick={() => { setForm(empty); setOpen(true); }} data-testid="add-team-btn">
              <Plus className="h-4 w-4" /> Add Team
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="rounded-lg border border-white/10 bg-slate-900"><Spinner /></div>
        ) : teams.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-slate-900 p-6"><EmptyState title="No teams yet" hint="Add your first team to get started." /></div>
        ) : (
          <>
            {/* MOBILE: card list */}
            <div className="grid gap-2 lg:hidden">
              {teams.map((t, i) => {
                const ageEntries = Object.entries(t.age_group_counts ?? {}).sort(
                  ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
                );
                const accStatus = t.accommodation_status ?? "none";
                return (
                  <div key={t.id} data-testid={`team-card-${t.id}`} className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold leading-tight text-slate-500">#{i + 1}</div>
                        <div className="break-words text-sm font-bold leading-tight text-white">{t.name}</div>
                        {t.school && <div className="truncate text-[11px] leading-tight text-slate-400">{t.school}</div>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold leading-tight text-slate-400">Winner</span>
                          <LastYearAwardCell team={t} field="last_year_winner" canEdit={canEdit} onToggle={toggleLastYearAward} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold leading-tight text-slate-400">Runner</span>
                          <LastYearAwardCell team={t} field="last_year_runner" canEdit={canEdit} onToggle={toggleLastYearAward} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        t.country === "India" ? "bg-coral/15 text-coral" : "bg-blue-500/15 text-blue-300",
                      )}>{t.country}</span>
                      {t.region && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{t.region}</span>}
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{t.member_count ?? 0} members</span>
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        accStatus === "full" ? "bg-emerald-500/15 text-emerald-400" : accStatus === "partial" ? "bg-amber-500/15 text-amber-400" : "bg-white/5 text-slate-300",
                      )}>{ACCOMMODATION_LABEL[accStatus]}</span>
                    </div>

                    {ageEntries.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ageEntries.map(([group, count]) => (
                          <span key={group} className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                            count < MIN_SQUAD_SIZE ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400",
                          )}>{group}: {count}</span>
                        ))}
                      </div>
                    )}

                    {t.contact_name && (
                      <div className="mt-1.5 truncate text-[11px] text-slate-400">Contact: <span className="font-semibold text-slate-300">{t.contact_name}</span></div>
                    )}

                    <div className={cn("mt-2 grid gap-1.5 border-t border-white/10 pt-2", canEdit ? "grid-cols-3" : "grid-cols-1")}>
                      <Button variant="outline" size="sm" className="h-8 min-w-0 px-1 text-[11px]" onClick={() => setQrTeam({ id: t.id, name: t.name })} data-testid={`qr-team-mobile-${t.id}`}>
                        <QrCode className="h-3.5 w-3.5" /> QR
                      </Button>
                      {canEdit && (
                        <Button variant="outline" size="sm" className="h-8 min-w-0 px-1 text-[11px]" onClick={() => { setForm(t); setOpen(true); }} data-testid={`edit-team-mobile-${t.id}`}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="danger" size="sm" className="h-8 min-w-0 px-1 text-[11px]" onClick={() => remove(t.id)} data-testid={`delete-team-mobile-${t.id}`}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP: table */}
            <div className="hidden overflow-hidden rounded-lg border border-slate-800 bg-slate-900 lg:block">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>#</TH>
                    <TH>Team</TH>
                    <TH>Last Year Winner</TH>
                    <TH>Last Year Runner-up</TH>
                    <TH>Region</TH>
                    <TH>Country</TH>
                    <TH className="text-right">Members</TH>
                    <TH>Members by Age Group</TH>
                    <TH>Accommodation</TH>
                    <TH>Contact</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <tbody>
                  {teams.map((t, i) => (
                    <TR key={t.id} data-testid={`team-row-${t.id}`}>
                      <TD className="text-slate-400">{i + 1}</TD>
                      <TD className="font-bold text-white">{t.name}<div className="text-xs font-normal text-slate-400">{t.school}</div></TD>
                      <TD><LastYearAwardCell team={t} field="last_year_winner" canEdit={canEdit} onToggle={toggleLastYearAward} /></TD>
                      <TD><LastYearAwardCell team={t} field="last_year_runner" canEdit={canEdit} onToggle={toggleLastYearAward} /></TD>
                      <TD className="text-slate-300">{t.region || "—"}</TD>
                      <TD><Badge tone={t.country === "India" ? "coral" : "blue"}>{t.country}</Badge></TD>
                      <TD className="text-right font-semibold text-white">{t.member_count ?? 0}</TD>
                      <TD><AgeGroupCountsCell counts={t.age_group_counts} /></TD>
                      <TD><AccommodationCell t={t} /></TD>
                      <TD className="text-slate-300">{t.contact_name || "—"}</TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setQrTeam({ id: t.id, name: t.name })} data-testid={`qr-team-${t.id}`}>
                            <QrCode className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => { setForm(t); setOpen(true); }} data-testid={`edit-team-${t.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => remove(t.id)} data-testid={`delete-team-${t.id}`}>
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={form.id ? "Edit Team" : "Add Team"} testId="team-dialog">
        <div className="space-y-4">
          <div><Label>Team Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} data-testid="team-name-input" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>School</Label><Input value={form.school ?? ""} onChange={(e) => set("school", e.target.value)} /></div>
            <div><Label>Region / State</Label><Input value={form.region ?? ""} onChange={(e) => set("region", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Country</Label><Input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} /></div>
            <div><Label>Members</Label><Input type="number" value={form.member_count ?? 0} onChange={(e) => set("member_count", e.target.value)} data-testid="team-members-input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Contact Name</Label><Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></div>
            <div><Label>Contact Phone</Label><Input value={form.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-team-btn">Save Team</Button>
          </div>
        </div>
      </Dialog>

      <QRDialog
        open={qrTeam !== null}
        onClose={() => setQrTeam(null)}
        url={qrTeam ? `${window.location.origin}/teams/${qrTeam.id}` : ""}
        title={qrTeam?.name ?? ""}
      />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="teams" onDone={load} />
      <AttendanceImportDialog open={attendanceImportOpen} onClose={() => setAttendanceImportOpen(false)} onDone={load} />
    </div>
  );
}
