import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, QrCode, Upload, Trophy, X, Shield, Users, Search, ImageIcon, IdCard, Receipt, Printer, FileArchive, Bus, Lock, Unlock, Phone, Mail, Calendar, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { api, BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { QRDialog } from "@/components/admin/QRDialog";
import { ImportDialog } from "@/components/admin/ImportDialog";
import { AttendanceImportDialog } from "@/components/admin/AttendanceImportDialog";
import { TeamDetailsImportDialog } from "@/components/admin/TeamDetailsImportDialog";
import { TeamArrivalImportDialog } from "@/components/admin/TeamArrivalImportDialog";
import { ReceiptDialog } from "@/components/admin/ReceiptDialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess, useMe } from "@/lib/permissions";
import { driveThumbnail } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { TeamAvatar } from "@/components/ui/team-badge";

type AwardPosition = "gold" | "silver" | "bronze";
const AWARD_LABEL: Record<AwardPosition, string> = {
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
};
const AWARD_TONE: Record<AwardPosition, string> = {
  gold: "border border-gold/40 bg-gold/15 text-gold shadow-sm",
  silver: "border border-slate-400/40 bg-slate-400/15 text-slate-300",
  bronze: "border border-amber-700/40 bg-amber-700/15 text-amber-600",
};

interface LastYearAward {
  age_group: string;
  award: AwardPosition;
}

interface Team {
  id: number;
  name: string;
  school?: string;
  school_code?: string;
  affiliation_number?: string | null;
  region?: string;
  cluster?: string | null;
  label?: string | null;
  country?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  member_count?: number;
  notes?: string;
  stay?: string | null;
  participant_count?: number;
  accommodation_status?: "none" | "partial" | "full";
  accommodation_locations?: { room?: string | null; building?: string | null; whole_team: boolean; count: number }[];
  age_group_counts?: Record<string, number>;
  present_counts?: Record<string, number>;
  participants_with_photo_count?: number;
  all_photos_uploaded?: boolean;
  is_active?: boolean;
  has_arrived?: boolean;
  photo_uploads_locked?: boolean | null;
  photo_uploads_locked_effective?: boolean;
  arrival_date?: string | null;
  arrival_time?: string | null;
  arrival_location?: string | null;
  inactive_age_groups?: string[];
  last_year_awards?: LastYearAward[];
  photos?: { id: number; url: string }[];
}

const MIN_SQUAD_SIZE = 12;

function ageGroupRank(g: string) {
  const m = g.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

// Clusters are Roman numerals ("I".."XX") — a plain string sort would put
// "X" before "IX", so this decodes each one for a proper numeric sort.
function romanToInt(roman: string) {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const v = values[roman[i]] ?? 0;
    const next = values[roman[i + 1]] ?? 0;
    total += next > v ? -v : v;
  }
  return total;
}

function AgeGroupCountsCell({ counts }: { counts?: Record<string, number> }) {
  const entries = Object.entries(counts ?? {}).sort(
    ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
  );
  if (entries.length === 0) return <span className="text-slate-500 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1 min-w-0 max-w-[150px]">
      {entries.map(([group, count]) => {
        const shortGroup = group.replace(/under\s*(\d+)/i, "U$1");
        const isBelow = count < MIN_SQUAD_SIZE;
        return (
          <span
            key={group}
            title={`${group}: ${count} athletes (${isBelow ? "below min squad size" : "complete squad"})`}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border",
              isBelow
                ? "border-red-500/30 bg-red-500/15 text-red-300"
                : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
            )}
          >
            <span className="text-slate-400 font-heading">{shortGroup}:</span>
            <span className="tabular-nums">{count}</span>
          </span>
        );
      })}
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
      <span className="inline-flex items-center gap-1 rounded border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[10px] font-medium text-slate-500 whitespace-nowrap">
        <Trophy className="h-3 w-3 shrink-0 text-slate-500" /> Awards: None
      </span>
    ) : (
      <div className="flex flex-wrap gap-1 max-w-full">
        {awards.map((a) => {
          const shortGroup = (a.age_group || "").replace(/under\s*(\d+)/i, "U$1");
          const label = AWARD_LABEL[a.award as AwardPosition] || a.award;
          return (
            <span
              key={a.age_group}
              title={`${label} · ${a.age_group}`}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-heading font-bold whitespace-nowrap",
                AWARD_TONE[a.award as AwardPosition] || "border border-gold/40 bg-gold/15 text-gold",
              )}
            >
              <Trophy className="h-3 w-3 shrink-0" /> {label} · {shortGroup || a.age_group}
            </span>
          );
        })}
      </div>
    );
  if (!canEdit) return content;
  return (
    <button
      type="button"
      onClick={onEdit}
      data-testid={`edit-awards-${team.id}`}
      className="text-left hover:opacity-80 transition-opacity max-w-full cursor-pointer"
      title={awards.length === 0 ? "Add last year's awards" : "Edit last year's awards"}
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
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-heading font-bold tracking-wide transition-colors",
        active
          ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
          : "border border-red-500/40 bg-red-500/15 text-red-400",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
  if (!canEdit) return badge;
  return (
    <button
      type="button"
      onClick={() => onToggle(team)}
      data-testid={`active-toggle-${team.id}`}
      title={active ? "Mark inactive" : "Mark active"}
      className="hover:opacity-80 transition-opacity shrink-0"
    >
      {badge}
    </button>
  );
}

function ArrivedCell({
  team,
  canEdit,
  onToggle,
}: {
  team: Team;
  canEdit: boolean;
  onToggle: (team: Team) => void;
}) {
  const arrived = team.has_arrived === true;
  const plan = [team.arrival_date, team.arrival_time, team.arrival_location].filter(Boolean).join(" · ");
  const planTitle = plan ? `Planned arrival: ${plan}` : "";
  const badge = (
    <span
      title={!canEdit ? planTitle : undefined}
      className={cn(
        "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-heading font-bold tracking-wide transition-colors whitespace-nowrap",
        arrived
          ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
          : "border border-slate-600/40 bg-slate-800/80 text-slate-400",
      )}
    >
      {arrived ? "Arrived" : "Not Arrived"}
    </span>
  );
  if (!canEdit) return badge;
  return (
    <button
      type="button"
      onClick={() => onToggle(team)}
      data-testid={`arrived-toggle-${team.id}`}
      title={[arrived ? "Mark not arrived" : "Mark arrived", planTitle].filter(Boolean).join(" — ")}
      className="hover:opacity-80 transition-opacity shrink-0"
    >
      {badge}
    </button>
  );
}

function AgeGroupActiveCell({
  team,
  canEdit,
  onToggle,
}: {
  team: Team;
  canEdit: boolean;
  onToggle: (team: Team, ageGroup: string, active: boolean) => void;
}) {
  const groups = Object.keys(team.age_group_counts ?? {}).sort(
    (a, b) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
  );
  if (groups.length === 0) return <span className="text-slate-500 text-xs">—</span>;
  const inactive = new Set(team.inactive_age_groups ?? []);
  return (
    <div className="flex flex-wrap gap-1 min-w-0 max-w-[130px]">
      {groups.map((g) => {
        const active = !inactive.has(g);
        const shortG = g.replace(/under\s*(\d+)/i, "U$1");
        const pill = (
          <span
            key={g}
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-heading font-bold border transition-colors",
              active
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                : "border-red-500/40 bg-red-500/15 text-red-400 line-through opacity-70",
            )}
          >
            {shortG}
          </span>
        );
        if (!canEdit) return <span key={g} title={`${g}: ${active ? "Active" : "Inactive"}`}>{pill}</span>;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onToggle(team, g, !active)}
            data-testid={`age-group-active-toggle-${team.id}-${g}`}
            title={active ? `Mark ${g} inactive` : `Mark ${g} active`}
            className="hover:opacity-80 transition-opacity shrink-0"
          >
            {pill}
          </button>
        );
      })}
    </div>
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
  const initial: Record<string, "" | AwardPosition> = {};
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
                  {(["", "gold", "silver", "bronze"] as const).map((opt) => (
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
                      {opt === "" ? "None" : AWARD_LABEL[opt]}
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
    <div className="min-w-0 max-w-[120px]">
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border",
          status === "full"
            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
            : status === "partial"
            ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
            : "border-white/10 bg-white/5 text-slate-400",
        )}
      >
        {ACCOMMODATION_LABEL[status]}
      </span>
      {locations.length > 0 && (
        <div className="mt-0.5 space-y-0.5 text-[10px] text-slate-400 font-body">
          {locations.map((loc, i) => (
            <div key={i} className="truncate" title={`${loc.room ?? "Room"} · ${loc.building ?? ""}`}>
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

function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex gap-0.5 rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            data-testid={`filter-${label.toLowerCase()}-${opt.value}`}
            className={cn(
              "rounded px-2 py-1 text-[10px] font-heading font-bold transition-colors whitespace-nowrap",
              value === opt.value
                ? "bg-gold text-obsidian shadow-sm"
                : "text-slate-400 hover:bg-white/10 hover:text-white",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const empty: Partial<Team> = { name: "", school: "", region: "", cluster: "", label: "", country: "India", member_count: 0 };

export default function AdminTeams() {
  const { canEdit } = useModuleAccess("teams");
  const { canEdit: canToggleActive } = useModuleAccess("team_activation");
  const gateDisabled = !!useMe()?.admin_password_gate_disabled;
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [qrTeam, setQrTeam] = useState<{ id: number; name: string } | null>(null);
  const [receiptTeam, setReceiptTeam] = useState<{ id: number; name: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [attendanceImportOpen, setAttendanceImportOpen] = useState(false);
  const [teamDetailsImportOpen, setTeamDetailsImportOpen] = useState(false);
  const [teamArrivalImportOpen, setTeamArrivalImportOpen] = useState(false);
  const [form, setForm] = useState<Partial<Team>>(empty);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [arrivalFilter, setArrivalFilter] = useState<"all" | "arrived" | "not_arrived">("all");
  const [awardFilter, setAwardFilter] = useState<"all" | "has_award" | "no_award">("all");
  const [clusterFilter, setClusterFilter] = useState("all");
  const [ageGroupFilter, setAgeGroupFilter] = useState("all");
  const [globalPhotoLock, setGlobalPhotoLock] = useState(false);
  const [globalPhotoLockBusy, setGlobalPhotoLockBusy] = useState(false);

  const load = (silent = false) => {
    // silent=true skips the full-page loading spinner (which unmounts the
    // whole list/table) — used for in-place toggles like Active/Arrived/
    // Awards so a click near the bottom of a long list doesn't yank the
    // page back to the top when the spinner briefly replaces the content.
    if (!silent) setLoading(true);
    api
      .get<Team[]>("/teams")
      .then((r) => setTeams(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    api
      .get<{ locked: boolean }>("/teams/photo-uploads-lock")
      .then((r) => setGlobalPhotoLock(r.data.locked))
      .catch(() => {});
  }, []);

  const toggleTeamPhotoLock = (t: Team) => {
    api
      .put<Team>(`/teams/${t.id}`, { photo_uploads_locked: !t.photo_uploads_locked_effective })
      .then((r) => {
        setTeams((rows) => rows.map((x) => (x.id === t.id ? { ...x, photo_uploads_locked: r.data.photo_uploads_locked, photo_uploads_locked_effective: r.data.photo_uploads_locked_effective } : x)));
        toast.success(r.data.photo_uploads_locked_effective ? `Photo uploads locked for ${t.name}` : `Photo uploads unlocked for ${t.name}`);
      })
      .catch((e: any) => toast.error(e?.response?.data?.detail ?? "Could not update photo upload lock"));
  };

  const toggleGlobalPhotoLock = () => {
    const locking = !globalPhotoLock;
    setGlobalPhotoLockBusy(true);
    api
      .put<{ locked: boolean }>("/teams/photo-uploads-lock", { locked: locking })
      .then((r) => {
        setGlobalPhotoLock(r.data.locked);
        load();
      })
      .catch((e: any) => toast.error(e?.response?.data?.detail ?? "Could not update global photo upload lock"))
      .finally(() => setGlobalPhotoLockBusy(false));
  };

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Team name is required");
    // Send only the fields this form edits — spreading the whole team row
    // would also resend is_active/has_arrived (a false value trips the
    // admin-password gate on an ordinary detail edit) and last_year_awards.
    // Blank text -> null so unique codes don't collide on "" and clearing
    // a field actually clears it.
    const blank = (v?: string | null) => (v && v.trim() ? v.trim() : null);
    const payload = {
      name: form.name!.trim(),
      school_code: blank(form.school_code),
      affiliation_number: blank(form.affiliation_number),
      school: blank(form.school),
      region: blank(form.region),
      cluster: blank(form.cluster),
      label: blank(form.label),
      country: blank(form.country),
      contact_name: blank(form.contact_name),
      contact_email: blank(form.contact_email),
      contact_phone: blank(form.contact_phone),
      member_count: Number(form.member_count) || 0,
      stay: blank(form.stay),
      notes: blank(form.notes),
    };
    // Changing an existing team's label (set, changed, or cleared) needs an
    // admin password — same gate as turning Active/Arrived off (see
    // backend routers/teams.py _require_admin_password) — so this doesn't
    // save yet; it hands off to the same password dialog those toggles use.
    if (form.id) {
      const original = teams.find((x) => x.id === form.id);
      if (original && payload.label !== (original.label ?? null)) {
        setOpen(false);
        setPendingToggle({ kind: "label", team: original, payload });
        return;
      }
    }
    try {
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
    load(true);
  };

  const [awardsTeam, setAwardsTeam] = useState<Team | null>(null);
  const [photosTeam, setPhotosTeam] = useState<Team | null>(null);
  const [idCardTeam, setIdCardTeam] = useState<Team | null>(null);

  // Turning any of these three toggles OFF (Active -> Inactive, Arrived ->
  // Not Arrived, an age group -> Inactive) requires an admin password —
  // same "type it again to unlock" shape as un-marking attendance (see
  // backend routers/teams.py _require_admin_password). Turning one ON never
  // needs this, so those calls go straight through. "label" reuses the same
  // dialog for any change to Team.label from the main edit form (see save()).
  const [pendingToggle, setPendingToggle] = useState<
    | { kind: "active"; team: Team }
    | { kind: "arrived"; team: Team }
    | { kind: "ageGroup"; team: Team; ageGroup: string }
    | { kind: "label"; team: Team; payload: Record<string, unknown> }
    | null
  >(null);
  const [togglePassword, setTogglePassword] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);

  const closeToggleDialog = () => {
    setPendingToggle(null);
    setTogglePassword("");
  };

  const toggleActive = (t: Team) => {
    const turningOn = t.is_active === false;
    if (turningOn || gateDisabled) {
      api
        .put(`/teams/${t.id}`, { is_active: turningOn })
        .then(() => load(true))
        .catch((e: any) => toast.error(e?.response?.data?.detail ?? "Could not update active status"));
    } else {
      setPendingToggle({ kind: "active", team: t });
    }
  };

  const toggleArrived = (t: Team) => {
    const turningOn = t.has_arrived !== true;
    if (turningOn || gateDisabled) {
      api
        .put(`/teams/${t.id}`, { has_arrived: turningOn })
        .then(() => load(true))
        .catch((e: any) => toast.error(e?.response?.data?.detail ?? "Could not update arrival status"));
    } else {
      setPendingToggle({ kind: "arrived", team: t });
    }
  };

  const toggleAgeGroupActive = (t: Team, ageGroup: string, active: boolean) => {
    if (active || gateDisabled) {
      api
        .put(`/teams/${t.id}/age-groups/${encodeURIComponent(ageGroup)}/active`, { is_active: active })
        .then(() => load(true))
        .catch((e: any) => toast.error(e?.response?.data?.detail ?? `Could not update ${ageGroup} status`));
    } else {
      setPendingToggle({ kind: "ageGroup", team: t, ageGroup });
    }
  };

  const confirmToggle = async () => {
    if (!pendingToggle) return;
    if (!togglePassword.trim()) return toast.error("Enter the admin password");
    setToggleBusy(true);
    try {
      if (pendingToggle.kind === "active") {
        await api.put(`/teams/${pendingToggle.team.id}`, {
          is_active: false,
          admin_password: togglePassword.trim(),
        });
      } else if (pendingToggle.kind === "arrived") {
        await api.put(`/teams/${pendingToggle.team.id}`, {
          has_arrived: false,
          admin_password: togglePassword.trim(),
        });
      } else if (pendingToggle.kind === "ageGroup") {
        await api.put(`/teams/${pendingToggle.team.id}/age-groups/${encodeURIComponent(pendingToggle.ageGroup)}/active`, {
          is_active: false,
          admin_password: togglePassword.trim(),
        });
      } else {
        await api.put(`/teams/${pendingToggle.team.id}`, {
          ...pendingToggle.payload,
          admin_password: togglePassword.trim(),
        });
      }
      load(true);
      closeToggleDialog();
    } catch (e: any) {
      toast.error(e?.response?.status === 401 ? "Incorrect admin password" : "Could not update status");
    } finally {
      setToggleBusy(false);
    }
  };

  const emptyTeamCount = teams.filter((t) => (t.participant_count ?? 0) === 0).length;

  const removeEmptyTeams = async () => {
    if (emptyTeamCount === 0) return toast.error("No teams with 0 players");
    if (!confirm(`Delete ${emptyTeamCount} team(s) with 0 players? This cannot be undone.`)) return;
    const r = await api.delete("/teams/empty");
    toast.success(`Deleted ${r.data.deleted} team(s) with 0 players`);
    load(true);
  };

  const set = (k: keyof Team, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const clusterOptions = useMemo(
    () =>
      Array.from(new Set(teams.map((t) => t.cluster).filter((c): c is string => !!c))).sort(
        (a, b) => romanToInt(a) - romanToInt(b) || a.localeCompare(b),
      ),
    [teams],
  );

  const ageGroupOptions = useMemo(
    () =>
      Array.from(new Set(teams.flatMap((t) => Object.keys(t.age_group_counts ?? {})))).sort(
        (a, b) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
      ),
    [teams],
  );

  const filtersActive =
    statusFilter !== "all" || arrivalFilter !== "all" || awardFilter !== "all" || clusterFilter !== "all" || ageGroupFilter !== "all";
  const clearFilters = () => {
    setStatusFilter("all");
    setArrivalFilter("all");
    setAwardFilter("all");
    setClusterFilter("all");
    setAgeGroupFilter("all");
  };

  const filtered = teams.filter((t) => {
    if (search.trim()) {
      const s = search.toLowerCase();
      const matches = [t.name, t.school, t.school_code, t.affiliation_number, t.region, t.cluster, t.country, t.contact_name]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(s));
      if (!matches) return false;
    }
    if (statusFilter === "active" && t.is_active === false) return false;
    if (statusFilter === "inactive" && t.is_active !== false) return false;
    if (arrivalFilter === "arrived" && !t.has_arrived) return false;
    if (arrivalFilter === "not_arrived" && t.has_arrived) return false;
    if (awardFilter === "has_award" && (t.last_year_awards?.length ?? 0) === 0) return false;
    if (awardFilter === "no_award" && (t.last_year_awards?.length ?? 0) > 0) return false;
    if (clusterFilter !== "all" && t.cluster !== clusterFilter) return false;
    if (ageGroupFilter !== "all" && (t.age_group_counts?.[ageGroupFilter] ?? 0) === 0) return false;
    return true;
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
              variant={globalPhotoLock ? "danger" : "outline"}
              size="sm"
              onClick={toggleGlobalPhotoLock}
              disabled={globalPhotoLockBusy}
              data-testid="toggle-global-photo-lock-btn"
              className="text-xs font-semibold"
              title={
                globalPhotoLock
                  ? "Photo uploads are locked for every team — click to unlock all"
                  : "Lock photo uploads for every team, participant & coach on the public site"
              }
            >
              {globalPhotoLock ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Unlock className="h-3.5 w-3.5 text-gold" />
              )}
              {globalPhotoLock ? "Unlock All Photo Uploads" : "Lock All Photo Uploads"}
            </Button>
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
              onClick={() => setTeamArrivalImportOpen(true)}
              data-testid="sync-team-arrivals-btn"
              className="text-xs font-semibold"
            >
              <Bus className="h-3.5 w-3.5 text-gold" /> Sync Arrivals
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
            placeholder="Search teams by name, school, school code, region, cluster…"
            className="h-9 text-xs"
          />
        </div>
        <span className="text-xs text-slate-400 font-mono shrink-0">
          Showing <strong className="text-white font-bold">{filtered.length}</strong> of {teams.length}
        </span>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-2 min-w-0" data-testid="team-filters">
        <FilterGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <FilterGroup
          label="Arrival"
          value={arrivalFilter}
          onChange={setArrivalFilter}
          options={[
            { value: "all", label: "All" },
            { value: "arrived", label: "Arrived" },
            { value: "not_arrived", label: "Not Arrived" },
          ]}
        />
        <FilterGroup
          label="Awards"
          value={awardFilter}
          onChange={setAwardFilter}
          options={[
            { value: "all", label: "All" },
            { value: "has_award", label: "Has Award" },
            { value: "no_award", label: "No Award" },
          ]}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500">Cluster</span>
          <select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            data-testid="cluster-filter-select"
            className="rounded-lg border border-white/10 bg-obsidian-900 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold/50"
          >
            <option value="all">All</option>
            {clusterOptions.map((c) => (
              <option key={c} value={c}>
                Cluster {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500">Age Group</span>
          <select
            value={ageGroupFilter}
            onChange={(e) => setAgeGroupFilter(e.target.value)}
            data-testid="age-group-filter-select"
            className="rounded-lg border border-white/10 bg-obsidian-900 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold/50"
          >
            <option value="all">All</option>
            {ageGroupOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            data-testid="clear-filters-btn"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-heading font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-3 w-3" /> Clear Filters
          </button>
        )}
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
            {/* MOBILE: HIGH-DENSITY COMPACT OPERATIONS CARD LIST */}
            <div className="w-full min-w-0 grid gap-2.5 sm:gap-3 lg:hidden">
              {filtered.map((t, i) => {
                const ageEntries = Object.entries(t.age_group_counts ?? {}).sort(
                  ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
                );
                const inactiveGroups = new Set(t.inactive_age_groups ?? []);
                const accStatus = t.accommodation_status ?? "none";
                const isIndia = (t.country || "").toLowerCase() === "india";
                const awards = t.last_year_awards ?? [];

                return (
                  <div
                    key={t.id}
                    data-testid={`team-card-${t.id}`}
                    className="w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-obsidian-900/90 p-3 sm:p-3.5 space-y-2.5 shadow-sm"
                  >
                    {/* ROW 1: IDENTITY & PRIMARY STATUSES */}
                    <div className="flex items-start justify-between gap-2.5 min-w-0">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="relative shrink-0 mt-0.5">
                          <TeamAvatar name={t.name} size="sm" tone={isIndia ? "gold" : "coral"} />
                          <span className="absolute -bottom-1 -right-1 rounded bg-obsidian-950/90 border border-white/15 px-1 text-[9px] font-mono font-bold text-slate-400">
                            #{i + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3
                            className="font-heading font-bold text-white text-sm leading-snug truncate"
                            title={t.name}
                          >
                            {t.name}
                          </h3>
                          {t.school && t.school !== t.name && (
                            <p
                              className="text-xs text-slate-400 truncate font-body leading-tight mt-0.5"
                              title={t.school}
                            >
                              {t.school}
                            </p>
                          )}
                          {(t.school_code || t.affiliation_number) && (
                            <div className="flex flex-wrap items-center gap-x-2 text-[10px] font-mono text-slate-500 leading-tight mt-0.5">
                              {t.school_code && <span>Code: {t.school_code}</span>}
                              {t.school_code && t.affiliation_number && <span>·</span>}
                              {t.affiliation_number && <span>Affil: {t.affiliation_number}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Primary status badges */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <ActiveCell team={t} canEdit={canEdit && canToggleActive} onToggle={toggleActive} />
                        <ArrivedCell team={t} canEdit={canEdit && t.is_active !== false} onToggle={toggleArrived} />
                      </div>
                    </div>

                    {/* ROW 2: CONSOLIDATED METADATA CHIPS */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge tone={isIndia ? "gold" : "coral"} size="sm">
                        {t.country || "General"}
                      </Badge>
                      {t.cluster && (
                        <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300" title="Cluster">
                          Cluster {t.cluster}
                        </span>
                      )}
                      {t.region && (
                        <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                          {t.region}
                        </span>
                      )}
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                        {t.member_count ?? 0} members
                      </span>
                      <Badge tone={ACCOMMODATION_TONE[accStatus]} size="sm">
                        {ACCOMMODATION_LABEL[accStatus]}
                      </Badge>
                      {t.stay && (
                        <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                          Stay: <strong className="text-white font-semibold">{t.stay}</strong>
                        </span>
                      )}
                    </div>

                    {/* ROW 2B: ACCOMMODATION ROOMS & LOCATIONS */}
                    {t.accommodation_locations && t.accommodation_locations.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-300">
                        <span className="text-[10px] text-slate-400 font-medium">Rooms:</span>
                        {t.accommodation_locations.map((loc, idx) => (
                          <span key={idx} className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono">
                            <strong className="text-white font-semibold">{loc.room ?? "Room"}</strong>
                            {loc.building && <span className="text-slate-400"> · {loc.building}</span>}
                            {!loc.whole_team && <span className="text-slate-500 font-mono"> ({loc.count})</span>}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ROW 2C: CONTACT DETAILS & ARRIVAL INFO */}
                    {(t.contact_name || t.contact_phone || t.contact_email || t.arrival_date || t.arrival_time || t.arrival_location) && (
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs pt-0.5">
                        {t.contact_name && (
                          <span className="text-slate-300 text-[11px]">
                            Contact: <strong className="text-white font-semibold">{t.contact_name}</strong>
                          </span>
                        )}
                        {t.contact_phone && (
                          <a
                            href={`tel:${t.contact_phone}`}
                            className="inline-flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-gold transition-colors"
                            title="Call Contact"
                          >
                            <Phone className="h-2.5 w-2.5" />
                            {t.contact_phone}
                          </a>
                        )}
                        {t.contact_email && (
                          <a
                            href={`mailto:${t.contact_email}`}
                            className="inline-flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 transition-colors"
                            title="Email Contact"
                          >
                            <Mail className="h-2.5 w-2.5 text-slate-400" />
                            {t.contact_email}
                          </a>
                        )}
                        {(t.arrival_date || t.arrival_time || t.arrival_location) && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-400 pl-1 border-l border-white/10">
                            <span className="text-slate-500">Arrival:</span>
                            {t.arrival_date && (
                              <span className="inline-flex items-center gap-1 text-slate-300">
                                <Calendar className="h-2.5 w-2.5 text-slate-400" /> {t.arrival_date}
                              </span>
                            )}
                            {t.arrival_time && (
                              <span className="inline-flex items-center gap-1 text-gold">
                                <Clock className="h-2.5 w-2.5" /> {t.arrival_time}
                              </span>
                            )}
                            {t.arrival_location && (
                              <span className="inline-flex items-center gap-1 text-slate-300">
                                <MapPin className="h-2.5 w-2.5 text-slate-400" /> {t.arrival_location}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ROW 3: CONSOLIDATED AGE GROUPS, SQUAD SIZES & AWARDS */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {ageEntries.map(([group, count]) => {
                        const active = !inactiveGroups.has(group);
                        const shortGroup = group.replace(/under\s*(\d+)/i, "U$1");
                        const isBelowMin = count < MIN_SQUAD_SIZE;
                        const pill = (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-heading font-bold transition-all",
                              active
                                ? isBelowMin
                                  ? "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                                  : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                : "border border-red-500/40 bg-red-500/10 text-red-400 opacity-60 line-through",
                            )}
                          >
                            <span>{shortGroup}: {count}</span>
                            <span
                              className={cn(
                                "text-[9px] uppercase font-extrabold px-1 py-0.2 rounded",
                                active
                                  ? isBelowMin
                                    ? "bg-amber-400/20 text-amber-200"
                                    : "bg-emerald-400/20 text-emerald-200"
                                  : "bg-red-500/20 text-red-300",
                              )}
                            >
                              {active ? "Active" : "Off"}
                            </span>
                          </span>
                        );
                        if (!canEdit || t.is_active === false) return <span key={group}>{pill}</span>;
                        return (
                          <button
                            key={group}
                            type="button"
                            onClick={() => toggleAgeGroupActive(t, group, !active)}
                            data-testid={`age-group-active-toggle-${t.id}-${group}`}
                            title={active ? `Click to deactivate ${group}` : `Click to activate ${group}`}
                            className="hover:opacity-80 transition-opacity"
                          >
                            {pill}
                          </button>
                        );
                      })}

                      {/* Awards pill */}
                      {awards.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => canEdit && t.is_active !== false && setAwardsTeam(t)}
                          disabled={!canEdit}
                          data-testid={`edit-awards-mobile-${t.id}`}
                          className={cn("inline-flex items-center gap-1", canEdit ? "hover:opacity-80 cursor-pointer" : "cursor-default")}
                          title={canEdit ? "Edit last year's awards" : undefined}
                        >
                          {awards.map((a) => (
                            <span
                              key={a.age_group}
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-heading font-bold",
                                AWARD_TONE[a.award],
                              )}
                            >
                              <Trophy className="h-3 w-3 shrink-0" /> {AWARD_LABEL[a.award]} · {a.age_group.replace(/under\s*(\d+)/i, "U$1")}
                            </span>
                          ))}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => canEdit && t.is_active !== false && setAwardsTeam(t)}
                          disabled={!canEdit}
                          data-testid={`edit-awards-mobile-${t.id}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[10px] font-medium text-slate-500",
                            canEdit ? "hover:opacity-80 hover:border-white/10 hover:text-slate-400 cursor-pointer" : "cursor-default",
                          )}
                          title={canEdit ? "Add last year's awards" : undefined}
                        >
                          <Trophy className="h-3 w-3 text-slate-600 shrink-0" /> Awards: None
                        </button>
                      )}
                    </div>

                    {/* ROW 4: COMPLETE OPERATIONS ACTION BUTTONS */}
                    <div className="space-y-1.5 border-t border-white/10 pt-2.5 min-w-0">
                      {/* Operational tools */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs min-w-0 px-2 font-heading font-bold"
                          onClick={() => (t.is_active === false ? toast.error("Team is inactive — ID cards are not available") : setIdCardTeam(t))}
                          data-testid={`download-team-idcards-mobile-${t.id}`}
                          title="Team ID Cards"
                        >
                          <IdCard className={cn(
                            "h-3.5 w-3.5 shrink-0 mr-1",
                            t.all_photos_uploaded
                              ? "text-emerald-400"
                              : (t.participants_with_photo_count ?? 0) >= 1
                              ? "text-red-400"
                              : "text-slate-400"
                          )} />
                          <span className="truncate">ID Cards</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs min-w-0 px-2 font-heading font-bold"
                          onClick={() => setPhotosTeam(t)}
                          data-testid={`manage-photos-mobile-${t.id}`}
                          title={`Manage Photos (${t.photos?.length ?? 0})`}
                        >
                          <ImageIcon className="h-3.5 w-3.5 text-gold shrink-0 mr-1" />
                          <span className="truncate">Photos ({t.photos?.length ?? 0})</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs min-w-0 px-2 font-heading font-bold"
                          onClick={() => setQrTeam({ id: t.id, name: t.name })}
                          data-testid={`qr-team-mobile-${t.id}`}
                        >
                          <QrCode className="h-3.5 w-3.5 text-gold shrink-0 mr-1" /> <span className="truncate">QR</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs min-w-0 px-2 font-heading font-bold"
                          onClick={() => (t.is_active === false ? toast.error("Team is inactive — billing is not available") : setReceiptTeam({ id: t.id, name: t.name }))}
                          data-testid={`receipt-team-mobile-${t.id}`}
                          title="Billing & Receipts"
                        >
                          <Receipt className="h-3.5 w-3.5 text-slate-300 shrink-0 mr-1" /> <span className="truncate">Billing</span>
                        </Button>
                      </div>

                      {/* Photo lock & Admin actions */}
                      {canEdit && (
                        <div className="grid grid-cols-3 gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs min-w-0 px-2 font-heading font-bold"
                            onClick={() => toggleTeamPhotoLock(t)}
                            data-testid={`team-photo-lock-mobile-${t.id}`}
                            title={t.photo_uploads_locked_effective ? "Unlock photo uploads" : "Lock photo uploads"}
                          >
                            {t.photo_uploads_locked_effective ? (
                              <>
                                <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0 mr-1" />
                                <span className="truncate text-amber-400">Locked</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="h-3.5 w-3.5 text-slate-300 shrink-0 mr-1" />
                                <span className="truncate">Lockable</span>
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs min-w-0 px-2 font-heading font-bold"
                            onClick={() => {
                              setForm(t);
                              setOpen(true);
                            }}
                            data-testid={`edit-team-mobile-${t.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0 mr-1 text-slate-300" /> <span className="truncate">Edit</span>
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="h-8 text-xs min-w-0 px-2 font-heading font-bold"
                            onClick={() => remove(t.id)}
                            data-testid={`delete-team-mobile-${t.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0 mr-1" /> <span className="truncate">Delete</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP: PROFESSIONAL OPERATIONS TABLE */}
            <div className="hidden lg:block w-full min-w-0 overflow-x-hidden">
              <Table className="w-full text-xs">
                <THead>
                  <TR>
                    <TH className="w-8 px-1.5 py-2 text-center text-xs">#</TH>
                    <TH className="px-2 py-2 text-xs min-w-0">Team & School</TH>
                    <TH className="px-1.5 py-2 text-xs w-20">Cluster</TH>
                    <TH className="px-1.5 py-2 text-xs text-center w-16">Active</TH>
                    <TH className="px-1.5 py-2 text-xs text-center w-20">Arrival</TH>
                    <TH className="px-1.5 py-2 text-xs">Squad by Age</TH>
                    <TH className="px-1.5 py-2 text-xs">Age Active</TH>
                    <TH className="px-1.5 py-2 text-xs">Awards</TH>
                    <TH className="px-1.5 py-2 text-xs">Accom & Stay</TH>
                    <TH className="px-1.5 py-2 text-xs">Contact</TH>
                    <TH className="px-1.5 py-2 text-right text-xs w-28">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((t, i) => {
                    const isIndia = (t.country || "").toLowerCase() === "india";
                    return (
                      <TR key={t.id} data-testid={`team-row-${t.id}`}>
                        <TD className="px-1.5 py-2 text-slate-500 font-mono text-[11px] text-center w-8">{i + 1}</TD>
                        <TD className="px-2 py-2 min-w-0 max-w-[170px] xl:max-w-[240px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <TeamAvatar name={t.name} size="xs" tone={isIndia ? "gold" : "coral"} />
                            <div className="min-w-0 flex-1">
                              <p className="font-heading font-bold text-white text-xs truncate" title={t.name}>{t.name}</p>
                              {t.school && t.school !== t.name && (
                                <p className="text-[11px] text-slate-400 font-body truncate leading-tight" title={t.school}>{t.school}</p>
                              )}
                              {(t.school_code || t.affiliation_number) && (
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 truncate">
                                  {t.school_code && <span>#{t.school_code}</span>}
                                  {t.school_code && t.affiliation_number && <span>·</span>}
                                  {t.affiliation_number && <span title={`Affiliation #${t.affiliation_number}`}>Aff: {t.affiliation_number}</span>}
                                </div>
                              )}
                              {t.region && (
                                <p className="text-[10px] text-slate-500 font-body truncate leading-tight" title={t.region}>{t.region}</p>
                              )}
                            </div>
                          </div>
                        </TD>
                        <TD className="px-1.5 py-2 min-w-0 max-w-[100px] xl:max-w-[120px]">
                          <div className="space-y-0.5 min-w-0">
                            <p className="text-slate-300 font-body text-xs truncate font-medium" title={t.cluster ? `Cluster ${t.cluster}` : "—"}>{t.cluster || "—"}</p>
                            <span className={cn("inline-flex items-center rounded px-1 py-0.2 text-[9px] font-bold font-heading", isIndia ? "border border-gold/30 bg-gold/15 text-gold" : "border border-coral/30 bg-coral/15 text-coral")} title={t.country || "General"}>
                              {t.country || "General"}
                            </span>
                          </div>
                        </TD>
                        <TD className="px-1.5 py-2 text-center w-16">
                          <ActiveCell team={t} canEdit={canEdit && canToggleActive} onToggle={toggleActive} />
                        </TD>
                        <TD className="px-1.5 py-2 text-center w-20">
                          <ArrivedCell team={t} canEdit={canEdit && t.is_active !== false} onToggle={toggleArrived} />
                        </TD>
                        <TD className="px-1.5 py-2 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-white text-xs tabular-nums shrink-0" title={`Total Athletes: ${t.member_count ?? 0}`}>
                              {t.member_count ?? 0}
                            </span>
                            <AgeGroupCountsCell counts={t.age_group_counts} />
                          </div>
                        </TD>
                        <TD className="px-1.5 py-2 min-w-0">
                          <AgeGroupActiveCell team={t} canEdit={canEdit && t.is_active !== false} onToggle={toggleAgeGroupActive} />
                        </TD>
                        <TD className="px-1.5 py-2 min-w-0">
                          <LastYearAwardsCell team={t} canEdit={canEdit && t.is_active !== false} onEdit={() => setAwardsTeam(t)} />
                        </TD>
                        <TD className="px-1.5 py-2 min-w-0 max-w-[120px]">
                          <AccommodationCell t={t} />
                          {t.stay && (
                            <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5" title={`Stay: ${t.stay}`}>
                              Stay: {t.stay}
                            </p>
                          )}
                        </TD>
                        <TD className="px-1.5 py-2 text-slate-300 text-xs font-body min-w-0 max-w-[100px]">
                          <p className="truncate" title={t.contact_name || "—"}>{t.contact_name || "—"}</p>
                          {t.contact_phone && <p className="font-mono text-[10px] text-slate-500 truncate" title={t.contact_phone}>{t.contact_phone}</p>}
                        </TD>
                        <TD className="px-1.5 py-2 text-right w-28">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              className="h-7 w-7 p-0 shrink-0"
                              onClick={() => setQrTeam({ id: t.id, name: t.name })}
                              data-testid={`qr-team-${t.id}`}
                              title="Generate Team QR"
                            >
                              <QrCode className="h-3.5 w-3.5 text-gold" />
                            </Button>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                className="h-7 w-7 p-0 shrink-0"
                                onClick={() => toggleTeamPhotoLock(t)}
                                data-testid={`team-photo-lock-${t.id}`}
                                title={t.photo_uploads_locked_effective ? "Photo uploads locked for this team — click to unlock" : "Lock photo uploads for this team"}
                              >
                                {t.photo_uploads_locked_effective ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Unlock className="h-3.5 w-3.5 text-slate-300" />}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              className="h-7 w-7 p-0 shrink-0 relative"
                              onClick={() => setPhotosTeam(t)}
                              data-testid={`manage-photos-${t.id}`}
                              title={`Manage Photos (${t.photos?.length ?? 0})`}
                            >
                              <ImageIcon className="h-3.5 w-3.5 text-slate-300" />
                              {t.photos && t.photos.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 min-w-3 px-0.5 rounded-full bg-gold text-[8px] font-mono font-black text-obsidian flex items-center justify-center">
                                  {t.photos.length}
                                </span>
                              )}
                            </Button>
                            <button
                              type="button"
                              onClick={() => (t.is_active === false ? toast.error("Team is inactive — ID cards are not available") : setIdCardTeam(t))}
                              className={cn(
                                "inline-flex items-center justify-center rounded h-7 w-7 p-0 transition-colors shrink-0",
                                t.all_photos_uploaded
                                  ? "text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                                  : (t.participants_with_photo_count ?? 0) >= 1
                                    ? "text-red-500 hover:bg-red-500/10 hover:text-red-400"
                                    : "text-slate-400 hover:bg-white/10 hover:text-white",
                              )}
                              data-testid={`download-team-idcards-${t.id}`}
                              title={
                                t.all_photos_uploaded
                                  ? `Download Team ID Cards (PDF) — all ${t.participant_count} participant photos uploaded`
                                  : (t.participants_with_photo_count ?? 0) >= 1
                                    ? `Download Team ID Cards (PDF) — ${t.participants_with_photo_count ?? 0}/${t.participant_count ?? 0} participant photos uploaded`
                                    : `Download Team ID Cards (PDF) — 0/${t.participant_count ?? 0} participant photos uploaded`
                              }
                            >
                              <IdCard className="h-3.5 w-3.5" />
                            </button>
                            <Button
                              variant="ghost"
                              className="h-7 w-7 p-0 shrink-0"
                              onClick={() => (t.is_active === false ? toast.error("Team is inactive — billing is not available") : setReceiptTeam({ id: t.id, name: t.name }))}
                              data-testid={`generate-receipt-${t.id}`}
                              title="Billing & Refunds"
                            >
                              <Receipt className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                className="h-7 w-7 p-0 shrink-0"
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
                                className="h-7 w-7 p-0 shrink-0 hover:bg-red-500/15"
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
              <Label>School Code</Label>
              <Input
                value={form.school_code ?? ""}
                onChange={(e) => set("school_code", e.target.value)}
                placeholder="Assigned by organizer, e.g. C8-014"
                data-testid="team-school-code-input"
              />
            </div>
            <div>
              <Label>CBSE Affiliation No.</Label>
              <Input
                value={form.affiliation_number ?? ""}
                onChange={(e) => set("affiliation_number", e.target.value)}
                placeholder="e.g. 2130850"
                data-testid="team-affiliation-input"
              />
            </div>
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
              <Label>Region / State</Label>
              <Input
                value={form.region ?? ""}
                onChange={(e) => set("region", e.target.value)}
                placeholder="e.g. Delhi"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cluster</Label>
              <Input
                value={form.cluster ?? ""}
                onChange={(e) => set("cluster", e.target.value)}
                placeholder="e.g. VIII"
                data-testid="team-cluster-input"
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
          <div>
            <Label>Label</Label>
            <Input
              value={form.label ?? ""}
              onChange={(e) => set("label", e.target.value)}
              placeholder="e.g. sister school group"
              title="Two teams sharing the same label can never be placed in the same pool"
              data-testid="team-label-input"
            />
          </div>
          <div>
            <Label>Country</Label>
            <Input
              value={form.country ?? ""}
              onChange={(e) => set("country", e.target.value)}
              placeholder="India / Saudi Arabia"
            />
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
            <Label>Contact Email</Label>
            <Input
              type="email"
              value={form.contact_email ?? ""}
              onChange={(e) => set("contact_email", e.target.value)}
              placeholder="coach@school.edu"
              data-testid="team-email-input"
            />
          </div>
          <div>
            <Label>Stay (Fooding / Lodging)</Label>
            <Input
              value={form.stay ?? ""}
              onChange={(e) => set("stay", e.target.value)}
              placeholder="e.g. Fooding and Lodging"
              data-testid="team-stay-input"
            />
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

      <ReceiptDialog open={receiptTeam !== null} onClose={() => setReceiptTeam(null)} team={receiptTeam} />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="teams" onDone={load} />
      <AttendanceImportDialog open={attendanceImportOpen} onClose={() => setAttendanceImportOpen(false)} onDone={load} />
      <TeamDetailsImportDialog open={teamDetailsImportOpen} onClose={() => setTeamDetailsImportOpen(false)} onDone={load} />
      <TeamArrivalImportDialog open={teamArrivalImportOpen} onClose={() => setTeamArrivalImportOpen(false)} onDone={load} />
      {awardsTeam && (
        <AwardsDialog
          team={awardsTeam}
          onClose={() => setAwardsTeam(null)}
          onSaved={() => {
            setAwardsTeam(null);
            load(true);
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
      <Dialog
        open={idCardTeam !== null}
        onClose={() => setIdCardTeam(null)}
        title={idCardTeam ? `Download ID Cards — ${idCardTeam.name}` : "Download ID Cards"}
        testId="idcard-download-dialog"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400 font-body">
            Choose how to download every participant's card, sorted by age group.
          </p>
          <a
            href={idCardTeam ? `${BASE_URL}/api/export/idcards/team/${idCardTeam.id}.pdf` : "#"}
            onClick={() => setIdCardTeam(null)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="idcard-download-a4"
          >
            <IdCard className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">A4 Sheet</p>
              <p className="text-xs text-slate-400">6 cards per page — standard printer paper</p>
            </div>
          </a>
          <a
            href={idCardTeam ? `${BASE_URL}/api/export/idcards/team/${idCardTeam.id}/sheet-12x18.pdf` : "#"}
            onClick={() => setIdCardTeam(null)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="idcard-download-12x18"
          >
            <Printer className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">12x18in Sheet</p>
              <p className="text-xs text-slate-400">12 cards per page — for print-shop stock</p>
            </div>
          </a>
          <a
            href={idCardTeam ? `${BASE_URL}/api/export/idcards/team/${idCardTeam.id}/individual.zip` : "#"}
            onClick={() => setIdCardTeam(null)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="idcard-download-individual"
          >
            <FileArchive className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">Individual Cards (ZIP)</p>
              <p className="text-xs text-slate-400">One PDF per card — for picking &amp; arranging in design/print layout software</p>
            </div>
          </a>
        </div>
      </Dialog>

      <Dialog
        open={pendingToggle !== null}
        onClose={closeToggleDialog}
        title="Confirm Admin Password"
        testId="toggle-admin-password-dialog"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 font-body">
            {pendingToggle?.kind === "active" && (
              <>Marking <span className="text-white font-bold">{pendingToggle.team.name}</span> Inactive removes it from fixture eligibility. Requires an admin account's password.</>
            )}
            {pendingToggle?.kind === "arrived" && (
              <>Marking <span className="text-white font-bold">{pendingToggle.team.name}</span> Not Arrived requires an admin account's password.</>
            )}
            {pendingToggle?.kind === "ageGroup" && (
              <>
                Marking <span className="text-white font-bold">{pendingToggle.ageGroup}</span> inactive for{" "}
                <span className="text-white font-bold">{pendingToggle.team.name}</span> requires an admin account's password.
              </>
            )}
            {pendingToggle?.kind === "label" && (
              <>Changing <span className="text-white font-bold">{pendingToggle.team.name}</span>'s label requires an admin account's password — it controls which teams can never share a pool.</>
            )}
          </p>
          <div>
            <Label>Admin Password</Label>
            <Input
              type="password"
              value={togglePassword}
              onChange={(e) => setTogglePassword(e.target.value)}
              data-testid="toggle-admin-password-input"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && confirmToggle()}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={closeToggleDialog}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={confirmToggle}
              disabled={toggleBusy}
              data-testid="confirm-toggle-btn"
            >
              {toggleBusy ? "Verifying…" : "Confirm"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
