import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2, Circle, Upload, Download, Users, Search, Filter, FileSpreadsheet, IdCard, ImageOff, Lock, Unlock, Phone, Mail } from "lucide-react";
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
import { cn } from "@/lib/utils";

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
  weight?: string | number | null;
  notes?: string;
  father_name?: string;
  date_of_birth?: string;
  student_class?: string;
  photo_url?: string | null;
  photo_uploads_locked?: boolean | null;
  photo_uploads_locked_effective?: boolean;
  is_active?: boolean;
}

interface Coach {
  id: number;
  team_id: number;
  full_name: string;
  role?: string;
  email?: string;
  phone?: string;
  notes?: string;
  aadhaar_no?: string;
  photo_url?: string | null;
  photo_uploads_locked?: boolean | null;
  photo_uploads_locked_effective?: boolean;
  is_present?: boolean;
}

interface Team {
  id: number;
  name: string;
  is_active?: boolean;
}

const PAGE_SIZE = 25;
const empty: Partial<Participant> = { full_name: "", role: "Player", is_present: false };
const emptyCoach: Partial<Coach> = { full_name: "", role: "Coach", is_present: false };

// AKFI kabaddi weight-category caps (kg), keyed case-insensitively — mirrors
// backend/app/routers/attendance.py AGE_GROUP_WEIGHT_CAPS. For these age
// groups, attendance is derived from weight (no manual toggle); every other
// age_group value keeps the manual present/absent toggle.
const AGE_GROUP_WEIGHT_CAPS: Record<string, number> = {
  "under 14": 51,
  "under 17": 57,
  "under 19": 70,
};
function weightCapFor(ageGroup?: string): number | undefined {
  if (!ageGroup) return undefined;
  return AGE_GROUP_WEIGHT_CAPS[ageGroup.trim().toLowerCase()];
}

export default function Participants() {
  const { canEdit } = useModuleAccess("teams");
  const canMarkAttendance = canEdit;
  const [view, setView] = useState<"players" | "coaches">("players");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
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
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachForm, setCoachForm] = useState<Partial<Coach>>(emptyCoach);
  const [pendingUnmark, setPendingUnmark] = useState<
    { kind: "participant" | "coach"; id: number; name: string; role: string } | null
  >(null);
  const [unmarkPassword, setUnmarkPassword] = useState("");
  const [unmarkBusy, setUnmarkBusy] = useState(false);
  const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>({});
  const [savingWeightId, setSavingWeightId] = useState<number | null>(null);
  const [pendingWeightEdit, setPendingWeightEdit] = useState<{ id: number; name: string } | null>(null);
  const [weightEditValue, setWeightEditValue] = useState("");
  const [weightEditPassword, setWeightEditPassword] = useState("");
  const [weightEditBusy, setWeightEditBusy] = useState(false);
  const [pendingActiveChange, setPendingActiveChange] = useState<
    { id: number; name: string; targetActive: boolean } | null
  >(null);
  const [activePassword, setActivePassword] = useState("");
  const [activeBusy, setActiveBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Participant[]>("/participants"),
      api.get<Coach[]>("/coaches"),
      api.get<Team[]>("/teams"),
    ])
      .then(([p, c, t]) => {
        setParticipants(p.data);
        setCoaches(c.data);
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
  const teamInactive = (tid?: number) => teams.find((t) => t.id === tid)?.is_active === false;
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

  const coachPresentCount = coaches.filter((c) => c.is_present).length;

  const filteredCoaches = useMemo(() => {
    const s = search.trim().toLowerCase();
    return coaches.filter((c) => {
      if (teamFilter && String(c.team_id) !== teamFilter) return false;
      if (presenceFilter === "present" && !c.is_present) return false;
      if (presenceFilter === "absent" && c.is_present) return false;
      if (!s) return true;
      return c.full_name.toLowerCase().includes(s) || teamName(c.team_id).toLowerCase().includes(s);
    });
  }, [coaches, teams, search, teamFilter, presenceFilter]);

  const coachPageCount = Math.max(1, Math.ceil(filteredCoaches.length / PAGE_SIZE));
  const pagedCoaches = filteredCoaches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, teamFilter, ageGroupFilter, presenceFilter, view]);

  const save = async () => {
    if (!form.full_name?.trim()) return toast.error("Full name is required");
    if (!form.team_id) return toast.error("Team is required");
    try {
      // Only the fields this form edits (not the whole row — is_present,
      // weight, photo_url etc. have their own endpoints). Blank -> null so a
      // cleared DOB/age doesn't fail validation and registration_no's unique
      // constraint isn't hit by "".
      const blank = (v?: string | number | null) => (v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null);
      const payload = {
        team_id: Number(form.team_id),
        full_name: form.full_name!.trim(),
        registration_no: blank(form.registration_no),
        role: blank(form.role),
        gender: blank(form.gender),
        age: form.age ? Number(form.age) : null,
        age_group: blank(form.age_group),
        father_name: blank(form.father_name),
        date_of_birth: blank(form.date_of_birth),
        student_class: blank(form.student_class),
        notes: blank(form.notes),
      };
      if (form.id) await api.put(`/participants/${form.id}`, payload);
      else await api.post("/participants", payload);
      toast.success(form.id ? "Participant updated" : "Participant created");
      setOpen(false);
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Could not save participant");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this participant?")) return;
    await api.delete(`/participants/${id}`);
    toast.success("Participant deleted");
    load();
  };

  const togglePhotoLock = async (p: Participant) => {
    try {
      const r = await api.put<Participant>(`/participants/${p.id}`, { photo_uploads_locked: !p.photo_uploads_locked_effective });
      setParticipants((rows) => rows.map((x) => (x.id === p.id ? { ...x, photo_uploads_locked: r.data.photo_uploads_locked, photo_uploads_locked_effective: r.data.photo_uploads_locked_effective } : x)));
      toast.success(r.data.photo_uploads_locked_effective ? `Photo uploads locked for ${p.full_name}` : `Photo uploads unlocked for ${p.full_name}`);
    } catch {
      toast.error("Could not update photo upload lock");
    }
  };

  const toggleCoachPhotoLock = async (c: Coach) => {
    try {
      const r = await api.put<Coach>(`/coaches/${c.id}`, { photo_uploads_locked: !c.photo_uploads_locked_effective });
      setCoaches((rows) => rows.map((x) => (x.id === c.id ? { ...x, photo_uploads_locked: r.data.photo_uploads_locked, photo_uploads_locked_effective: r.data.photo_uploads_locked_effective } : x)));
      toast.success(r.data.photo_uploads_locked_effective ? `Photo uploads locked for ${c.full_name}` : `Photo uploads unlocked for ${c.full_name}`);
    } catch {
      toast.error("Could not update photo upload lock");
    }
  };

  const removePhoto = async (p: Participant) => {
    if (!confirm(`Remove ${p.full_name}'s photo?`)) return;
    try {
      await api.delete(`/participants/${p.id}/photo`);
      setParticipants((rows) => rows.map((r) => (r.id === p.id ? { ...r, photo_url: null } : r)));
      toast.success("Photo removed");
    } catch {
      toast.error("Could not remove photo");
    }
  };

  const toggleAttendance = async (p: Participant) => {
    if (p.is_present) {
      // Unmarking a verified-present member is locked behind an admin
      // password — see pendingUnmark/confirmUnmark below.
      setPendingUnmark({ kind: "participant", id: p.id, name: p.full_name, role: p.role || "Player" });
      return;
    }
    setParticipants((rows) => rows.map((r) => (r.id === p.id ? { ...r, is_present: true } : r)));
    try {
      await api.post(`/participants/${p.id}/attendance`, { present: true });
    } catch {
      toast.error("Could not update attendance");
      setParticipants((rows) => rows.map((r) => (r.id === p.id ? { ...r, is_present: false } : r)));
    }
  };

  const weightDraftFor = (p: Participant) =>
    weightDrafts[p.id] !== undefined ? weightDrafts[p.id] : p.weight != null ? String(p.weight) : "";

  const saveWeight = async (p: Participant) => {
    const raw = weightDraftFor(p).trim();
    const current = p.weight != null ? String(p.weight) : "";
    if (raw === current) return;
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      return toast.error("Enter a valid weight in kg");
    }
    setSavingWeightId(p.id);
    try {
      const r = await api.post<Participant>(`/participants/${p.id}/weight`, { weight: value });
      setParticipants((rows) => rows.map((row) => (row.id === p.id ? { ...row, ...r.data } : row)));
      setWeightDrafts((d) => {
        const next = { ...d };
        delete next[p.id];
        return next;
      });
    } catch {
      toast.error("Could not save weight");
    } finally {
      setSavingWeightId(null);
    }
  };

  const openWeightEdit = (p: Participant) => {
    setPendingWeightEdit({ id: p.id, name: p.full_name });
    setWeightEditValue(p.weight != null ? String(p.weight) : "");
    setWeightEditPassword("");
  };

  const closeWeightEditDialog = () => {
    setPendingWeightEdit(null);
    setWeightEditPassword("");
  };

  const confirmWeightEdit = async () => {
    if (!pendingWeightEdit) return;
    const raw = weightEditValue.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      return toast.error("Enter a valid weight in kg");
    }
    if (!weightEditPassword.trim()) return toast.error("Enter the admin password");
    setWeightEditBusy(true);
    try {
      const r = await api.post<Participant>(`/participants/${pendingWeightEdit.id}/weight`, {
        weight: value,
        admin_password: weightEditPassword.trim(),
      });
      setParticipants((rows) => rows.map((row) => (row.id === pendingWeightEdit.id ? { ...row, ...r.data } : row)));
      toast.success("Weight updated");
      closeWeightEditDialog();
    } catch (e: any) {
      if (e?.response?.status === 401) toast.error(e.response?.data?.detail ?? "Incorrect admin password");
      else toast.error("Could not update weight");
    } finally {
      setWeightEditBusy(false);
    }
  };

  const set = (k: keyof Participant, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const saveCoach = async () => {
    if (!coachForm.full_name?.trim()) return toast.error("Full name is required");
    if (!coachForm.team_id) return toast.error("Team is required");
    try {
      const payload = { ...coachForm, team_id: Number(coachForm.team_id) };
      if (coachForm.id) await api.put(`/coaches/${coachForm.id}`, payload);
      else await api.post("/coaches", payload);
      toast.success(coachForm.id ? "Coach updated" : "Coach added");
      setCoachOpen(false);
      load();
    } catch {
      toast.error("Could not save coach");
    }
  };

  const removeCoach = async (id: number) => {
    if (!confirm("Delete this coach/manager?")) return;
    await api.delete(`/coaches/${id}`);
    toast.success("Coach deleted");
    load();
  };

  const removeCoachPhoto = async (c: Coach) => {
    if (!confirm(`Remove ${c.full_name}'s photo?`)) return;
    try {
      await api.delete(`/coaches/${c.id}/photo`);
      setCoaches((rows) => rows.map((r) => (r.id === c.id ? { ...r, photo_url: null } : r)));
      toast.success("Photo removed");
    } catch {
      toast.error("Could not remove photo");
    }
  };

  const toggleCoachAttendance = async (c: Coach) => {
    if (c.is_present) {
      setPendingUnmark({ kind: "coach", id: c.id, name: c.full_name, role: c.role || "Coach" });
      return;
    }
    setCoaches((rows) => rows.map((r) => (r.id === c.id ? { ...r, is_present: true } : r)));
    try {
      await api.post(`/coaches/${c.id}/attendance`, { present: true });
    } catch {
      toast.error("Could not update attendance");
      setCoaches((rows) => rows.map((r) => (r.id === c.id ? { ...r, is_present: false } : r)));
    }
  };

  const closeUnmarkDialog = () => {
    setPendingUnmark(null);
    setUnmarkPassword("");
  };

  const confirmUnmark = async () => {
    if (!pendingUnmark) return;
    if (!unmarkPassword.trim()) return toast.error("Enter the admin password");
    setUnmarkBusy(true);
    try {
      const path =
        pendingUnmark.kind === "participant"
          ? `/participants/${pendingUnmark.id}/attendance`
          : `/coaches/${pendingUnmark.id}/attendance`;
      await api.post(path, { present: false, admin_password: unmarkPassword.trim() });
      if (pendingUnmark.kind === "participant") {
        setParticipants((rows) => rows.map((r) => (r.id === pendingUnmark.id ? { ...r, is_present: false } : r)));
      } else {
        setCoaches((rows) => rows.map((r) => (r.id === pendingUnmark.id ? { ...r, is_present: false } : r)));
      }
      toast.success(`${pendingUnmark.name} marked absent`);
      closeUnmarkDialog();
    } catch (e: any) {
      if (e?.response?.status === 401) toast.error(e.response?.data?.detail ?? "Incorrect admin password");
      else toast.error("Could not update attendance");
    } finally {
      setUnmarkBusy(false);
    }
  };

  const openActiveChange = (p: Participant, targetActive: boolean) => {
    setPendingActiveChange({ id: p.id, name: p.full_name, targetActive });
    setActivePassword("");
  };

  const closeActiveDialog = () => {
    setPendingActiveChange(null);
    setActivePassword("");
  };

  const confirmActiveChange = async () => {
    if (!pendingActiveChange) return;
    if (!activePassword.trim()) return toast.error("Enter the admin password");
    setActiveBusy(true);
    try {
      const r = await api.post<Participant>(`/participants/${pendingActiveChange.id}/active`, {
        is_active: pendingActiveChange.targetActive,
        admin_password: activePassword.trim(),
      });
      setParticipants((rows) =>
        rows.map((row) => (row.id === pendingActiveChange.id ? { ...row, ...r.data } : row)),
      );
      toast.success(
        `${pendingActiveChange.name} marked ${pendingActiveChange.targetActive ? "active" : "inactive"}`,
      );
      closeActiveDialog();
    } catch (e: any) {
      if (e?.response?.status === 401) toast.error(e.response?.data?.detail ?? "Incorrect admin password");
      else toast.error("Could not update active status");
    } finally {
      setActiveBusy(false);
    }
  };

  const setCoachField = (k: keyof Coach, v: string) => setCoachForm((f) => ({ ...f, [k]: v }));

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
            {view === "players" ? (
              <>
                {participants.length} registered athletes across {teams.length} delegations ·{" "}
                <span className="font-bold text-emerald-400 font-mono">{presentCount} Verified Present</span>
              </>
            ) : (
              <>
                {coaches.length} coaches/managers across {teams.length} delegations ·{" "}
                <span className="font-bold text-emerald-400 font-mono">{coachPresentCount} Verified Present</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "players" && canEdit && (
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
          {view === "players" && (
            <>
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
            </>
          )}
          {canEdit && view === "players" && (
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
          {canEdit && view === "coaches" && (
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setCoachForm(emptyCoach);
                setCoachOpen(true);
              }}
              data-testid="add-coach-btn"
              className="text-xs font-extrabold"
            >
              <Plus className="h-4 w-4" /> Add Coach / Manager
            </Button>
          )}
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="flex gap-2" data-testid="participants-view-tabs">
        <button
          onClick={() => setView("players")}
          data-testid="view-tab-players"
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
            view === "players" ? "bg-gold text-obsidian-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          Players ({participants.length})
        </button>
        <button
          onClick={() => setView("coaches")}
          data-testid="view-tab-coaches"
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
            view === "coaches" ? "bg-gold text-obsidian-950" : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          Coaches & Managers ({coaches.length})
        </button>
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

        {view === "players" && ageGroups.length > 0 && (
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
            <option value="present">
              Present Only ({view === "players" ? presentCount : coachPresentCount})
            </option>
            <option value="absent">
              Absent Only (
              {view === "players" ? participants.length - presentCount : coaches.length - coachPresentCount})
            </option>
          </Select>
        </div>

        <div className="ml-auto text-xs text-slate-400 font-mono hidden xl:block">
          {view === "players" ? filtered.length : filteredCoaches.length} Matches
        </div>
      </div>

      {/* PARTICIPANTS CONTENT */}
      {view === "players" ? (
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
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {p.photo_url ? (
                        <img
                          src={`${BASE_URL}${p.photo_url}`}
                          alt={p.full_name}
                          className="h-10 w-10 rounded-full object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 grid place-items-center text-slate-400 font-heading font-black text-xs shrink-0">
                          {p.full_name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-slate-500">
                          #{(page - 1) * PAGE_SIZE + i + 1}
                        </span>
                        <h3 className="font-heading font-bold text-white text-sm truncate">{p.full_name}</h3>
                        <p className="text-xs text-gold font-body truncate">{teamName(p.team_id)}</p>
                      </div>
                    </div>

                    {(canMarkAttendance && !teamInactive(p.team_id)) ? (
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

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Label className="!mb-0 text-[10px]">Weight (kg)</Label>
                    {(() => {
                      const cap = weightCapFor(p.age_group);
                      const draft = weightDraftFor(p);
                      const draftNum = Number(draft);
                      const overLimit = cap != null && draft !== "" && Number.isFinite(draftNum) && draftNum > cap;
                      if (p.weight != null) {
                        return (
                          <>
                            <Input
                              type="number"
                              value={String(p.weight)}
                              disabled
                              className={`h-7 w-20 text-xs ${overLimit ? "border-red-500 text-red-400" : ""}`}
                              data-testid={`participant-weight-mobile-${p.id}`}
                            />
                            {cap != null && (
                              <span className={`text-[10px] font-mono ${overLimit ? "text-red-400" : "text-slate-500"}`}>
                                / {cap} kg
                              </span>
                            )}
                            {canMarkAttendance && !teamInactive(p.team_id) && (
                              <button
                                type="button"
                                onClick={() => openWeightEdit(p)}
                                title="Change weight (admin password required)"
                                className="text-slate-400 hover:text-white"
                                data-testid={`participant-weight-mobile-edit-${p.id}`}
                              >
                                <Lock className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        );
                      }
                      return (
                        <>
                          <Input
                            type="number"
                            min={0}
                            step="0.1"
                            disabled={!canMarkAttendance || teamInactive(p.team_id) || savingWeightId === p.id}
                            value={draft}
                            onChange={(e) => setWeightDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                            onBlur={() => saveWeight(p)}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            placeholder={cap ? `≤ ${cap}` : "—"}
                            className={`h-7 w-20 text-xs ${overLimit ? "border-red-500 text-red-400" : ""}`}
                            data-testid={`participant-weight-mobile-${p.id}`}
                          />
                          {cap != null && (
                            <span className={`text-[10px] font-mono ${overLimit ? "text-red-400" : "text-slate-500"}`}>
                              / {cap} kg
                            </span>
                          )}
                        </>
                      );
                    })()}
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
                    <button
                      onClick={() => canEdit && openActiveChange(p, !(p.is_active ?? true))}
                      disabled={!canEdit}
                      data-testid={`active-toggle-mobile-${p.id}`}
                      title={(p.is_active ?? true) ? "Click to mark ID card inactive" : "Click to reactivate ID card"}
                    >
                      {(p.is_active ?? true) ? (
                        <Badge tone="live" size="sm">
                          Active
                        </Badge>
                      ) : (
                        <Badge tone="red" size="sm">
                          Inactive
                        </Badge>
                      )}
                    </button>
                  </div>

                  {/* PROFILE METADATA DETAILS */}
                  {(p.student_class || p.father_name || p.date_of_birth) && (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-400 font-body pt-0.5 border-t border-white/5">
                      {p.student_class && (
                        <span>Class: <strong className="text-slate-300 font-semibold">{p.student_class}</strong></span>
                      )}
                      {p.father_name && (
                        <span>Father: <strong className="text-slate-300 font-semibold">{p.father_name}</strong></span>
                      )}
                      {p.date_of_birth && (
                        <span className="font-mono text-[10px]">DOB: {p.date_of_birth}</span>
                      )}
                    </div>
                  )}

                  {p.notes && (
                    <p className="text-[11px] text-slate-400 italic font-body">
                      Note: {p.notes}
                    </p>
                  )}

                  <div className="border-t border-white/10 pt-2.5 flex gap-2">
                    <a
                      href={!(p.is_active ?? true) || teamInactive(p.team_id) ? undefined : `${BASE_URL}/api/export/idcards/participant/${p.id}.pdf`}
                      aria-disabled={!(p.is_active ?? true) || teamInactive(p.team_id)}
                      className={cn(
                        "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors",
                        (!(p.is_active ?? true) || teamInactive(p.team_id))
                          ? "border-white/10 bg-white/5 text-slate-500 cursor-not-allowed pointer-events-none"
                          : p.photo_url
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
                      )}
                      data-testid={`download-idcard-mobile-${p.id}`}
                    >
                      <IdCard className={cn("h-3.5 w-3.5", p.photo_url ? "text-emerald-400" : "text-red-400")} />
                      {(p.is_active ?? true) && !teamInactive(p.team_id) ? "Download ID Card" : "Inactive — No ID Card"}
                    </a>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => togglePhotoLock(p)}
                        data-testid={`photo-lock-mobile-${p.id}`}
                        title={p.photo_uploads_locked_effective ? "Photo uploads locked — click to unlock" : "Lock photo uploads"}
                      >
                        {p.photo_uploads_locked_effective ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Unlock className="h-3.5 w-3.5 text-slate-300" />}
                      </Button>
                    )}
                    {canEdit && p.photo_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => removePhoto(p)}
                        data-testid={`remove-photo-mobile-${p.id}`}
                        title="Remove Uploaded Photo"
                      >
                        <ImageOff className="h-3.5 w-3.5 text-red-400" />
                      </Button>
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
                    <TH>Weight (kg)</TH>
                    <TH>Attendance Verification</TH>
                    <TH>ID Card Status</TH>
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
                        {(() => {
                          const cap = weightCapFor(p.age_group);
                          const draft = weightDraftFor(p);
                          const draftNum = Number(draft);
                          const overLimit = cap != null && draft !== "" && Number.isFinite(draftNum) && draftNum > cap;
                          if (p.weight != null) {
                            return (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  value={String(p.weight)}
                                  disabled
                                  className={`h-8 w-20 text-xs ${overLimit ? "border-red-500 text-red-400" : ""}`}
                                  data-testid={`participant-weight-${p.id}`}
                                />
                                {cap != null && (
                                  <span className={`text-[10px] ${overLimit ? "text-red-400" : "text-slate-500"}`}>
                                    / {cap} kg
                                  </span>
                                )}
                                {canMarkAttendance && !teamInactive(p.team_id) && (
                                  <button
                                    type="button"
                                    onClick={() => openWeightEdit(p)}
                                    title="Change weight (admin password required)"
                                    className="text-slate-400 hover:text-white"
                                    data-testid={`participant-weight-edit-${p.id}`}
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min={0}
                                step="0.1"
                                disabled={!canMarkAttendance || teamInactive(p.team_id) || savingWeightId === p.id}
                                value={draft}
                                onChange={(e) =>
                                  setWeightDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                                }
                                onBlur={() => saveWeight(p)}
                                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                placeholder={cap ? `≤ ${cap}` : "—"}
                                className={`h-8 w-20 text-xs ${overLimit ? "border-red-500 text-red-400" : ""}`}
                                data-testid={`participant-weight-${p.id}`}
                              />
                              {cap != null && (
                                <span className={`text-[10px] ${overLimit ? "text-red-400" : "text-slate-500"}`}>
                                  / {cap} kg
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </TD>
                      <TD>
                        {(canMarkAttendance && !teamInactive(p.team_id)) ? (
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
                      <TD>
                        {canEdit ? (
                          <button
                            onClick={() => openActiveChange(p, !(p.is_active ?? true))}
                            data-testid={`active-toggle-${p.id}`}
                            className="inline-flex items-center hover:opacity-80 transition-opacity"
                            title={(p.is_active ?? true) ? "Click to mark ID card inactive" : "Click to reactivate ID card"}
                          >
                            {(p.is_active ?? true) ? (
                              <Badge tone="live" size="sm">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Active
                              </Badge>
                            ) : (
                              <Badge tone="red" size="sm">
                                <Circle className="h-3.5 w-3.5" /> Inactive
                              </Badge>
                            )}
                          </button>
                        ) : (p.is_active ?? true) ? (
                          <Badge tone="live" size="sm">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Active
                          </Badge>
                        ) : (
                          <Badge tone="red" size="sm">
                            <Circle className="h-3.5 w-3.5" /> Inactive
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={
                              (p.is_active ?? true) && !teamInactive(p.team_id)
                                ? `${BASE_URL}/api/export/idcards/participant/${p.id}.pdf`
                                : undefined
                            }
                            aria-disabled={!(p.is_active ?? true) || teamInactive(p.team_id)}
                            className={cn(
                              "inline-flex items-center justify-center gap-2 rounded-md font-body tracking-wide transition-colors h-8 w-8 p-0",
                              !(p.is_active ?? true)
                                ? "text-slate-600 cursor-not-allowed pointer-events-none"
                                : p.photo_url
                                ? "text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                                : "text-red-500 hover:bg-red-500/10 hover:text-red-400",
                            )}
                            data-testid={`download-idcard-${p.id}`}
                            title={
                              !(p.is_active ?? true) || teamInactive(p.team_id)
                                ? "Inactive — ID card not available"
                                : p.photo_url
                                ? "Download ID Card (PDF) — photo uploaded"
                                : "Download ID Card (PDF) — photo not uploaded"
                            }
                          >
                            <IdCard className="h-3.5 w-3.5" />
                          </a>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => togglePhotoLock(p)}
                              data-testid={`photo-lock-${p.id}`}
                              title={p.photo_uploads_locked_effective ? "Photo uploads locked — click to unlock" : "Lock photo uploads"}
                            >
                              {p.photo_uploads_locked_effective ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Unlock className="h-3.5 w-3.5 text-slate-300" />}
                            </Button>
                          )}
                          {canEdit && p.photo_url && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removePhoto(p)}
                              data-testid={`remove-photo-${p.id}`}
                              title="Remove Uploaded Photo"
                            >
                              <ImageOff className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          )}
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
      ) : (
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 py-16">
            <Spinner label="Loading coaches & managers…" />
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 p-6">
            <EmptyState
              title="No coaches or managers found"
              hint="Try clearing filters, or add a coach/manager manually."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {pagedCoaches.map((c, i) => (
                <div
                  key={c.id}
                  data-testid={`coach-card-${c.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {c.photo_url ? (
                        <img
                          src={`${BASE_URL}${c.photo_url}`}
                          alt={c.full_name}
                          className="h-10 w-10 rounded-full object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 grid place-items-center text-gold font-heading font-black text-xs shrink-0">
                          {c.full_name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-slate-500">
                          #{(page - 1) * PAGE_SIZE + i + 1}
                        </span>
                        <h3 className="font-heading font-bold text-white text-sm truncate">{c.full_name}</h3>
                        <p className="text-xs text-gold font-body truncate">{teamName(c.team_id)}</p>
                      </div>
                    </div>

                    {canMarkAttendance ? (
                      <button
                        onClick={() => toggleCoachAttendance(c)}
                        data-testid={`coach-attendance-toggle-mobile-${c.id}`}
                        title={c.is_present ? "Mark absent" : "Mark present"}
                        className="shrink-0"
                      >
                        {c.is_present ? (
                          <Badge tone="live" size="sm">
                            <CheckCircle2 className="h-3 w-3" /> Present
                          </Badge>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            <Circle className="h-3 w-3" /> Absent
                          </Badge>
                        )}
                      </button>
                    ) : c.is_present ? (
                      <Badge tone="live" size="sm">
                        <CheckCircle2 className="h-3 w-3" /> Present
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        <Circle className="h-3 w-3" /> Absent
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-1">
                    {c.role && (
                      <span className="rounded bg-gold/15 px-1.5 py-0.5 font-bold text-gold">{c.role}</span>
                    )}
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 px-1.5 py-0.5 font-mono text-slate-300 hover:text-gold transition-colors"
                        title="Call"
                      >
                        <Phone className="h-2.5 w-2.5 text-gold" />
                        {c.phone}
                      </a>
                    )}
                    {c.aadhaar_no && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-slate-300">
                        Aadhaar: {c.aadhaar_no}
                      </span>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 px-1.5 py-0.5 text-slate-300 hover:text-gold transition-colors"
                        title="Email"
                      >
                        <Mail className="h-2.5 w-2.5 text-slate-400" />
                        {c.email}
                      </a>
                    )}
                  </div>

                  {c.notes && (
                    <p className="text-[11px] text-slate-400 italic font-body pt-0.5">
                      Note: {c.notes}
                    </p>
                  )}

                  <div className="border-t border-white/10 pt-2.5 flex gap-2">
                    <a
                      href={teamInactive(c.team_id) ? undefined : `${BASE_URL}/api/export/idcards/coach/${c.id}.pdf`}
                      aria-disabled={teamInactive(c.team_id)}
                      className={cn(
                        "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition-colors",
                        c.photo_url
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
                      )}
                      data-testid={`download-coach-idcard-mobile-${c.id}`}
                    >
                      <IdCard className={cn("h-3.5 w-3.5", c.photo_url ? "text-emerald-400" : "text-red-400")} /> Download ID Card
                    </a>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => toggleCoachPhotoLock(c)}
                        data-testid={`coach-photo-lock-mobile-${c.id}`}
                        title={c.photo_uploads_locked_effective ? "Photo uploads locked — click to unlock" : "Lock photo uploads"}
                      >
                        {c.photo_uploads_locked_effective ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Unlock className="h-3.5 w-3.5 text-slate-300" />}
                      </Button>
                    )}
                    {canEdit && c.photo_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => removeCoachPhoto(c)}
                        data-testid={`remove-coach-photo-mobile-${c.id}`}
                        title="Remove Uploaded Photo"
                      >
                        <ImageOff className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    )}
                  </div>

                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setCoachForm(c);
                          setCoachOpen(true);
                        }}
                        data-testid={`edit-coach-mobile-${c.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => removeCoach(c.id)}
                        data-testid={`delete-coach-mobile-${c.id}`}
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
                    <TH>Full Name</TH>
                    <TH>Team / School</TH>
                    <TH>Role</TH>
                    <TH>Phone</TH>
                    <TH>Aadhaar No.</TH>
                    <TH>Email</TH>
                    <TH>Attendance Verification</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {pagedCoaches.map((c, i) => (
                    <TR key={c.id} data-testid={`coach-row-${c.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">
                        {(page - 1) * PAGE_SIZE + i + 1}
                      </TD>
                      <TD className="font-bold text-white text-sm">{c.full_name}</TD>
                      <TD className="text-slate-300 font-body text-xs">{teamName(c.team_id)}</TD>
                      <TD>
                        <span className="rounded bg-white/5 px-2 py-0.5 text-xs font-bold text-slate-300">
                          {c.role || "Coach"}
                        </span>
                      </TD>
                      <TD className="font-mono text-xs text-slate-400">{c.phone || "—"}</TD>
                      <TD className="font-mono text-xs text-slate-400">{c.aadhaar_no || "—"}</TD>
                      <TD className="text-xs text-slate-400">{c.email || "—"}</TD>
                      <TD>
                        {canMarkAttendance ? (
                          <button
                            onClick={() => toggleCoachAttendance(c)}
                            data-testid={`coach-attendance-toggle-${c.id}`}
                            className="inline-flex items-center hover:opacity-80 transition-opacity"
                            title={c.is_present ? "Click to mark absent" : "Click to mark present"}
                          >
                            {c.is_present ? (
                              <Badge tone="live" size="sm">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Present
                              </Badge>
                            ) : (
                              <Badge tone="neutral" size="sm">
                                <Circle className="h-3.5 w-3.5 text-slate-500" /> Absent
                              </Badge>
                            )}
                          </button>
                        ) : c.is_present ? (
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
                          <a
                            href={teamInactive(c.team_id) ? undefined : `${BASE_URL}/api/export/idcards/coach/${c.id}.pdf`}
                      aria-disabled={teamInactive(c.team_id)}
                            className={cn(
                              "inline-flex items-center justify-center gap-2 rounded-md font-body tracking-wide transition-colors h-8 w-8 p-0",
                              c.photo_url
                                ? "text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                                : "text-red-500 hover:bg-red-500/10 hover:text-red-400",
                            )}
                            data-testid={`download-coach-idcard-${c.id}`}
                            title={
                              c.photo_url
                                ? "Download ID Card (PDF) — photo uploaded"
                                : "Download ID Card (PDF) — photo not uploaded"
                            }
                          >
                            <IdCard className="h-3.5 w-3.5" />
                          </a>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => toggleCoachPhotoLock(c)}
                              data-testid={`coach-photo-lock-${c.id}`}
                              title={c.photo_uploads_locked_effective ? "Photo uploads locked — click to unlock" : "Lock photo uploads"}
                            >
                              {c.photo_uploads_locked_effective ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Unlock className="h-3.5 w-3.5 text-slate-300" />}
                            </Button>
                          )}
                          {canEdit && c.photo_url && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeCoachPhoto(c)}
                              data-testid={`remove-coach-photo-${c.id}`}
                              title="Remove Uploaded Photo"
                            >
                              <ImageOff className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setCoachForm(c);
                                setCoachOpen(true);
                              }}
                              data-testid={`edit-coach-${c.id}`}
                              title="Edit Coach/Manager Record"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeCoach(c.id)}
                              data-testid={`delete-coach-${c.id}`}
                              title="Delete Coach/Manager Record"
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
              data-testid="coach-pagination"
            >
              <span className="text-xs text-slate-400 font-body">
                Showing{" "}
                <strong className="text-white">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCoaches.length)}
                </strong>{" "}
                of <strong className="text-white">{filteredCoaches.length}</strong> coaches/managers
              </span>
              <div className="flex items-center justify-between gap-2 sm:justify-start">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  data-testid="coach-page-prev"
                  className="text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs font-mono font-bold text-gold px-2">
                  Page {page} / {coachPageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= coachPageCount}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="coach-page-next"
                  className="text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

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
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Father's Name</Label>
              <Input
                value={form.father_name ?? ""}
                onChange={(e) => set("father_name", e.target.value)}
                placeholder="e.g. Suresh Sharma"
              />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={form.date_of_birth ?? ""}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </div>
            <div>
              <Label>Class</Label>
              <Input
                value={form.student_class ?? ""}
                onChange={(e) => set("student_class", e.target.value)}
                placeholder="e.g. Class X"
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

      {/* ADD / EDIT COACH DIALOG */}
      <Dialog
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        title={coachForm.id ? "Edit Coach / Manager" : "Add Coach / Manager"}
        testId="coach-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Team Delegation *</Label>
            <Select
              value={coachForm.team_id ?? ""}
              onChange={(e) => setCoachField("team_id", e.target.value)}
              data-testid="coach-team-select"
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
              value={coachForm.full_name ?? ""}
              onChange={(e) => setCoachField("full_name", e.target.value)}
              placeholder="e.g. Suresh Kumar"
              data-testid="coach-name-input"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Role</Label>
              <Select
                value={coachForm.role ?? "Coach"}
                onChange={(e) => setCoachField("role", e.target.value)}
                data-testid="coach-role-select"
              >
                <option value="Coach">Coach</option>
                <option value="Manager">Manager</option>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={coachForm.phone ?? ""}
                onChange={(e) => setCoachField("phone", e.target.value)}
                placeholder="+91-XXXXXXXXXX"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Aadhaar No.</Label>
              <Input
                value={coachForm.aadhaar_no ?? ""}
                onChange={(e) => setCoachField("aadhaar_no", e.target.value)}
                placeholder="XXXX XXXX XXXX"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={coachForm.email ?? ""}
                onChange={(e) => setCoachField("email", e.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={coachForm.notes ?? ""}
              onChange={(e) => setCoachField("notes", e.target.value)}
              placeholder="Any relevant notes..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setCoachOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveCoach} data-testid="save-coach-btn">
              {coachForm.id ? "Update Coach/Manager" : "Save Coach/Manager"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="participants" onDone={load} />

      <Dialog
        open={!!pendingUnmark}
        onClose={closeUnmarkDialog}
        title="Confirm: Mark Absent"
        testId="unmark-attendance-dialog"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 font-body">
            This removes the member below from this team's registration-fee receipt. Requires an admin
            account's password to confirm.
          </p>
          <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 space-y-1">
            <p className="font-heading font-bold text-white">{pendingUnmark?.name}</p>
            <p className="text-xs text-slate-400">{pendingUnmark?.role}</p>
            <p className="font-mono text-sm text-gold">− Rs. 500 from receipt total</p>
          </div>
          <div>
            <Label>Admin Password</Label>
            <Input
              type="password"
              value={unmarkPassword}
              onChange={(e) => setUnmarkPassword(e.target.value)}
              data-testid="unmark-admin-password-input"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && confirmUnmark()}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={closeUnmarkDialog}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={confirmUnmark}
              disabled={unmarkBusy}
              data-testid="confirm-unmark-attendance-btn"
            >
              {unmarkBusy ? "Verifying…" : "Confirm Mark Absent"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!pendingWeightEdit}
        onClose={closeWeightEditDialog}
        title="Change Weight"
        testId="weight-edit-dialog"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 font-body">
            A weigh-in has already been recorded for {pendingWeightEdit?.name}. Changing it requires an admin
            account's password to confirm.
          </p>
          <div>
            <Label>New Weight (kg)</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={weightEditValue}
              onChange={(e) => setWeightEditValue(e.target.value)}
              data-testid="weight-edit-value-input"
              autoFocus
            />
          </div>
          <div>
            <Label>Admin Password</Label>
            <Input
              type="password"
              value={weightEditPassword}
              onChange={(e) => setWeightEditPassword(e.target.value)}
              data-testid="weight-edit-admin-password-input"
              onKeyDown={(e) => e.key === "Enter" && confirmWeightEdit()}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={closeWeightEditDialog}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={confirmWeightEdit}
              disabled={weightEditBusy}
              data-testid="confirm-weight-edit-btn"
            >
              {weightEditBusy ? "Verifying…" : "Confirm Change"}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!pendingActiveChange}
        onClose={closeActiveDialog}
        title={pendingActiveChange?.targetActive ? "Confirm: Reactivate Participant" : "Confirm: Mark Inactive"}
        testId="active-change-dialog"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 font-body">
            {pendingActiveChange?.targetActive
              ? "This restores the athlete's ID card to every download and export."
              : "This removes the athlete's ID card from every download and export (individual, team sheets, and bulk) — e.g. for a disqualification or withdrawal. Roster, attendance, weight and billing are unaffected."}{" "}
            Requires an admin account's password to confirm.
          </p>
          <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 space-y-1">
            <p className="font-heading font-bold text-white">{pendingActiveChange?.name}</p>
            <p className="text-xs text-slate-400">
              {pendingActiveChange?.targetActive ? "Will become Active" : "Will become Inactive"}
            </p>
          </div>
          <div>
            <Label>Admin Password</Label>
            <Input
              type="password"
              value={activePassword}
              onChange={(e) => setActivePassword(e.target.value)}
              data-testid="active-change-admin-password-input"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && confirmActiveChange()}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={closeActiveDialog}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={confirmActiveChange}
              disabled={activeBusy}
              data-testid="confirm-active-change-btn"
            >
              {activeBusy ? "Verifying…" : pendingActiveChange?.targetActive ? "Confirm Reactivate" : "Confirm Mark Inactive"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
