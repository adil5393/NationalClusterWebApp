import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, QrCode, Upload, Trophy, X, Shield, Users, Search, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { QRDialog } from "@/components/admin/QRDialog";
import { ImportDialog } from "@/components/admin/ImportDialog";
import { AttendanceImportDialog } from "@/components/admin/AttendanceImportDialog";
import { TeamDetailsImportDialog } from "@/components/admin/TeamDetailsImportDialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess } from "@/lib/permissions";
import { driveThumbnail } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { TeamAvatar } from "@/components/ui/team-badge";

interface LastYearAward {
  age_group: string;
  award: "winner" | "runner";
}

interface Team {
  id: number;
  name: string;
  school?: string;
  school_code?: string;
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
  present_counts?: Record<string, number>;
  is_active?: boolean;
  last_year_awards?: LastYearAward[];
  photos?: { id: number; url: string }[];
}

const MIN_SQUAD_SIZE = 12;

function ageGroupRank(g: string) {
  const m = g.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function AgeGroupCountsCell({ counts }: { counts?: Record<string, number> }) {
  const entries = Object.entries(counts ?? {}).sort(
    ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
  );
  if (entries.length === 0) return <span className="text-slate-500">—</span>;
  return (
    <div className="space-y-0.5 min-w-[110px]">
      {entries.map(([group, count]) => (
        <div key={group} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-400 truncate">{group}</span>
          <span
            className={cn(
              "font-mono font-bold tabular-nums rounded px-1 text-[11px]",
              count < MIN_SQUAD_SIZE ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400",
            )}
          >
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

function LastYearAwardsCell({
  team,
  canEdit,
  onEdit,
}: {
  team: Team;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const awards = team.last_year_awards ?? [];
  const content =
    awards.length === 0 ? (
      <span className="inline-flex items-center gap-1 rounded border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[11px] font-medium text-slate-500">
        <X className="h-3 w-3 shrink-0" /> None
      </span>
    ) : (
      <div className="flex flex-wrap gap-1 max-w-full">
        {awards.map((a) => (
          <span
            key={a.age_group}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-heading font-bold",
              a.award === "winner"
                ? "border border-gold/40 bg-gold/15 text-gold shadow-sm"
                : "border border-blue-500/40 bg-blue-500/15 text-blue-300",
            )}
          >
            <Trophy className="h-3 w-3 shrink-0" /> {a.award === "winner" ? "Winner" : "Runner-up"} · {a.age_group}
          </span>
        ))}
      </div>
    );
  if (!canEdit) return content;
  return (
    <button
      onClick={onEdit}
      data-testid={`edit-awards-${team.id}`}
      className="text-left hover:opacity-80 transition-opacity max-w-full"
      title="Edit last year's awards"
    >
      {content}
    </button>
  );
}

function ActiveCell({
  team,
  canEdit,
  onToggle,
}: {
  team: Team;
  canEdit: boolean;
  onToggle: (team: Team) => void;
}) {
  const active = team.is_active !== false;
  const badge = (
    <Badge tone={active ? "green" : "red"} size="sm">
      {active ? "Active" : "Inactive"}
    </Badge>
  );
  if (!canEdit) return badge;
  return (
    <button
      onClick={() => onToggle(team)}
      data-testid={`active-toggle-${team.id}`}
      title={active ? "Mark inactive" : "Mark active"}
      className="hover:opacity-80 transition-opacity"
    >
      {badge}
    </button>
  );
}

function AwardsDialog({
  team,
  onClose,
  onSaved,
}: {
  team: Team;
  onClose: () => void;
  onSaved: () => void;
}) {
  const groups = Object.keys(team.age_group_counts ?? {}).sort(
    ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
  );
  const initial: Record<string, "" | "winner" | "runner"> = {};
  for (const g of groups) {
    initial[g] = (team.last_year_awards ?? []).find((a) => a.age_group === g)?.award ?? "";
  }
  const [picks, setPicks] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const last_year_awards = Object.entries(picks)
      .filter(([, award]) => award)
      .map(([age_group, award]) => ({ age_group, award }));
    setSaving(true);
    try {
      await api.put(`/teams/${team.id}`, { last_year_awards });
      toast.success("Awards updated");
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update awards");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Last Year's Awards — ${team.name}`} testId="awards-dialog">
      <div className="space-y-4">
        {groups.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">This squad has no registered players in any age category yet.</p>
        ) : (
          <div className="space-y-2.5">
            {groups.map((g) => (
              <div key={g} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-xs font-heading font-bold text-white">{g}</span>
                <div className="flex gap-1">
                  {(["", "winner", "runner"] as const).map((opt) => (
                    <button
                      key={opt || "none"}
                      type="button"
                      onClick={() => setPicks((p) => ({ ...p, [g]: opt }))}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-heading font-bold transition-colors",
                        picks[g] === opt
                          ? "bg-gold text-obsidian shadow-sm"
                          : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white",
                      )}
                      data-testid={`award-pick-${g}-${opt || "none"}`}
                    >
                      {opt === "" ? "None" : opt === "winner" ? "Winner" : "Runner-up"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={save}
            disabled={saving || groups.length === 0}
            data-testid="save-awards-btn"
          >
            {saving ? "Saving…" : "Save Awards"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PhotosDialog({
  team,
  canEdit,
  onClose,
  onChanged,
}: {
  team: Team;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [photos, setPhotos] = useState(team.photos ?? []);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const removePhoto = async (photoId: number) => {
    if (!confirm("Delete this photo? It won't show on the team's public page anymore.")) return;
    setDeletingId(photoId);
    try {
      await api.delete(`/teams/${team.id}/photos/${photoId}`);
      setPhotos((p) => p.filter((x) => x.id !== photoId));
      toast.success("Photo deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete photo");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Team Photos — ${team.name}`} testId="photos-dialog">
      <div className="space-y-4">
        <p className="text-xs text-slate-400 font-body">
          Uploaded via the school registration form import. Multiple photos rotate on the team's public
          page every 2 seconds.
        </p>
        {photos.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No photos on file for this team yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <div
                key={p.id}
                data-testid={`team-photo-thumb-${p.id}`}
                className="group relative overflow-hidden rounded-lg border border-white/10 bg-obsidian-950"
              >
                <img src={driveThumbnail(p.url)} alt="" className="h-28 w-full object-cover" referrerPolicy="no-referrer" />
                {canEdit && (
                  <button
                    onClick={() => removePhoto(p.id)}
                    disabled={deletingId === p.id}
                    data-testid={`delete-team-photo-${p.id}`}
                    title="Delete photo"
                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/70 text-red-400 opacity-0 transition-opacity hover:bg-black/90 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

const ACCOMMODATION_LABEL: Record<string, string> = { none: "Not Set Up", partial: "Partial", full: "Set Up" };
const ACCOMMODATION_TONE: Record<string, "neutral" | "amber" | "green"> = { none: "neutral", partial: "amber", full: "green" };

function AccommodationCell({ t }: { t: Team }) {
  const status = t.accommodation_status ?? "none";
  const locations = t.accommodation_locations ?? [];
  return (
    <div className="min-w-[120px]">
      <Badge tone={ACCOMMODATION_TONE[status]} size="sm">
        {ACCOMMODATION_LABEL[status]}
      </Badge>
      {locations.length > 0 && (
        <div className="mt-1 space-y-0.5 text-[11px] text-slate-400 font-body">
          {locations.map((loc, i) => (
            <div key={i} className="truncate" title={`${loc.room ?? "Unknown room"} · ${loc.building ?? "Unknown building"}`}>
              <span className="font-semibold text-slate-300">{loc.room ?? "Room"}</span>
              {loc.building && <span className="text-slate-500"> · {loc.building}</span>}
              {!loc.whole_team && <span className="text-slate-500 font-mono"> ({loc.count})</span>}
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
  const [teamDetailsImportOpen, setTeamDetailsImportOpen] = useState(false);
  const [form, setForm] = useState<Partial<Team>>(empty);
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get<Team[]>("/teams")
      .then((r) => setTeams(r.data))
      .finally(() => setLoading(false));
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

  const [awardsTeam, setAwardsTeam] = useState<Team | null>(null);
  const [photosTeam, setPhotosTeam] = useState<Team | null>(null);

  const toggleActive = async (t: Team) => {
    try {
      await api.put(`/teams/${t.id}`, { is_active: t.is_active === false });
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update active status");
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

  const filtered = teams.filter((t) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return [t.name, t.school, t.school_code, t.region, t.country, t.contact_name]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(s));
  });

  return (
    <div data-testid="admin-teams" className="w-full min-w-0 space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5 min-w-0">
        <div className="min-w-0">
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            DELEGATION MANAGEMENT
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Participating Teams
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            {teams.length} total delegations · squad rosters, award seeds & accommodation status
          </p>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttendanceImportOpen(true)}
              data-testid="import-attendance-list-btn"
              className="text-xs font-semibold"
            >
              <Upload className="h-3.5 w-3.5 text-gold" /> Attendance Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTeamDetailsImportOpen(true)}
              data-testid="import-team-details-btn"
              className="text-xs font-semibold"
            >
              <Upload className="h-3.5 w-3.5 text-gold" /> Registration Form
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              data-testid="import-teams-btn"
              className="text-xs font-semibold"
            >
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
            {emptyTeamCount > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={removeEmptyTeams}
                data-testid="delete-empty-teams-btn"
                className="text-xs font-semibold"
              >
                <Trash2 className="h-3.5 w-3.5" /> Purge ({emptyTeamCount}) Empty
              </Button>
            )}
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setForm(empty);
                setOpen(true);
              }}
              data-testid="add-team-btn"
              className="text-xs font-extrabold"
            >
              <Plus className="h-4 w-4" /> Add Team
            </Button>
          </div>
        )}
      </div>

      {/* SEARCH BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
        <div className="w-full sm:max-w-sm min-w-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams by name, school, school code, region…"
            className="h-9 text-xs"
          />
        </div>
        <span className="text-xs text-slate-400 font-mono shrink-0">
          Showing <strong className="text-white font-bold">{filtered.length}</strong> of {teams.length}
        </span>
      </div>

      {/* TEAMS CONTENT */}
      <div className="w-full min-w-0">
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 py-16">
            <Spinner label="Loading tournament teams…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 p-6">
            <EmptyState
              title="No teams matching filter"
              hint="Try searching a different team or create a new team entry."
            />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="w-full min-w-0 grid gap-3 lg:hidden">
              {filtered.map((t, i) => {
                const ageEntries = Object.entries(t.age_group_counts ?? {}).sort(
                  ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
                );
                const accStatus = t.accommodation_status ?? "none";
                const isIndia = (t.country || "").toLowerCase() === "india";

                return (
                  <div
                    key={t.id}
                    data-testid={`team-card-${t.id}`}
                    className="w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <TeamAvatar name={t.name} size="sm" tone={isIndia ? "gold" : "coral"} />
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                          <h3 className="font-heading font-bold text-white text-sm truncate" title={t.name}>{t.name}</h3>
                          {t.school && <p className="text-xs text-slate-400 truncate font-body" title={t.school}>{t.school}</p>}
                          {t.school_code && <p className="font-mono text-[10px] text-slate-500 truncate">Code: {t.school_code}</p>}
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <ActiveCell team={t} canEdit={canEdit} onToggle={toggleActive} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5 text-xs">
                      <Badge tone={isIndia ? "gold" : "coral"} size="sm">
                        {t.country || "General"}
                      </Badge>
                      {t.region && (
                        <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 font-mono truncate max-w-full">
                          {t.region}
                        </span>
                      )}
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 font-mono shrink-0">
                        {t.member_count ?? 0} members
                      </span>
                      <Badge tone={ACCOMMODATION_TONE[accStatus]} size="sm">
                        {ACCOMMODATION_LABEL[accStatus]}
                      </Badge>
                    </div>

                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => canEdit && setAwardsTeam(t)}
                        disabled={!canEdit}
                        data-testid={`edit-awards-mobile-${t.id}`}
                        className={cn("text-left max-w-full", canEdit ? "hover:opacity-80 transition-opacity cursor-pointer" : "cursor-default")}
                        title={canEdit ? "Edit last year's awards" : undefined}
                      >
                        <LastYearAwardsCell team={t} canEdit={false} onEdit={() => {}} />
                      </button>
                    </div>

                    {ageEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {ageEntries.map(([group, count]) => (
                          <span
                            key={group}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-mono font-bold",
                              count < MIN_SQUAD_SIZE ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400",
                            )}
                          >
                            {group}: {count}
                          </span>
                        ))}
                      </div>
                    )}

                    {t.contact_name && (
                      <p className="text-xs text-slate-400 truncate font-body">
                        Contact: <strong className="text-slate-200">{t.contact_name}</strong>
                      </p>
                    )}

                    <div className={cn("grid gap-2 border-t border-white/10 pt-3 min-w-0", canEdit ? "grid-cols-3" : "grid-cols-1")}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs min-w-0 px-2"
                        onClick={() => setQrTeam({ id: t.id, name: t.name })}
                        data-testid={`qr-team-mobile-${t.id}`}
                      >
                        <QrCode className="h-3.5 w-3.5 text-gold shrink-0" /> <span className="truncate">QR</span>
                      </Button>
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs min-w-0 px-2"
                          onClick={() => {
                            setForm(t);
                            setOpen(true);
                          }}
                          data-testid={`edit-team-mobile-${t.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Edit</span>
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="danger"
                          size="sm"
                          className="h-8 text-xs min-w-0 px-2"
                          onClick={() => remove(t.id)}
                          data-testid={`delete-team-mobile-${t.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Delete</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP: PROFESSIONAL OPERATIONS TABLE */}
            <div className="hidden lg:block w-full min-w-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12">#</TH>
                    <TH>Team & School</TH>
                    <TH>Status</TH>
                    <TH>Last Year Awards</TH>
                    <TH>Region</TH>
                    <TH>Country</TH>
                    <TH className="text-right">Athletes</TH>
                    <TH>Squad by Age</TH>
                    <TH>Accommodation</TH>
                    <TH>Contact</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((t, i) => {
                    const isIndia = (t.country || "").toLowerCase() === "india";
                    return (
                      <TR key={t.id} data-testid={`team-row-${t.id}`}>
                        <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                        <TD>
                          <div className="flex items-center gap-2.5">
                            <TeamAvatar name={t.name} size="xs" tone={isIndia ? "gold" : "coral"} />
                            <div>
                              <p className="font-heading font-bold text-white text-sm">{t.name}</p>
                              {t.school && <p className="text-xs text-slate-400 font-body truncate">{t.school}</p>}
                              {t.school_code && <p className="font-mono text-[10px] text-slate-500">#{t.school_code}</p>}
                            </div>
                          </div>
                        </TD>
                        <TD>
                          <ActiveCell team={t} canEdit={canEdit} onToggle={toggleActive} />
                        </TD>
                        <TD>
                          <LastYearAwardsCell
                            team={t}
                            canEdit={canEdit}
                            onEdit={() => setAwardsTeam(t)}
                          />
                        </TD>
                        <TD className="text-slate-300 font-body text-xs">{t.region || "—"}</TD>
                        <TD>
                          <Badge tone={isIndia ? "gold" : "coral"} size="sm">
                            {t.country || "General"}
                          </Badge>
                        </TD>
                        <TD className="text-right font-mono font-bold text-white">
                          {t.member_count ?? 0}
                        </TD>
                        <TD>
                          <AgeGroupCountsCell counts={t.age_group_counts} />
                        </TD>
                        <TD>
                          <AccommodationCell t={t} />
                        </TD>
                        <TD className="text-slate-300 text-xs font-body">{t.contact_name || "—"}</TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setQrTeam({ id: t.id, name: t.name })}
                              data-testid={`qr-team-${t.id}`}
                              title="Generate Team QR"
                            >
                              <QrCode className="h-3.5 w-3.5 text-gold" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setPhotosTeam(t)}
                              data-testid={`manage-photos-${t.id}`}
                              title={`Manage Photos (${t.photos?.length ?? 0})`}
                            >
                              <ImageIcon className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => {
                                  setForm(t);
                                  setOpen(true);
                                }}
                                data-testid={`edit-team-${t.id}`}
                                title="Edit Team"
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-300" />
                              </Button>
                            )}
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => remove(t.id)}
                                data-testid={`delete-team-${t.id}`}
                                title="Delete Team"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            )}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* ADD / EDIT TEAM DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Edit Team Delegation" : "Register New Team Delegation"}
        testId="team-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Team / Delegation Name *</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. DPS R.K. Puram"
              data-testid="team-name-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>School Affiliation</Label>
              <Input
                value={form.school ?? ""}
                onChange={(e) => set("school", e.target.value)}
                placeholder="Full school name"
              />
            </div>
            <div>
              <Label>Region / Cluster State</Label>
              <Input
                value={form.region ?? ""}
                onChange={(e) => set("region", e.target.value)}
                placeholder="e.g. Cluster VIII - Delhi"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Country</Label>
              <Input
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value)}
                placeholder="India / Saudi Arabia"
              />
            </div>
            <div>
              <Label>Total Members</Label>
              <Input
                type="number"
                value={form.member_count ?? 0}
                onChange={(e) => set("member_count", e.target.value)}
                data-testid="team-members-input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Manager / Contact Name</Label>
              <Input
                value={form.contact_name ?? ""}
                onChange={(e) => set("contact_name", e.target.value)}
                placeholder="Coach / Team Manager"
              />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input
                value={form.contact_phone ?? ""}
                onChange={(e) => set("contact_phone", e.target.value)}
                placeholder="+91 98765 00000"
              />
            </div>
          </div>
          <div>
            <Label>Operational Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Special accommodation or dietary requests..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-team-btn">
              {form.id ? "Update Team" : "Save Team"}
            </Button>
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
      <TeamDetailsImportDialog open={teamDetailsImportOpen} onClose={() => setTeamDetailsImportOpen(false)} onDone={load} />
      {awardsTeam && (
        <AwardsDialog
          team={awardsTeam}
          onClose={() => setAwardsTeam(null)}
          onSaved={() => {
            setAwardsTeam(null);
            load();
          }}
        />
      )}
      {photosTeam && (
        <PhotosDialog
          team={photosTeam}
          canEdit={canEdit}
          onClose={() => setPhotosTeam(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
