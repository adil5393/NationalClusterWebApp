import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Plus,
  Trash2,
  CalendarDays,
  Clock,
  MapPin,
  Activity,
  Search,
  Filter,
  Layers,
  Sparkles,
  CalendarCheck,
  CalendarOff,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select, SearchInput } from "@/components/ui/input";
import { Badge, Tone } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { useModuleAccess } from "@/lib/permissions";
import { MatchScheduleModal, MatT, MatchScheduleT } from "@/components/admin/MatchScheduleModal";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, Tone> = {
  ONGOING: "green",
  PAUSED: "amber",
  SCHEDULED: "blue",
  COMPLETED: "slate",
  CANCELLED: "red",
};

// Date & Time Display Helpers
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatScheduleTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${period}`;
}

function formatScheduleDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getSlotDurationMinutes(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

export default function MatGroundAssignment() {
  const { canEdit } = useModuleAccess("matches");
  const [mats, setMats] = useState<MatT[]>([]);
  const [matches, setMatches] = useState<MatchScheduleT[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMatName, setNewMatName] = useState("");
  const [creatingMat, setCreatingMat] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  // Modal State
  const [selectedMatch, setSelectedMatch] = useState<MatchScheduleT | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [matFilter, setMatFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<MatT[]>("/mats"),
      api.get<MatchScheduleT[]>("/matches", { params: { status: "SCHEDULED,ONGOING,PAUSED" } }),
    ])
      .then(([matsRes, matchesRes]) => {
        setMats(matsRes.data);
        setMatches(matchesRes.data.filter((m) => m.status !== "SCHEDULED" || (m.team_a_id && m.team_b_id)));
      })
      .catch((e: any) => {
        toast.error(e?.response?.data?.detail ?? "Could not load court assignments");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createMat = async () => {
    const name = newMatName.trim();
    if (!name) return;
    setCreatingMat(true);
    try {
      const r = await api.post<MatT>("/mats", { name });
      setMats((prev) => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewMatName("");
      toast.success(`${name} added`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not add mat/ground");
    } finally {
      setCreatingMat(false);
    }
  };

  const deleteMat = async (mat: MatT) => {
    if (!confirm(`Remove ${mat.name}? Any match currently assigned to it will show as unassigned.`)) return;
    try {
      await api.delete(`/mats/${mat.id}`);
      setMats((prev) => prev.filter((m) => m.id !== mat.id));
      setMatches((prev) => prev.map((m) => (m.mat_id === mat.id ? { ...m, mat_id: null, mat_name: null } : m)));
      toast.success(`${mat.name} removed`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not remove mat/ground");
    }
  };

  const assignMat = async (matchId: number, matId: string) => {
    setAssigningId(matchId);
    try {
      const r = await api.put<MatchScheduleT>(`/matches/${matchId}/mat`, { mat_id: matId ? Number(matId) : null });
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, mat_id: r.data.mat_id, mat_name: r.data.mat_name } : m))
      );
      toast.success(r.data.mat_name ? `Assigned to ${r.data.mat_name}` : "Mat unassigned");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update mat/ground");
    } finally {
      setAssigningId(null);
    }
  };

  const handleOpenScheduleModal = (match: MatchScheduleT) => {
    setSelectedMatch(match);
    setIsModalOpen(true);
  };

  const handleSaveSchedule = async (params: {
    matchId: number;
    matId?: number | null;
    scheduled_at: string | null;
    scheduled_end_at: string | null;
  }) => {
    try {
      const r = await api.put<MatchScheduleT>(`/matches/${params.matchId}/mat`, {
        mat_id: params.matId,
        scheduled_at: params.scheduled_at,
        scheduled_end_at: params.scheduled_end_at,
      });

      setMatches((prev) =>
        prev.map((m) =>
          m.id === params.matchId
            ? {
                ...m,
                mat_id: r.data.mat_id,
                mat_name: r.data.mat_name,
                scheduled_at: r.data.scheduled_at,
                scheduled_end_at: r.data.scheduled_end_at,
              }
            : m
        )
      );

      if (selectedMatch && selectedMatch.id === params.matchId) {
        setSelectedMatch((prev) => (prev ? { ...prev, ...r.data } : null));
      }

      if (params.scheduled_at) {
        toast.success("Match schedule slot saved");
      } else {
        toast.success("Schedule cleared");
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.detail ?? "Could not save schedule — check for overlapping fixtures";
      toast.error(errMsg);
      throw e;
    }
  };

  // Filter and group matches
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // Search text filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const teamA = (m.team_a_name || "").toLowerCase();
        const teamB = (m.team_b_name || "").toLowerCase();
        const tournament = (m.tournament_name || "").toLowerCase();
        const round = (m.round_name || "").toLowerCase();
        const mat = (m.mat_name || "").toLowerCase();
        const matchId = String(m.id);

        if (
          !teamA.includes(query) &&
          !teamB.includes(query) &&
          !tournament.includes(query) &&
          !round.includes(query) &&
          !mat.includes(query) &&
          !matchId.includes(query)
        ) {
          return false;
        }
      }

      // Mat filter
      if (matFilter === "UNASSIGNED" && m.mat_id !== null && m.mat_id !== undefined) return false;
      if (matFilter !== "ALL" && matFilter !== "UNASSIGNED" && String(m.mat_id) !== matFilter) return false;

      // Status filter
      if (statusFilter === "SCHEDULED" && (!m.scheduled_at || !m.scheduled_end_at)) return false;
      if (statusFilter === "UNSCHEDULED" && m.scheduled_at && m.scheduled_end_at) return false;
      if (statusFilter === "LIVE" && m.status !== "ONGOING" && m.status !== "PAUSED") return false;

      return true;
    });
  }, [matches, searchQuery, matFilter, statusFilter]);

  // Group filtered matches: tournament_name -> round_name -> matches[]
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, MatchScheduleT[]>>();
    for (const m of filteredMatches) {
      const tKey = m.tournament_name ?? "Unassigned Tournament";
      const rKey = m.pool_name ? `${m.round_name ?? "Round"} · ${m.pool_name}` : m.round_name ?? "Round";
      if (!map.has(tKey)) map.set(tKey, new Map());
      const roundMap = map.get(tKey)!;
      if (!roundMap.has(rKey)) roundMap.set(rKey, []);
      roundMap.get(rKey)!.push(m);
    }
    return map;
  }, [filteredMatches]);

  // Top Metrics
  const totalMatches = matches.length;
  const scheduledCount = matches.filter((m) => m.scheduled_at && m.scheduled_end_at).length;
  const unscheduledCount = totalMatches - scheduledCount;
  const matsCount = mats.length;

  return (
    <div data-testid="admin-mat-ground" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-gold" /> COURT & FIXTURE LOGISTICS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Mat / Ground Assignment
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body max-w-2xl">
            Register competition mats and grounds, allocate courts, and configure broadcast-ready time slots with
            automated overlap detection.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="text-xs font-bold gap-2">
          <RefreshCw className={cn("h-3.5 w-3.5 text-gold", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {/* METRIC OVERVIEW STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900/80 p-3.5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/5 text-slate-300 border border-white/10 shrink-0">
            <Layers className="h-5 w-5 text-slate-300" />
          </div>
          <div>
            <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-400">
              Active Fixtures
            </span>
            <p className="text-xl font-heading font-black text-white">{totalMatches}</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-obsidian-900/80 p-3.5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/10 text-gold border border-gold/30 shrink-0">
            <Activity className="h-5 w-5 text-gold" />
          </div>
          <div>
            <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-slate-400">
              Registered Mats
            </span>
            <p className="text-xl font-heading font-black text-gold">{matsCount}</p>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
            <CalendarCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-emerald-400/80">
              Scheduled Slots
            </span>
            <p className="text-xl font-heading font-black text-emerald-400">{scheduledCount}</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
            <CalendarOff className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-amber-400/80">
              Pending Slots
            </span>
            <p className="text-xl font-heading font-black text-amber-400">{unscheduledCount}</p>
          </div>
        </div>
      </div>

      {/* MAT / GROUND REGISTRY */}
      <div
        className="rounded-xl border border-white/10 bg-obsidian-900 shadow-sm p-4 space-y-3"
        data-testid="mat-registry"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-gold" /> Mats & Grounds Registry
            </h2>
            <p className="text-xs text-slate-400">
              Add all playing surfaces (e.g. Mat 1, Mat 2, Ground A) to enable scheduling.
            </p>
          </div>

          {canEdit && (
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                value={newMatName}
                onChange={(e) => setNewMatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createMat()}
                placeholder="e.g. Mat 1, Ground A"
                className="h-9 text-sm sm:w-60"
                data-testid="new-mat-name-input"
              />
              <Button
                size="sm"
                variant="gold"
                className="font-bold shrink-0"
                disabled={creatingMat || !newMatName.trim()}
                onClick={createMat}
                data-testid="add-mat-btn"
              >
                <Plus className="h-3.5 w-3.5" /> Add Court
              </Button>
            </div>
          )}
        </div>

        {mats.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No mats/grounds registered yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {mats.map((mat) => (
              <span
                key={mat.id}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-obsidian-950 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:border-white/20 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-gold/70" />
                {mat.name}
                {canEdit && (
                  <button
                    onClick={() => deleteMat(mat)}
                    className="text-slate-400 hover:text-red-400 transition-colors ml-1"
                    data-testid={`delete-mat-${mat.id}`}
                    title={`Remove ${mat.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SEARCH AND FILTERS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-obsidian-900/60 p-3">
        <div className="w-full sm:w-72">
          <SearchInput
            placeholder="Search teams, round, mat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            className="h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-heading">Mat:</span>
            <Select
              value={matFilter}
              onChange={(e) => setMatFilter(e.target.value)}
              className="h-8 text-xs w-36"
            >
              <option value="ALL">All Mats</option>
              <option value="UNASSIGNED">Unassigned Only</option>
              {mats.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-heading">Slot:</span>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 text-xs w-36"
            >
              <option value="ALL">All Fixtures</option>
              <option value="SCHEDULED">Scheduled Only</option>
              <option value="UNSCHEDULED">Pending Schedule</option>
              <option value="LIVE">Live / Active</option>
            </Select>
          </div>
        </div>
      </div>

      {/* MATCHES LIST */}
      {loading ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
          <Spinner label="Loading court match schedule…" />
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState
            title="No scheduled, ongoing, or paused matches right now"
            hint="Once fixtures are ready to play, they'll show up here for mat/ground assignment."
          />
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState
            title="No fixtures match your filters"
            hint="Try resetting your search query or mat filter."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([tournamentName, rounds]) => (
            <div
              key={tournamentName}
              className="rounded-xl border border-white/10 bg-obsidian-900 shadow-sm overflow-hidden"
            >
              <div className="border-b border-white/10 bg-obsidian-950 px-4 py-3 flex items-center justify-between">
                <h2 className="font-heading text-sm sm:text-base font-black uppercase tracking-wider text-white">
                  {tournamentName}
                </h2>
                <span className="text-xs font-mono font-bold text-gold">
                  {Array.from(rounds.values()).reduce((acc, list) => acc + list.length, 0)} Matches
                </span>
              </div>

              <div className="p-4 space-y-5">
                {Array.from(rounds.entries()).map(([roundName, roundMatches]) => (
                  <div key={roundName} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                      <h3 className="text-xs font-heading font-extrabold uppercase tracking-wider text-gold">
                        {roundName}
                      </h3>
                      <span className="text-[11px] text-slate-500 font-mono">({roundMatches.length})</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {roundMatches.map((m) => {
                        const isScheduled = Boolean(m.scheduled_at && m.scheduled_end_at);
                        const durationMins = getSlotDurationMinutes(m.scheduled_at, m.scheduled_end_at);

                        return (
                          <div
                            key={m.id}
                            data-testid={`mat-ground-match-${m.id}`}
                            className={cn(
                              "rounded-xl border border-white/10 bg-obsidian-950 p-4 space-y-3 transition-all hover:border-gold/40 hover:shadow-lg flex flex-col justify-between",
                              m.status === "ONGOING" && "border-emerald-500/40 bg-emerald-950/20"
                            )}
                          >
                            {/* CARD TOP INFO */}
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <Badge tone={STATUS_TONE[m.status] ?? "blue"} size="sm">
                                  {m.status}
                                </Badge>
                                <span className="font-mono text-[11px] text-slate-500">
                                  Match #{m.id}
                                </span>
                              </div>

                              {/* TEAMS MATCHUP */}
                              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                                    <span className="font-heading font-bold text-white truncate">
                                      {m.team_a_name ?? "TBD"}
                                    </span>
                                  </div>
                                </div>

                                <div className="border-t border-white/5 my-0.5" />

                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                                    <span className="font-heading font-bold text-white truncate">
                                      {m.team_b_name ?? "TBD"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {m.venue_name && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono truncate">
                                  <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
                                  <span className="truncate">{m.venue_name}</span>
                                </div>
                              )}
                            </div>

                            {/* CARD ACTIONS & ASSIGNMENT */}
                            <div className="space-y-2.5 pt-2 border-t border-white/10">
                              {/* MAT DROPDOWN */}
                              <div>
                                <label className="block text-[10px] font-heading font-bold uppercase tracking-wider text-slate-400 mb-1">
                                  Assigned Mat / Court
                                </label>
                                {canEdit ? (
                                  <Select
                                    value={m.mat_id ?? ""}
                                    onChange={(e) => assignMat(m.id, e.target.value)}
                                    disabled={assigningId === m.id || mats.length === 0}
                                    className="h-8 text-xs"
                                    data-testid={`mat-select-${m.id}`}
                                  >
                                    <option value="">— Unassigned —</option>
                                    {mats.map((mat) => (
                                      <option key={mat.id} value={mat.id}>
                                        {mat.name}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <p className="text-xs text-slate-300 font-mono">
                                    {m.mat_name || "Not yet assigned"}
                                  </p>
                                )}
                              </div>

                              {/* DATE & TIME SCHEDULE TRIGGER */}
                              <div>
                                <label className="block text-[10px] font-heading font-bold uppercase tracking-wider text-slate-400 mb-1">
                                  Date & Time Schedule
                                </label>

                                {isScheduled ? (
                                  <div className="rounded-lg border border-gold/30 bg-gold/5 p-2.5 space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="flex items-center gap-1 font-heading font-bold text-white">
                                        <CalendarDays className="h-3.5 w-3.5 text-gold" />
                                        {formatScheduleDate(m.scheduled_at)}
                                      </span>
                                      {durationMins && (
                                        <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-gold">
                                          {durationMins}m
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-slate-300">
                                      <span className="flex items-center gap-1 font-mono text-[11px] text-slate-300">
                                        <Clock className="h-3 w-3 text-gold" />
                                        {formatScheduleTime(m.scheduled_at)} – {formatScheduleTime(m.scheduled_end_at)}
                                      </span>
                                    </div>

                                    {canEdit && (
                                      <Button
                                        variant="outline"
                                        size="xs"
                                        className="w-full mt-1 text-[11px] font-bold border-gold/30 hover:bg-gold/15 hover:text-gold"
                                        onClick={() => handleOpenScheduleModal(m)}
                                        data-testid={`edit-schedule-${m.id}`}
                                      >
                                        Edit Time Slot
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  canEdit ? (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="w-full text-xs font-heading font-bold border-dashed border-white/20 text-slate-300 hover:border-gold hover:text-gold hover:bg-gold/10"
                                      onClick={() => handleOpenScheduleModal(m)}
                                      data-testid={`set-schedule-${m.id}`}
                                    >
                                      <CalendarDays className="h-3.5 w-3.5" /> Set Date & Time Slot
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-slate-500 italic">No schedule set</span>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SCHEDULE MODAL */}
      <MatchScheduleModal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedMatch(null);
        }}
        match={selectedMatch}
        mats={mats}
        onSave={handleSaveSchedule}
      />
    </div>
  );
}
