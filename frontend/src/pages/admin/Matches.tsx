import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Play, Pause, PlayCircle, Flag, Radio, Ban, Shuffle, Eye, ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { connectLive, matchChannel } from "@/lib/live";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Team { id: number; name: string }
interface Venue { id: number; name: string }
interface ParticipantT { team_id: number; age_group?: string | null; is_present?: boolean }
interface MatchT {
  id: number; tournament_id: number; tournament_name?: string | null; sport?: string | null; age_group?: string | null;
  round_id: number; round_name?: string | null; match_type?: string | null;
  team_a_id?: number | null; team_a_name?: string | null;
  team_b_id?: number | null; team_b_name?: string | null;
  source_match_a_id?: number | null; source_match_b_id?: number | null;
  venue_id?: number | null; venue_name?: string | null;
  scheduled_at?: string | null;
  status: string;
  team_a_score: number; team_b_score: number;
  winner_team_id?: number | null; winner_team_name?: string | null;
  started_at?: string | null; ended_at?: string | null; notes?: string | null;
}
interface RoundT {
  id: number; tournament_id: number; name: string; sequence: number;
  format?: "KNOCKOUT" | "LEAGUE" | null; source_round_id?: number | null;
  matches: MatchT[];
}
interface TournamentT {
  id: number; name: string; sport?: string | null; age_group?: string | null; status: string; notes?: string | null;
  round_count: number; match_count: number; rounds?: RoundT[];
}

interface TeamBrief { id: number; name: string }
interface BucketPoolStatusT {
  pool_id: number; pool_name: string; ready: boolean; pulled: boolean;
  qualifiers: TeamBrief[]; needs_tiebreak: boolean; tie_candidates: TeamBrief[]; tie_need: number;
}
interface BucketKnockoutStatusT { ready: boolean; blocking?: string | null; new_winners: TeamBrief[] }
interface BucketTeamT { id: number; name: string; source_pool_id?: number | null; source_pool_name?: string | null; seed_rank?: number | null }
interface BucketT {
  id: number; tournament_id: number; name: string;
  source_round_id: number; source_round_name?: string | null; source_format?: "KNOCKOUT" | "LEAGUE" | null;
  round_id?: number | null;
  teams: BucketTeamT[];
  pools: BucketPoolStatusT[] | null;
  knockout: BucketKnockoutStatusT | null;
}

const STATUS_TONE: Record<string, "neutral" | "coral" | "green" | "blue" | "amber" | "red" | "slate"> = {
  SCHEDULED: "blue", ONGOING: "green", PAUSED: "amber", COMPLETED: "slate", CANCELLED: "red", POSTPONED: "amber",
};

function PresentCount({ counts, teamId }: { counts: Record<number, { present: number; total: number }>; teamId: string }) {
  if (!teamId) return null;
  const c = counts[Number(teamId)];
  if (!c) return <p className="mt-1 text-xs text-slate-400">No participants registered</p>;
  const short = c.present === 0;
  return (
    <p className={`mt-1 text-xs font-semibold ${short ? "text-amber-600" : "text-emerald-600"}`}>
      {c.present} of {c.total} present
    </p>
  );
}

function matchLabel(m: MatchT) {
  if (m.notes === "Bye") return `${m.team_a_name ?? m.team_b_name} — Bye`;
  const a = m.team_a_name ?? (m.source_match_a_id ? `Winner of Match ${m.source_match_a_id}` : "TBD");
  const b = m.team_b_name ?? (m.source_match_b_id ? `Winner of Match ${m.source_match_b_id}` : "TBD");
  return `${a} vs ${b}`;
}

// Same trick as Participants.tsx: age_group is free text imported from the
// attendance list ("Under 14", "Under 17", ...), not a fixed vocabulary.
function ageGroupRank(g: string) {
  const m = g.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

// Mirrors backend _bracket_round_name — a client-side preview of the rounds
// generate-bracket will create, before actually calling the API.
function bracketRoundName(matchCount: number) {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semi Final";
  if (matchCount === 4) return "Quarter Final";
  return `Round of ${matchCount * 2}`;
}
// Same inference the backend falls back to for a legacy round with no
// explicit format: look at what its own matches are.
function roundFormat(r: RoundT): "KNOCKOUT" | "LEAGUE" | null {
  if (r.format) return r.format;
  return (r.matches[0]?.match_type as "KNOCKOUT" | "LEAGUE" | undefined) ?? null;
}

function bracketSizeFor(teamCount: number) {
  let bracketSize = 1;
  while (bracketSize < teamCount) bracketSize *= 2;
  return bracketSize;
}
function previewBracketRounds(teamCount: number): { name: string; matches: number }[] {
  if (teamCount < 2) return [];
  let bracketSize = bracketSizeFor(teamCount);
  const rounds: { name: string; matches: number }[] = [];
  let pairs = bracketSize / 2;
  while (pairs >= 1) {
    rounds.push({ name: bracketRoundName(pairs), matches: pairs });
    pairs = pairs / 2;
  }
  return rounds;
}

export default function Matches() {
  const { canEdit } = useModuleAccess("matches");
  const [tournaments, setTournaments] = useState<TournamentT[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [participants, setParticipants] = useState<ParticipantT[]>([]);
  const [live, setLive] = useState<MatchT[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TournamentT | null>(null);
  const [loading, setLoading] = useState(true);

  const [tOpen, setTOpen] = useState(false);
  const [tForm, setTForm] = useState<{ id?: number; name: string; sport: string; age_group: string; status: string; notes: string }>({ name: "", sport: "", age_group: "", status: "draft", notes: "" });

  const [rOpen, setROpen] = useState(false);
  const [rForm, setRForm] = useState({ name: "", sequence: "0" });

  const [mOpen, setMOpen] = useState(false);
  const [mRoundId, setMRoundId] = useState<number | null>(null);
  const [mForm, setMForm] = useState({ team_a_id: "", team_b_id: "", venue_id: "", scheduled_at: "", notes: "" });

  const [consoleMatchId, setConsoleMatchId] = useState<number | null>(null);

  const [bgOpen, setBgOpen] = useState(false);
  const [bgTeamIds, setBgTeamIds] = useState<number[]>([]);
  const [bgByeTeamIds, setBgByeTeamIds] = useState<number[]>([]);
  const [bgShuffle, setBgShuffle] = useState(true);
  const [bgWholeSeason, setBgWholeSeason] = useState(true);
  const [bgSaving, setBgSaving] = useState(false);

  const [bucketRoundId, setBucketRoundId] = useState<number | null>(null);

  const [collapsedRounds, setCollapsedRounds] = useState<Set<number>>(new Set());
  const toggleRoundCollapsed = (id: number) => {
    setCollapsedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [roundSearch, setRoundSearch] = useState<Record<number, string>>({});

  const [tab, setTab] = useState<"fixtures" | "league">("fixtures");

  const loadBase = () => {
    setLoading(true);
    Promise.all([
      api.get<TournamentT[]>("/tournaments"),
      api.get<Team[]>("/teams"),
      api.get<Venue[]>("/venues"),
      api.get<MatchT[]>("/matches", { params: { status: "ONGOING,PAUSED" } }),
      api.get<ParticipantT[]>("/participants"),
    ]).then(([t, tm, v, l, p]) => {
      setTournaments(t.data);
      setTeams(tm.data);
      setVenues(v.data);
      setLive(l.data);
      setParticipants(p.data);
      if (!selectedId && t.data.length > 0) setSelectedId(t.data[0].id);
    }).finally(() => setLoading(false));
  };
  useEffect(loadBase, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = (id: number) => {
    api.get<TournamentT>(`/tournaments/${id}`).then((r) => setDetail(r.data));
  };
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); setTab("fixtures"); }, [selectedId]);

  const refreshLive = () => api.get<MatchT[]>("/matches", { params: { status: "ONGOING,PAUSED" } }).then((r) => setLive(r.data));
  const refreshAll = () => { loadBase(); if (selectedId) loadDetail(selectedId); };

  const ageGroups = useMemo(() => {
    const set = new Set(participants.map((p) => p.age_group).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b));
  }, [participants]);

  // Teams eligible for the currently selected tournament's age group — a
  // tournament with no age_group is open to any team. Guards the match-builder
  // dropdowns; the backend enforces the same rule on save either way.
  const eligibleTeams = useMemo(() => {
    if (!detail?.age_group) return teams;
    const ids = new Set(participants.filter((p) => p.age_group === detail.age_group).map((p) => p.team_id));
    return teams.filter((t) => ids.has(t.id));
  }, [teams, participants, detail?.age_group]);

  // Matches are only meaningful between players who actually showed up — this
  // reads attendance marked on the Participants page, so the organizer can see
  // at a glance whether a team even has enough present players to play.
  const presentCounts = useMemo(() => {
    const map: Record<number, { present: number; total: number }> = {};
    for (const p of participants) {
      const row = map[p.team_id] ?? { present: 0, total: 0 };
      row.total += 1;
      if (p.is_present) row.present += 1;
      map[p.team_id] = row;
    }
    return map;
  }, [participants]);

  const liveByAgeGroup = useMemo(() => {
    const groups: Record<string, MatchT[]> = {};
    for (const m of live) {
      const key = m.age_group ?? "No Age Group";
      (groups[key] ??= []).push(m);
    }
    return Object.entries(groups).sort(([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b));
  }, [live]);

  // --- Tournaments ---
  const saveTournament = async () => {
    if (!tForm.name.trim()) return toast.error("Tournament name is required");
    try {
      const payload = { name: tForm.name, sport: tForm.sport || null, age_group: tForm.age_group || null, status: tForm.status, notes: tForm.notes || null };
      if (tForm.id) await api.put(`/tournaments/${tForm.id}`, payload);
      else {
        const r = await api.post<TournamentT>("/tournaments", payload);
        setSelectedId(r.data.id);
      }
      toast.success(tForm.id ? "Tournament updated" : "Tournament created");
      setTOpen(false);
      loadBase();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save tournament");
    }
  };
  const removeTournament = async (id: number) => {
    if (!confirm("Delete this tournament? All its rounds and matches go with it.")) return;
    await api.delete(`/tournaments/${id}`);
    toast.success("Deleted");
    if (selectedId === id) setSelectedId(null);
    loadBase();
  };

  // --- Rounds ---
  const saveRound = async () => {
    if (!selectedId || !rForm.name.trim()) return toast.error("Round name is required");
    try {
      await api.post(`/tournaments/${selectedId}/rounds`, { name: rForm.name, sequence: Number(rForm.sequence) || 0 });
      toast.success("Round added");
      setROpen(false);
      setRForm({ name: "", sequence: "0" });
      loadDetail(selectedId);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not add round");
    }
  };
  const removeRound = async (id: number) => {
    if (!confirm("Delete this round and its matches?")) return;
    await api.delete(`/rounds/${id}`);
    toast.success("Deleted");
    if (selectedId) loadDetail(selectedId);
  };

  // --- Generate bracket ---
  const openGenerateBracket = () => {
    setBgTeamIds(eligibleTeams.map((t) => t.id));
    setBgShuffle(true);
    setBgWholeSeason(true);
    setBgOpen(true);
  };
  const toggleBgTeam = (id: number) => {
    setBgTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setBgByeTeamIds((ids) => ids.filter((x) => x !== id)); // dropping a team clears any stale bye pick for it
  };
  const bgNumByes = bgTeamIds.length >= 2 ? bracketSizeFor(bgTeamIds.length) - bgTeamIds.length : 0;
  // Pre-fill the bye picks with however many are needed (rather than making
  // the organizer check dozens of boxes by hand, e.g. 31 of 33 teams) — they
  // can still swap any pick by unchecking one and checking another. Only
  // tops up/trims when the team list itself changes, never fights a manual
  // toggle.
  useEffect(() => {
    setBgByeTeamIds((ids) => {
      const valid = ids.filter((id) => bgTeamIds.includes(id));
      if (valid.length === bgNumByes) return valid;
      if (valid.length > bgNumByes) return valid.slice(0, bgNumByes);
      const remaining = bgTeamIds.filter((id) => !valid.includes(id));
      return [...valid, ...remaining.slice(0, bgNumByes - valid.length)];
    });
  }, [bgTeamIds, bgNumByes]);
  const toggleBgByeTeam = (id: number) => {
    setBgByeTeamIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= bgNumByes) return ids; // can't select more byes than the bracket needs
      return [...ids, id];
    });
  };
  const saveGenerateBracket = async (replace = false) => {
    if (!selectedId) return;
    if (bgTeamIds.length < 2) return toast.error("Pick at least 2 teams");
    if (bgByeTeamIds.length !== bgNumByes) return toast.error(`Select exactly ${bgNumByes} team(s) for the Round 1 bye`);
    const order = bgShuffle ? [...bgTeamIds].sort(() => Math.random() - 0.5) : bgTeamIds;
    setBgSaving(true);
    try {
      await api.post(`/tournaments/${selectedId}/generate-bracket`, { team_ids: order, replace, bye_team_ids: bgByeTeamIds, whole_season: bgWholeSeason });
      toast.success(bgWholeSeason ? "Bracket generated" : "Round 1 generated");
      setBgOpen(false);
      refreshAll();
    } catch (e: any) {
      if (e?.response?.status === 409) {
        if (confirm("This tournament already has fixtures. Delete them and regenerate?")) {
          await saveGenerateBracket(true);
          return;
        }
      } else {
        toast.error(e?.response?.data?.detail ?? "Could not generate bracket");
      }
    } finally {
      setBgSaving(false);
    }
  };

  // --- Matches (fixtures) ---
  const openAddMatch = (roundId: number) => {
    setMRoundId(roundId);
    setMForm({ team_a_id: "", team_b_id: "", venue_id: "", scheduled_at: "", notes: "" });
    setMOpen(true);
  };
  const saveMatch = async () => {
    if (!mRoundId) return;
    try {
      await api.post(`/rounds/${mRoundId}/matches`, {
        team_a_id: mForm.team_a_id ? Number(mForm.team_a_id) : null,
        team_b_id: mForm.team_b_id ? Number(mForm.team_b_id) : null,
        venue_id: mForm.venue_id ? Number(mForm.venue_id) : null,
        scheduled_at: mForm.scheduled_at || null,
        notes: mForm.notes || null,
      });
      toast.success("Match added");
      setMOpen(false);
      if (selectedId) loadDetail(selectedId);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not add match");
    }
  };
  const removeMatch = async (id: number) => {
    if (!confirm("Delete this fixture?")) return;
    await api.delete(`/matches/${id}`);
    toast.success("Deleted");
    refreshAll();
  };

  const startMatch = async (id: number) => {
    try {
      await api.post(`/matches/${id}/start`);
      toast.success("Match started");
      refreshAll();
      setConsoleMatchId(id);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not start match");
    }
  };

  return (
    <div className="min-w-0 max-w-full" data-testid="admin-matches">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-white lg:text-slate-950">Matches & Fixtures</h1>
          <p className="mt-1 text-sm text-slate-400 lg:text-slate-500">Tournaments, rounds, brackets, and live scoring.</p>
        </div>
        {canEdit && (
          <Button onClick={() => { setTForm({ name: "", sport: "", age_group: "", status: "draft", notes: "" }); setTOpen(true); }} data-testid="add-tournament-btn">
            <Plus className="h-4 w-4" /> New Tournament
          </Button>
        )}
      </div>

      {/* LIVE NOW */}
      <div className="mt-6 min-w-0 max-w-full rounded-lg border border-emerald-900 bg-emerald-950/40 p-4 lg:border-emerald-200 lg:bg-emerald-50/40">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-600" />
          <h2 className="font-heading text-sm font-bold text-white lg:text-slate-900">Ongoing Matches</h2>
          <span className="text-xs text-slate-400 lg:text-slate-500">({live.length})</span>
        </div>
        {live.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400 lg:text-slate-500">Nothing live right now.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {liveByAgeGroup.map(([group, matches]) => (
              <div key={group}>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{group} <span className="font-normal normal-case text-slate-400">({matches.length})</span></h3>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setConsoleMatchId(m.id)}
                      data-testid={`live-match-${m.id}`}
                    className="w-full min-w-0 overflow-hidden rounded-md border border-emerald-900 bg-obsidian p-3 text-left hover:border-emerald-500 hover:shadow-sm lg:border-slate-200 lg:bg-white lg:hover:border-emerald-300"
                    >
                      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                        <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                        <span className="truncate text-xs text-slate-400">{m.tournament_name ?? m.round_name}</span>
                      </div>
                      <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm font-bold text-white lg:text-slate-900">
                        <span className="truncate">{m.team_a_name ?? "TBD"}</span><span className="shrink-0">{m.team_a_score}</span>
                      </div>
                      <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm font-bold text-white lg:text-slate-900">
                        <span className="truncate">{m.team_b_name ?? "TBD"}</span><span className="shrink-0">{m.team_b_score}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? <div className="mt-6"><Spinner /></div> : tournaments.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-6 lg:border-slate-200 lg:bg-white">
          <EmptyState title="No tournaments yet" hint="Create one to start building fixtures." />
        </div>
      ) : (
        <div className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900 lg:border-slate-200 lg:bg-white">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-2 pt-2 lg:border-slate-200" data-testid="tournament-tabs">
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                data-testid={`tournament-tab-${t.id}`}
                className={`shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selectedId === t.id
                    ? "border-coral text-coral-600"
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:text-white lg:text-slate-500 lg:hover:border-slate-200 lg:hover:text-slate-800"
                }`}
              >
                {t.name}
                {t.age_group && <span className="ml-1.5 text-xs font-normal text-slate-400">· {t.age_group}</span>}
                <span className="ml-1.5 text-xs font-normal text-slate-400">({t.match_count})</span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-slate-800 p-3 lg:border-slate-200 lg:p-4">
            {detail && (
              <>
                <Badge tone={detail.status === "active" ? "green" : detail.status === "completed" ? "slate" : "neutral"}>{detail.status}</Badge>
                {detail.age_group && <Badge tone="coral">{detail.age_group}</Badge>}
                {detail.sport && <span className="text-xs text-slate-500">{detail.sport}</span>}
                {canEdit && (
                  <div className="grid w-full min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)] gap-1 sm:ml-auto sm:w-auto">
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setTForm({ id: detail.id, name: detail.name, sport: detail.sport ?? "", age_group: detail.age_group ?? "", status: detail.status, notes: detail.notes ?? "" }); setTOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeTournament(detail.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    <Button variant="outline" size="sm" className="min-w-0 px-1 text-[11px]" onClick={() => { setRForm({ name: "", sequence: String((detail.rounds?.length ?? 0) + 1) }); setROpen(true); }} data-testid="add-round-btn"><Plus className="h-3.5 w-3.5" /> Round</Button>
                    <Button variant="outline" size="sm" className="min-w-0 px-1 text-[11px]" onClick={openGenerateBracket} data-testid="generate-bracket-btn"><Shuffle className="h-3.5 w-3.5" /> Bracket</Button>
                  </div>
                )}
              </>
            )}
          </div>

          {detail && (
            <div className="flex gap-4 overflow-x-auto border-b border-slate-800 px-4 text-sm font-semibold lg:border-slate-200">
              <button onClick={() => setTab("fixtures")} className={`shrink-0 border-b-2 py-2.5 ${tab === "fixtures" ? "border-coral text-coral-600" : "border-transparent text-slate-400 hover:text-white lg:text-slate-500 lg:hover:text-slate-800"}`} data-testid="subtab-fixtures">
                Knockout / Fixtures
              </button>
              <button onClick={() => setTab("league")} className={`shrink-0 border-b-2 py-2.5 ${tab === "league" ? "border-coral text-coral-600" : "border-transparent text-slate-400 hover:text-white lg:text-slate-500 lg:hover:text-slate-800"}`} data-testid="subtab-league">
                League Setup
              </button>
            </div>
          )}

          {tab === "league" && detail && (
            <LeagueSetup
              tournamentId={detail.id}
              rounds={detail.rounds ?? []}
              teams={eligibleTeams}
              canEdit={canEdit}
              onOpenConsole={setConsoleMatchId}
              onChanged={refreshAll}
            />
          )}

          {tab === "fixtures" && (
          <div className="p-3 sm:p-4">
            {!detail || (detail.rounds ?? []).length === 0 ? (
              <EmptyState title="No rounds yet" hint="Add a round (e.g. Round 1, Quarter Final) to start scheduling matches." />
            ) : (
              <div className="space-y-4">
                {detail.rounds!.map((r) => {
                  const fmt = roundFormat(r);
                  // Only hide "Advance to Bucket" when this round already
                  // feeds a pre-built next round via placeholder slots (a
                  // whole-season Generate Bracket) — there, round 2+ already
                  // exists and pulling winners into a bucket would just be
                  // redundant. A bucket-created next round does NOT hide
                  // this: one source round can legitimately feed several
                  // buckets over time (e.g. Pool A's winners advance and
                  // start playing while Pool B is still finishing), so the
                  // button has to stay available to pull the rest in later.
                  const thisRoundMatchIds = new Set(r.matches.map((m) => m.id));
                  const hasPlaceholderNext = detail.rounds!.some((other) =>
                    other.id !== r.id && other.matches.some((m) =>
                      (m.source_match_a_id != null && thisRoundMatchIds.has(m.source_match_a_id)) ||
                      (m.source_match_b_id != null && thisRoundMatchIds.has(m.source_match_b_id))
                    )
                  );
                  const collapsed = collapsedRounds.has(r.id);
                  const query = (roundSearch[r.id] ?? "").trim().toLowerCase();
                  const filteredMatches = query
                    ? r.matches.filter((m) => m.team_a_name?.toLowerCase().includes(query) || m.team_b_name?.toLowerCase().includes(query))
                    : r.matches;
                  return (
                  <div key={r.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleRoundCollapsed(r.id)}
                        className="flex min-w-0 items-center gap-2 text-left"
                        data-testid={`toggle-round-${r.id}`}
                      >
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", collapsed && "-rotate-90")} />
                        <h3 className="font-heading text-sm font-bold text-white lg:text-slate-900">{r.name}</h3>
                        {fmt && <Badge tone={fmt === "LEAGUE" ? "blue" : "neutral"}>{fmt === "LEAGUE" ? "League" : "Knockout"}</Badge>}
                        <span className="text-xs font-normal text-slate-400">({r.matches.length})</span>
                      </button>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => openAddMatch(r.id)} data-testid={`add-match-${r.id}`}><Plus className="h-3.5 w-3.5" /> Match</Button>
                          {!hasPlaceholderNext && (
                            <Button variant="outline" size="sm" onClick={() => setBucketRoundId(r.id)} data-testid={`advance-round-${r.id}`}>
                              Advance to Bucket →
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => removeRound(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      )}
                    </div>
                    {!collapsed && r.matches.length > 0 && (
                      <div className="relative mt-2 max-w-xs">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                        <Input
                          value={roundSearch[r.id] ?? ""}
                          onChange={(e) => setRoundSearch((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Search team or school…"
                          className="h-8 border-white/10 bg-white/5 pl-8 text-xs text-slate-200 placeholder:text-slate-500 lg:border-slate-200 lg:bg-white lg:text-slate-900"
                          data-testid={`round-search-${r.id}`}
                        />
                      </div>
                    )}
                    {!collapsed && (r.matches.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-400">No matches in this round yet.</p>
                    ) : filteredMatches.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-400">No matches found for "{roundSearch[r.id]}".</p>
                    ) : (
                      <>
                      <div className="mt-1.5 grid gap-1.5 lg:hidden">
                        {filteredMatches.map((m, i) => (
                          <div key={m.id} className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-3" data-testid={`match-card-${m.id}`}>
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                              <div className="min-w-0"><p className="text-[10px] font-semibold leading-tight text-slate-500">#{i + 1}</p><p className="break-words text-sm font-bold leading-tight text-white">{matchLabel(m)}</p></div>
                              <div className="flex shrink-0 items-center gap-1"><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>{canEdit && m.status === "SCHEDULED" && m.team_a_id && m.team_b_id && <Button variant="outline" size="icon" className="h-7 w-7 border-white/15 bg-white/5 text-emerald-400 hover:bg-white/10" onClick={() => startMatch(m.id)} title="Start match"><Play className="h-3.5 w-3.5" /></Button>}{(m.status === "ONGOING" || m.status === "PAUSED") && <Button variant="outline" size="icon" className="h-7 w-7 border-white/15 bg-white/5 text-emerald-400 hover:bg-white/10" onClick={() => setConsoleMatchId(m.id)} title="Open live console"><Radio className="h-3.5 w-3.5" /></Button>}{canEdit && (m.status === "SCHEDULED" || m.status === "POSTPONED") && <Button variant="danger" size="icon" className="h-7 w-7 border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20" onClick={() => removeMatch(m.id)} title="Delete fixture"><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{m.venue_name ?? "No venue"}</span>
                              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{m.scheduled_at ? formatDate(m.scheduled_at) : "Not scheduled"}</span>
                              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{m.status === "SCHEDULED" || m.status === "POSTPONED" ? "Score pending" : `${m.team_a_score} – ${m.team_b_score}`}</span>
                            </div>
                            {m.winner_team_name && <p className="mt-1.5 truncate text-[11px] text-emerald-400">Winner: {m.winner_team_name}</p>}
                          </div>
                        ))}
                      </div>
                      <div className="hidden lg:block"><Table className="mt-2">
                        <THead><TR className="hover:bg-transparent"><TH>Fixture</TH><TH>Present</TH><TH>Venue</TH><TH>Scheduled</TH><TH>Status</TH><TH>Score</TH><TH className="text-right">Actions</TH></TR></THead>
                        <tbody>
                          {filteredMatches.map((m) => (
                            <TR key={m.id} data-testid={`match-row-${m.id}`}>
                              <TD className="font-semibold text-slate-800">{matchLabel(m)}{m.winner_team_name && <div className="text-xs font-normal text-emerald-600">Winner: {m.winner_team_name}</div>}</TD>
                              <TD className="text-xs text-slate-500">
                                {m.team_a_id && <div>{m.team_a_name}: {presentCounts[m.team_a_id] ? `${presentCounts[m.team_a_id].present}/${presentCounts[m.team_a_id].total}` : "—"}</div>}
                                {m.team_b_id && <div>{m.team_b_name}: {presentCounts[m.team_b_id] ? `${presentCounts[m.team_b_id].present}/${presentCounts[m.team_b_id].total}` : "—"}</div>}
                              </TD>
                              <TD className="text-slate-500">{m.venue_name ?? "—"}</TD>
                              <TD className="text-slate-500">{m.scheduled_at ? formatDate(m.scheduled_at) : "—"}</TD>
                              <TD><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge></TD>
                              <TD className="text-slate-700">{m.status === "SCHEDULED" || m.status === "POSTPONED" ? "—" : `${m.team_a_score} – ${m.team_b_score}`}</TD>
                              <TD>
                                <div className="flex justify-end gap-1">
                                  {canEdit && m.status === "SCHEDULED" && m.team_a_id && m.team_b_id && (
                                    <Button variant="ghost" size="icon" onClick={() => startMatch(m.id)} title="Start match" data-testid={`start-match-${m.id}`}><Play className="h-4 w-4 text-emerald-600" /></Button>
                                  )}
                                  {(m.status === "ONGOING" || m.status === "PAUSED") && (
                                    <Button variant="ghost" size="icon" onClick={() => setConsoleMatchId(m.id)} title="Open live console"><Radio className="h-4 w-4 text-emerald-600" /></Button>
                                  )}
                                  {canEdit && (m.status === "SCHEDULED" || m.status === "POSTPONED") && (
                                    <Button variant="ghost" size="icon" onClick={() => removeMatch(m.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                  )}
                                </div>
                              </TD>
                            </TR>
                          ))}
                        </tbody>
                      </Table></div>
                      </>
                    ))}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Tournament dialog */}
      <Dialog open={tOpen} onClose={() => setTOpen(false)} title={tForm.id ? "Edit Tournament" : "New Tournament"} testId="tournament-dialog">
        <div className="space-y-4">
          <div><Label>Name *</Label><Input value={tForm.name} onChange={(e) => setTForm((f) => ({ ...f, name: e.target.value }))} placeholder="Kabaddi — Boys Under 17" data-testid="tournament-name-input" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Sport</Label><Input value={tForm.sport} onChange={(e) => setTForm((f) => ({ ...f, sport: e.target.value }))} placeholder="Kabaddi" /></div>
            <div>
              <Label>Status</Label>
              <Select value={tForm.status} onChange={(e) => setTForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Age Group</Label>
            {ageGroups.length > 0 ? (
              <Select value={tForm.age_group} onChange={(e) => setTForm((f) => ({ ...f, age_group: e.target.value }))} data-testid="tournament-age-group-select">
                <option value="">No age group (open to all teams)</option>
                {ageGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            ) : (
              <Input value={tForm.age_group} onChange={(e) => setTForm((f) => ({ ...f, age_group: e.target.value }))} placeholder="e.g. Under 14 (leave blank to allow any team)" />
            )}
            <p className="mt-1 text-xs text-slate-400">Only teams with players registered in this age group can be added to this tournament's matches.</p>
          </div>
          <div><Label>Notes</Label><Textarea value={tForm.notes} onChange={(e) => setTForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setTOpen(false)}>Cancel</Button>
            <Button onClick={saveTournament} data-testid="save-tournament-btn">Save</Button>
          </div>
        </div>
      </Dialog>

      {/* Round dialog */}
      <Dialog open={rOpen} onClose={() => setROpen(false)} title="Add Round" testId="round-dialog">
        <div className="space-y-4">
          <div><Label>Name *</Label><Input value={rForm.name} onChange={(e) => setRForm((f) => ({ ...f, name: e.target.value }))} placeholder="Round 1, Quarter Final, Semi Final, Final…" data-testid="round-name-input" /></div>
          <div><Label>Order</Label><Input type="number" value={rForm.sequence} onChange={(e) => setRForm((f) => ({ ...f, sequence: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setROpen(false)}>Cancel</Button>
            <Button onClick={saveRound} data-testid="save-round-btn">Add Round</Button>
          </div>
        </div>
      </Dialog>

      {/* Match (fixture) dialog */}
      <Dialog open={mOpen} onClose={() => setMOpen(false)} title="Add Match" testId="match-dialog">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Leave a team blank if it depends on another match's winner — link that from the fixture tree later (bracket editing beyond direct picks is on the roadmap).</p>
          {detail?.age_group && (
            <p className="rounded-md bg-orange-50 px-3 py-2 text-xs font-semibold text-coral-600 ring-1 ring-orange-200">
              Only teams with players in "{detail.age_group}" are listed ({eligibleTeams.length} of {teams.length} teams).
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Team A</Label>
              <Select value={mForm.team_a_id} onChange={(e) => setMForm((f) => ({ ...f, team_a_id: e.target.value }))} data-testid="match-team-a-select">
                <option value="">TBD</option>
                {eligibleTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <PresentCount counts={presentCounts} teamId={mForm.team_a_id} />
            </div>
            <div>
              <Label>Team B</Label>
              <Select value={mForm.team_b_id} onChange={(e) => setMForm((f) => ({ ...f, team_b_id: e.target.value }))} data-testid="match-team-b-select">
                <option value="">TBD</option>
                {eligibleTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <PresentCount counts={presentCounts} teamId={mForm.team_b_id} />
            </div>
          </div>
          <div>
            <Label>Venue</Label>
            <Select value={mForm.venue_id} onChange={(e) => setMForm((f) => ({ ...f, venue_id: e.target.value }))}>
              <option value="">No venue</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          <div><Label>Scheduled</Label><Input type="datetime-local" value={mForm.scheduled_at} onChange={(e) => setMForm((f) => ({ ...f, scheduled_at: e.target.value }))} /></div>
          <div><Label>Notes</Label><Textarea value={mForm.notes} onChange={(e) => setMForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setMOpen(false)}>Cancel</Button>
            <Button onClick={saveMatch} data-testid="save-match-btn">Add Match</Button>
          </div>
        </div>
      </Dialog>

      {/* Generate bracket dialog */}
      <Dialog open={bgOpen} onClose={() => setBgOpen(false)} title="Generate Bracket" testId="generate-bracket-dialog">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Round 1 pairs up the selected teams right away. If the team count doesn't divide evenly, you choose
            which team(s) get a bye straight into round 2.
          </p>
          {detail?.age_group && (
            <p className="rounded-md bg-orange-50 px-3 py-2 text-xs font-semibold text-coral-600 ring-1 ring-orange-200">
              Only teams with players in "{detail.age_group}" are listed.
            </p>
          )}

          <div>
            <Label>Bracket Scope</Label>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBgWholeSeason(true)}
                data-testid="bracket-scope-whole"
                className={cn(
                  "rounded-md border p-2.5 text-left text-xs",
                  bgWholeSeason ? "border-coral bg-orange-50 ring-1 ring-coral" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <p className="font-bold text-slate-800">Whole season</p>
                <p className="mt-0.5 text-slate-500">Auto-create every round through the Final now, wired to fill in winners as matches complete.</p>
              </button>
              <button
                type="button"
                onClick={() => setBgWholeSeason(false)}
                data-testid="bracket-scope-first-round"
                className={cn(
                  "rounded-md border p-2.5 text-left text-xs",
                  !bgWholeSeason ? "border-coral bg-orange-50 ring-1 ring-coral" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <p className="font-bold text-slate-800">Round 1 only</p>
                <p className="mt-0.5 text-slate-500">Just build Round 1 — you'll pick each later round's format (Knockout or League) once it finishes.</p>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Teams ({bgTeamIds.length} selected)</Label>
            <div className="flex gap-2 text-xs">
              <button className="font-semibold text-coral-600" onClick={() => setBgTeamIds(eligibleTeams.map((t) => t.id))}>Select all</button>
              <button className="font-semibold text-slate-500" onClick={() => setBgTeamIds([])}>Clear</button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-2" data-testid="bracket-team-list">
            {eligibleTeams.map((t) => (
              <label key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={bgTeamIds.includes(t.id)} onChange={() => toggleBgTeam(t.id)} />
                {t.name}
              </label>
            ))}
            {eligibleTeams.length === 0 && <p className="p-2 text-sm text-slate-400">No eligible teams found.</p>}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={bgShuffle} onChange={(e) => setBgShuffle(e.target.checked)} />
            Shuffle team order (random draw)
          </label>

          {bgNumByes > 0 && (
            <div>
              <Label>
                Round 1 Byes ({bgByeTeamIds.length} of {bgNumByes} selected)
              </Label>
              <p className="mt-0.5 text-xs text-slate-500">
                {bgTeamIds.length} teams isn't a power of two — pick exactly {bgNumByes} team{bgNumByes === 1 ? "" : "s"} to advance straight to round 2 without playing in Round 1.
              </p>
              <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-slate-200 p-2" data-testid="bracket-bye-team-list">
                {eligibleTeams.filter((t) => bgTeamIds.includes(t.id)).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={bgByeTeamIds.includes(t.id)}
                      disabled={!bgByeTeamIds.includes(t.id) && bgByeTeamIds.length >= bgNumByes}
                      onChange={() => toggleBgByeTeam(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {bgTeamIds.length >= 2 && (
            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-bold text-slate-800">Preview:</span>{" "}
              {previewBracketRounds(bgTeamIds.length).map((r) => `${r.name} (${r.matches})`).join(" → ")}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBgOpen(false)}>Cancel</Button>
            <Button onClick={() => saveGenerateBracket(false)} disabled={bgSaving || bgTeamIds.length < 2 || bgByeTeamIds.length !== bgNumByes} data-testid="save-generate-bracket-btn">
              {bgSaving ? "Generating…" : "Generate Bracket"}
            </Button>
          </div>
        </div>
      </Dialog>

      {consoleMatchId && (
        <LiveConsole
          matchId={consoleMatchId}
          canEdit={canEdit}
          onClose={() => setConsoleMatchId(null)}
          onChanged={() => { refreshLive(); if (selectedId) loadDetail(selectedId); }}
        />
      )}

      {bucketRoundId !== null && selectedId && (
        <BucketDialog
          tournamentId={selectedId}
          roundId={bucketRoundId}
          onClose={() => setBucketRoundId(null)}
          onRoundCreated={() => { setBucketRoundId(null); refreshAll(); }}
        />
      )}
    </div>
  );
}

function LiveConsole({ matchId, canEdit, onClose, onChanged }: { matchId: number; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [m, setM] = useState<MatchT | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => api.get<MatchT>(`/matches/${matchId}`).then((r) => setM(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stop = connectLive(matchChannel(matchId), (evt) => {
      setM((prev) => prev ? { ...prev, status: evt.status, team_a_score: evt.team_a_score, team_b_score: evt.team_b_score, winner_team_id: evt.winner_team_id } : prev);
    });
    return stop;
  }, [matchId]);

  const score = async (team: "a" | "b", delta: number) => {
    try {
      // Update from the API response immediately. The WebSocket is still used
      // to keep every other open screen in sync, but it must not be the only
      // way this console reflects its own successful scoring tap.
      const response = await api.post<MatchT>(`/matches/${matchId}/score`, { team, delta });
      setM(response.data);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update score");
    }
  };
  const act = async (action: "pause" | "resume" | "cancel", label: string) => {
    try {
      await api.post(`/matches/${matchId}/${action}`);
      toast.success(label);
      load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? `Could not ${action} match`);
    }
  };
  const complete = async () => {
    if (!m) return;
    if (m.team_a_score === m.team_b_score) return toast.error("Scores are tied — resolve before completing");
    if (!confirm("End this match and declare the winner?")) return;
    try {
      await api.post(`/matches/${matchId}/complete`, {});
      toast.success("Match completed");
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not complete match");
    }
  };

  const leader = useMemo(() => {
    if (!m) return null;
    if (m.team_a_score === m.team_b_score) return null;
    return m.team_a_score > m.team_b_score ? "a" : "b";
  }, [m?.team_a_score, m?.team_b_score]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open onClose={onClose} title="Live Match Console" className="border-slate-800 bg-slate-900 lg:border-slate-200 lg:bg-white [&>div:first-child]:border-slate-800 [&>div:first-child_button]:text-slate-300 [&>div:first-child_button:hover]:bg-white/10 [&>div:first-child_h3]:text-white lg:[&>div:first-child]:border-slate-100 lg:[&>div:first-child_button]:text-slate-700 lg:[&>div:first-child_h3]:text-slate-950" testId="live-console">
      {loading || !m ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[m.status]}>{m.status === "ONGOING" ? "● LIVE" : m.status}</Badge>
            <span className="text-xs text-slate-400 lg:text-slate-500">{m.round_name}</span>
          </div>

          {(["a", "b"] as const).map((side) => {
            const name = side === "a" ? (m.team_a_name ?? "TBD") : (m.team_b_name ?? "TBD");
            const value = side === "a" ? m.team_a_score : m.team_b_score;
            const isLeader = leader === side;
            return (
              <div key={side} className={`flex items-center justify-between rounded-md border p-3 transition-colors ${isLeader ? "border-emerald-800 bg-emerald-950/40 lg:border-emerald-300 lg:bg-emerald-50" : "border-slate-800 bg-obsidian lg:border-slate-200 lg:bg-slate-50"}`}>
                <div className="flex items-center gap-2 truncate">
                  {isLeader && <Flag className="h-4 w-4 shrink-0 text-emerald-600" />}
                  <span className="truncate font-bold text-white lg:text-slate-900">{name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span key={value} className="w-10 text-right font-heading text-2xl font-black tabular-nums text-white lg:text-slate-950" data-testid={`console-score-${side}`}>{value}</span>
                  {canEdit && m.status === "ONGOING" && (
                    <div className="flex gap-1">
                      {[1, 2, 3].map((n) => (
                        <Button key={n} size="sm" variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 lg:border-slate-300 lg:bg-white lg:text-slate-900" onClick={() => score(side, n)} data-testid={`score-${side}-plus-${n}`}>+{n}</Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4 lg:border-slate-200">
              {m.status === "ONGOING" && <Button variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 lg:border-slate-300 lg:bg-white lg:text-slate-900" onClick={() => act("pause", "Match paused")}><Pause className="h-4 w-4" /> Pause</Button>}
              {m.status === "PAUSED" && <Button variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 lg:border-slate-300 lg:bg-white lg:text-slate-900" onClick={() => act("resume", "Match resumed")}><PlayCircle className="h-4 w-4" /> Resume</Button>}
              <Button variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 lg:border-slate-300 lg:bg-white lg:text-slate-900" onClick={() => act("cancel", "Match cancelled")}><Ban className="h-4 w-4" /> Cancel</Button>
              <Button onClick={complete} data-testid="end-match-btn"><Flag className="h-4 w-4" /> End Match</Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// Round-by-round advance flow: a finished round's advancing teams (knockout
// winners, or league pool qualifiers) get pulled into a Bucket over time —
// pool by pool as each finishes, no need to wait on the slower ones — and
// reviewed before the organizer, in a separate action, turns the bucket into
// a new round of whichever format. Building a Knockout round automatically
// cross-seeds pools (all pools' 1st qualifiers, then all 2nd qualifiers…) so
// two teams from the same pool are never paired together in Round 1.
function BucketDialog({ tournamentId, roundId, onClose, onRoundCreated }: {
  tournamentId: number; roundId: number; onClose: () => void; onRoundCreated: () => void;
}) {
  const [bucket, setBucket] = useState<BucketT | null>(null);
  const [loading, setLoading] = useState(true);
  const [tiePicks, setTiePicks] = useState<Record<number, number[]>>({});
  const [pullingPoolId, setPullingPoolId] = useState<number | null>(null);
  const [pullingKnockout, setPullingKnockout] = useState(false);

  const [format, setFormat] = useState<"KNOCKOUT" | "LEAGUE">("KNOCKOUT");
  const [name, setName] = useState("");
  const [byeTeamIds, setByeTeamIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.post<BucketT>(`/tournaments/${tournamentId}/rounds/${roundId}/bucket`)
      .then((r) => setBucket(r.data))
      .catch((e) => toast.error(e?.response?.data?.detail ?? "Could not load bucket"))
      .finally(() => setLoading(false));
  }, [tournamentId, roundId]);

  const bucketId = bucket?.id;
  const refresh = () => {
    if (bucketId) api.get<BucketT>(`/buckets/${bucketId}`).then((r) => setBucket(r.data));
  };

  const toggleTiePick = (poolId: number, teamId: number, need: number) => {
    setTiePicks((prev) => {
      const cur = prev[poolId] ?? [];
      if (cur.includes(teamId)) return { ...prev, [poolId]: cur.filter((x) => x !== teamId) };
      if (cur.length >= need) return prev;
      return { ...prev, [poolId]: [...cur, teamId] };
    });
  };

  const pullPool = async (p: BucketPoolStatusT) => {
    if (!bucketId) return;
    const picked = tiePicks[p.pool_id] ?? [];
    if (picked.length !== p.tie_need) return toast.error(`Pick ${p.tie_need} team(s) to resolve ${p.pool_name}'s tie first`);
    setPullingPoolId(p.pool_id);
    try {
      const team_ids = [...p.qualifiers.map((t) => t.id), ...picked];
      const r = await api.post<BucketT>(`/buckets/${bucketId}/pull`, { pool_id: p.pool_id, team_ids });
      setBucket(r.data);
      setTiePicks((prev) => { const next = { ...prev }; delete next[p.pool_id]; return next; });
      toast.success(`Pulled ${p.pool_name} into the bucket`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? `Could not pull ${p.pool_name}`);
    } finally {
      setPullingPoolId(null);
    }
  };

  const pullKnockoutWinners = async () => {
    if (!bucketId || !bucket?.knockout?.new_winners.length) return;
    setPullingKnockout(true);
    try {
      const team_ids = bucket.knockout.new_winners.map((t) => t.id);
      const r = await api.post<BucketT>(`/buckets/${bucketId}/pull`, { team_ids });
      setBucket(r.data);
      toast.success("Pulled winners into the bucket");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not pull winners");
    } finally {
      setPullingKnockout(false);
    }
  };

  const removeTeam = async (teamId: number) => {
    if (!bucketId) return;
    try {
      await api.delete(`/buckets/${bucketId}/teams/${teamId}`);
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not remove team");
    }
  };

  const bucketTeamCount = bucket?.teams.length ?? 0;
  const numByes = bucketTeamCount >= 2 ? bracketSizeFor(bucketTeamCount) - bucketTeamCount : 0;
  const toggleByeTeam = (id: number) => {
    setByeTeamIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= numByes) return ids;
      return [...ids, id];
    });
  };
  // Pre-fill the bye picks with however many are needed (rather than making
  // the organizer check dozens of boxes by hand) — they can still swap any
  // pick by unchecking one and checking another. Only tops up/trims when the
  // bucket's own team list changes, never fights a manual toggle.
  useEffect(() => {
    const bucketTeamIds = bucket?.teams.map((t) => t.id) ?? [];
    setByeTeamIds((ids) => {
      const valid = ids.filter((id) => bucketTeamIds.includes(id));
      if (valid.length === numByes) return valid;
      if (valid.length > numByes) return valid.slice(0, numByes);
      const remaining = bucketTeamIds.filter((id) => !valid.includes(id));
      return [...valid, ...remaining.slice(0, numByes - valid.length)];
    });
  }, [bucket, numByes]);

  const createRound = async () => {
    if (!bucketId) return;
    if (!name.trim()) return toast.error("Round name is required");
    if (bucketTeamCount < 2) return toast.error("Pull at least 2 teams into the bucket first");
    if (format === "KNOCKOUT" && byeTeamIds.length !== numByes) return toast.error(`Select exactly ${numByes} team(s) for the bye`);
    setCreating(true);
    try {
      await api.post(`/buckets/${bucketId}/create-round`, { name, format, bye_team_ids: format === "KNOCKOUT" ? byeTeamIds : [] });
      toast.success("Round created");
      onRoundCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create the round");
    } finally {
      setCreating(false);
    }
  };

  const bucketConsumed = bucket?.round_id != null;

  return (
    <Dialog open onClose={onClose} title={bucket ? bucket.name : "Bucket"} testId="bucket-dialog">
      {loading || !bucket ? <Spinner /> : bucketConsumed ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">This bucket has already been turned into a round.</p>
          <div className="flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Bucket ({bucketTeamCount} team{bucketTeamCount === 1 ? "" : "s"})</Label>
            {bucketTeamCount === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Nothing pulled in yet.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1" data-testid="bucket-teams">
                {bucket.teams.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    {t.name}{t.source_pool_name ? ` (${t.source_pool_name})` : ""}
                    <button onClick={() => removeTeam(t.id)} className="text-slate-400 hover:text-red-500" title="Remove">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {bucket.pools && (
            <div>
              <Label>Pools{bucket.source_round_name ? ` — ${bucket.source_round_name}` : ""}</Label>
              <p className="mt-0.5 text-xs text-slate-500">Pull a pool in as soon as it's finished — you don't have to wait on the others.</p>
              <div className="mt-1.5 space-y-2">
                {bucket.pools.map((p) => (
                  <div key={p.pool_id} className="rounded-md border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-800">{p.pool_name}</p>
                      {p.pulled ? <Badge tone="green">Pulled</Badge> : !p.ready ? <Badge tone="amber">In progress</Badge> : null}
                    </div>
                    {!p.pulled && p.ready && (
                      <>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.qualifiers.map((t) => (
                            <span key={t.id} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{t.name}</span>
                          ))}
                        </div>
                        {p.needs_tiebreak && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-amber-600">
                              Tie for the last qualifying spot — pick {p.tie_need} of {p.tie_candidates.length} ({(tiePicks[p.pool_id] ?? []).length} selected)
                            </p>
                            <div className="mt-1 space-y-0.5" data-testid={`tiebreak-pool-${p.pool_id}`}>
                              {p.tie_candidates.map((t) => (
                                <label key={t.id} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={(tiePicks[p.pool_id] ?? []).includes(t.id)}
                                    disabled={!(tiePicks[p.pool_id] ?? []).includes(t.id) && (tiePicks[p.pool_id]?.length ?? 0) >= p.tie_need}
                                    onChange={() => toggleTiePick(p.pool_id, t.id, p.tie_need)}
                                  />
                                  {t.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => pullPool(p)}
                            disabled={pullingPoolId === p.pool_id || (p.needs_tiebreak && (tiePicks[p.pool_id]?.length ?? 0) !== p.tie_need)}
                            data-testid={`pull-pool-${p.pool_id}`}
                          >
                            {pullingPoolId === p.pool_id ? "Pulling…" : "Pull into Bucket"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {bucket.knockout && (
            <div>
              <Label>Knockout Winners</Label>
              {!bucket.knockout.ready ? (
                <p className="mt-1 text-xs text-slate-500">{bucket.knockout.blocking ?? "Not finished yet."}</p>
              ) : bucket.knockout.new_winners.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">All current winners are already in the bucket.</p>
              ) : (
                <div className="mt-1.5">
                  <div className="flex flex-wrap gap-1">
                    {bucket.knockout.new_winners.map((t) => (
                      <span key={t.id} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{t.name}</span>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={pullKnockoutWinners} disabled={pullingKnockout} data-testid="pull-knockout-winners">
                      {pullingKnockout ? "Pulling…" : "Pull into Bucket"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {bucketTeamCount >= 2 ? (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <div><Label>New Round Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Round 2, Semi Final…" data-testid="advance-round-name-input" /></div>
              <div>
                <Label>Format</Label>
                <div className="mt-1 flex gap-2">
                  <Button type="button" variant={format === "KNOCKOUT" ? "primary" : "outline"} size="sm" onClick={() => setFormat("KNOCKOUT")} data-testid="advance-format-knockout">Knockout</Button>
                  <Button type="button" variant={format === "LEAGUE" ? "primary" : "outline"} size="sm" onClick={() => setFormat("LEAGUE")} data-testid="advance-format-league">League</Button>
                </div>
              </div>

              {format === "KNOCKOUT" && numByes > 0 && (
                <div>
                  <Label>Round 1 Byes ({byeTeamIds.length} of {numByes} selected)</Label>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {bucketTeamCount} teams isn't a power of two — pick exactly {numByes} team{numByes === 1 ? "" : "s"} to advance without playing.
                  </p>
                  <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-slate-200 p-2" data-testid="advance-bye-team-list">
                    {bucket.teams.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={byeTeamIds.includes(t.id)}
                          disabled={!byeTeamIds.includes(t.id) && byeTeamIds.length >= numByes}
                          onChange={() => toggleByeTeam(t.id)}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button
                  onClick={createRound}
                  disabled={creating || bucketTeamCount < 2 || (format === "KNOCKOUT" && byeTeamIds.length !== numByes)}
                  data-testid="save-advance-round-btn"
                >
                  {creating ? "Creating…" : "Create Round"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end pt-2"><Button variant="outline" onClick={onClose}>Close</Button></div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ============================================================================
// League Setup — pools, alongside the knockout system above. Pool matches are
// plain Match rows (match_type: "LEAGUE", pool_id set) that go through the
// exact same start/score/complete lifecycle as knockout matches, so match
// actions here call the same /matches/{id}/... endpoints and the same
// LiveConsole component reopens for them — nothing live-match-specific is
// duplicated for league play.
// ============================================================================

interface PoolT {
  id: number; round_id: number; name: string; status: "draft" | "finalized";
  team_count: number; match_count: number; expected_match_count: number; is_valid: boolean;
  teams: { id: number; name: string }[];
}
interface LeagueSummaryT {
  round_id: number; round_name: string;
  eligible_team_count: number; eligible_teams: { id: number; name: string }[]; assigned_team_count: number;
  unassigned_teams: { id: number; name: string }[];
  pool_count: number; pools: PoolT[];
  all_teams_assigned: boolean; all_pools_valid: boolean; fixtures_generated: boolean;
}
interface AutoPreviewT {
  pool_count: number;
  pools: { name: string; team_count: number; team_ids: number[]; teams: { id: number; name: string }[] }[];
}

function LeagueSetup({ tournamentId, rounds, teams, canEdit, onOpenConsole, onChanged }: {
  tournamentId: number; rounds: RoundT[]; teams: Team[]; canEdit: boolean;
  onOpenConsole: (id: number) => void; onChanged: () => void;
}) {
  // A knockout round never has pools — only offer rounds that are League (or
  // a legacy round with no format set yet) here.
  const leagueRounds = rounds.filter((r) => roundFormat(r) !== "KNOCKOUT");

  const [roundId, setRoundId] = useState<number | null>(leagueRounds[0]?.id ?? null);
  const [summary, setSummary] = useState<LeagueSummaryT | null>(null);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [autoPreview, setAutoPreview] = useState<AutoPreviewT | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [teamsPerPool, setTeamsPerPool] = useState("5");
  const [detailPoolId, setDetailPoolId] = useState<number | null>(null);

  useEffect(() => {
    if (!roundId && leagueRounds.length > 0) setRoundId(leagueRounds[0].id);
  }, [leagueRounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    if (!roundId) { setSummary(null); return; }
    setLoading(true);
    api.get<LeagueSummaryT>(`/tournaments/${tournamentId}/rounds/${roundId}/league-summary`)
      .then((r) => setSummary(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, [roundId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { load(); onChanged(); };

  const openAutoPreview = async () => {
    if (!roundId) return;
    const n = Number(teamsPerPool);
    if (!Number.isFinite(n) || n < 1) return toast.error("Enter a valid number of teams per pool");
    try {
      const r = await api.post<AutoPreviewT>(`/tournaments/${tournamentId}/rounds/${roundId}/pools/auto-create`, { commit: false, teams_per_pool: n });
      setAutoPreview(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not compute pool breakdown");
    }
  };
  const commitAutoCreate = async () => {
    if (!roundId) return;
    setAutoSaving(true);
    try {
      await api.post(`/tournaments/${tournamentId}/rounds/${roundId}/pools/auto-create`, { commit: true, teams_per_pool: Number(teamsPerPool) });
      toast.success("Pools created and fixtures generated");
      setAutoPreview(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create pools");
    } finally {
      setAutoSaving(false);
    }
  };

  const assignTeam = async (teamId: number, poolId: number) => {
    try {
      await api.post(`/pools/${poolId}/teams`, { team_id: teamId });
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not assign team");
    }
  };

  const finalizePool = async (pool: PoolT, regenerate: boolean) => {
    try {
      await api.post(`/pools/${pool.id}/finalize`, { regenerate });
      toast.success(pool.status === "finalized" ? "Fixtures regenerated" : "Fixtures generated");
      refresh();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409 && detail?.includes("already has fixtures")) {
        if (confirm("Changing teams will regenerate this pool's fixtures. Existing match data may be affected.\n\nRegenerate?")) {
          finalizePool(pool, true);
        }
      } else {
        toast.error(detail ?? "Could not finalize pool");
      }
    }
  };

  const deletePool = async (pool: PoolT) => {
    if (!confirm(`Delete ${pool.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/pools/${pool.id}`);
      toast.success("Pool deleted");
      refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete pool");
    }
  };

  return (
    <div className="p-3 sm:p-4" data-testid="league-setup">
      <div className="flex flex-wrap items-center gap-3">
        <Label>Round</Label>
        <Select value={roundId ?? ""} onChange={(e) => setRoundId(Number(e.target.value))} className="w-auto" data-testid="league-round-select">
          {leagueRounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </div>

      {leagueRounds.length === 0 ? (
        <div className="mt-4"><EmptyState title="No league rounds yet" hint="Add a round under Knockout / Fixtures, or advance an existing round into a League round, first — pools belong to a round." /></div>
      ) : loading || !summary ? (
        <div className="mt-4"><Spinner /></div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border border-slate-700 bg-slate-800/60 p-2.5 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 sm:border-slate-200 sm:bg-slate-50 sm:p-3 sm:text-sm" data-testid="league-summary">
            <span className="text-slate-300 lg:text-slate-600">Teams: <b className="text-white lg:text-slate-900">{summary.eligible_team_count}</b></span>
            <span className="text-slate-300 lg:text-slate-600">Assigned: <b className="text-white lg:text-slate-900">{summary.assigned_team_count}</b></span>
            <span className={summary.unassigned_teams.length > 0 ? "font-semibold text-amber-400 lg:text-amber-600" : "text-slate-300 lg:text-slate-600"}>
              Unassigned: <b>{summary.unassigned_teams.length}</b>
            </span>
            <span className="text-slate-300 lg:text-slate-600">Pools: <b className="text-white lg:text-slate-900">{summary.pool_count}</b></span>
            <span className="col-span-2 flex flex-wrap gap-x-3 gap-y-1 sm:ml-auto">
              <span className={summary.all_teams_assigned ? "text-emerald-400 lg:text-emerald-600" : "text-amber-400 lg:text-amber-600"}>{summary.all_teams_assigned ? "✓ All teams assigned" : `⚠ ${summary.unassigned_teams.length} unassigned`}</span>
              <span className={summary.all_pools_valid ? "text-emerald-400 lg:text-emerald-600" : "text-amber-400 lg:text-amber-600"}>{summary.all_pools_valid ? "✓ All pools valid" : "⚠ Some pools need ≥5 teams"}</span>
              <span className={summary.fixtures_generated ? "text-emerald-600" : "text-slate-400"}>{summary.fixtures_generated ? "✓ Fixtures generated" : "Fixtures not finalized"}</span>
            </span>
          </div>

          {canEdit && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
                <Label className="mb-0 shrink-0 whitespace-nowrap">Teams/Pool</Label>
                <Input
                  type="number"
                  min={1}
                  value={teamsPerPool}
                  onChange={(e) => setTeamsPerPool(e.target.value)}
                  disabled={autoPreview !== null}
                  className="h-8 w-16 px-2 text-xs"
                  data-testid="teams-per-pool-input"
                />
              </div>
              <Button size="sm" onClick={openAutoPreview} data-testid="auto-create-pools-btn"><Shuffle className="h-3.5 w-3.5" /> Auto Create</Button>
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} data-testid="create-pool-btn"><Plus className="h-3.5 w-3.5" /> Create Pool</Button>
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.pools.map((p) => (
              <div key={p.id} className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-3 lg:border-slate-200 lg:bg-white" data-testid={`pool-card-${p.id}`}>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0"><p className="text-[10px] font-semibold leading-tight text-slate-500">Pool</p><h4 className="truncate font-heading text-sm font-bold text-white lg:text-slate-900">{p.name}</h4></div>
                  <div className="flex shrink-0 items-center gap-1"><Badge tone={p.status === "finalized" ? "green" : "neutral"}>{p.status}</Badge><Button size="icon" variant="outline" className="h-7 w-7 border-white/15 bg-white/5 text-slate-200 hover:bg-white/10" onClick={() => setDetailPoolId(p.id)} title="View pool"><Eye className="h-3.5 w-3.5" /></Button>{canEdit && p.is_valid && p.team_count > 0 && <Button size="icon" variant="outline" className="h-7 w-7 border-white/15 bg-white/5 text-emerald-400 hover:bg-white/10" onClick={() => finalizePool(p, p.status === "finalized")} title={p.status === "finalized" ? "Regenerate fixtures" : "Finalize pool"}>{p.status === "finalized" ? <Shuffle className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</Button>}{canEdit && <Button size="icon" variant="danger" className="h-7 w-7 border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20" onClick={() => deletePool(p)} title="Delete pool"><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">{p.teams.slice(0, 2).map((t) => <span key={t.id} className="max-w-full truncate rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{t.name}</span>)}{p.teams.length > 2 && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">+{p.teams.length - 2} more</span>}{p.teams.length === 0 && <span className="text-[10px] text-slate-400">No teams yet</span>}</div>
                <div className="mt-1.5 flex flex-wrap gap-1"><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{p.team_count} teams</span><span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{p.status === "finalized" ? `${p.match_count} matches` : `${p.expected_match_count} matches`}</span></div>
                {!p.is_valid && <p className="mt-1 text-xs font-semibold text-amber-600">⚠ Needs at least 5 teams</p>}
              </div>
            ))}
            {summary.pools.length === 0 && (
              <div className="col-span-full"><EmptyState title="No pools yet" hint='Use "Auto Create Pools" or "Create Pool" above.' /></div>
            )}
          </div>

          <div className="mt-3 rounded-md border border-slate-700 bg-slate-800/60 p-2.5 lg:border-slate-200 lg:bg-white lg:p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 lg:text-slate-500">Unassigned Teams ({summary.unassigned_teams.length})</h4>
            {summary.unassigned_teams.length === 0 ? (
              <p className="mt-1.5 text-sm text-slate-400">None — every eligible team is in a pool.</p>
            ) : (
              <div className="mt-1 divide-y divide-slate-700 lg:divide-slate-100">
                {summary.unassigned_teams.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="truncate text-slate-200 lg:text-slate-700">{t.name}</span>
                    {canEdit && summary.pools.length > 0 && (
                      <select
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) assignTeam(t.id, Number(e.target.value)); e.target.value = ""; }}
                        data-testid={`assign-team-${t.id}`}
                      >
                        <option value="">Assign to pool…</option>
                        {summary.pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {createOpen && roundId && (
        <CreatePoolDialog
          tournamentId={tournamentId}
          roundId={roundId}
          teams={summary?.eligible_teams ?? teams}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); refresh(); }}
        />
      )}

      {autoPreview && (
        <Dialog open onClose={() => setAutoPreview(null)} title="Create Pools?" testId="auto-create-preview-dialog">
          <div className="space-y-3">
            <p className="text-sm text-slate-600">This will create {autoPreview.pool_count} pool{autoPreview.pool_count === 1 ? "" : "s"} from every unassigned eligible team and immediately generate round-robin fixtures for each.</p>
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {autoPreview.pools.map((p) => (
                <div key={p.name} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800">{p.name}</span>
                  <span className="text-slate-500">{p.team_count} teams</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAutoPreview(null)}>Cancel</Button>
              <Button onClick={commitAutoCreate} disabled={autoSaving} data-testid="confirm-auto-create-btn">{autoSaving ? "Creating…" : "Create Pools"}</Button>
            </div>
          </div>
        </Dialog>
      )}

      {detailPoolId && (
        <PoolDetailDialog
          poolId={detailPoolId}
          canEdit={canEdit}
          onClose={() => setDetailPoolId(null)}
          onOpenConsole={onOpenConsole}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function CreatePoolDialog({ tournamentId, roundId, teams, onClose, onCreated }: {
  tournamentId: number; roundId: number; teams: Team[]; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (id: number) => setTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async () => {
    if (!name.trim()) return toast.error("Pool name is required");
    setSaving(true);
    try {
      await api.post(`/tournaments/${tournamentId}/rounds/${roundId}/pools`, { name, team_ids: teamIds });
      toast.success("Pool created");
      onCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create pool");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Create Pool" testId="create-pool-dialog">
      <div className="space-y-4">
        <div><Label>Pool Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pool A" data-testid="pool-name-input" /></div>
        <div>
          <Label>Select Teams ({teamIds.length})</Label>
          <p className="mt-0.5 text-xs text-slate-500">A pool can exist empty while you're setting it up — teams need at least 5 total before it can be finalized.</p>
          <div className="mt-1.5 max-h-56 overflow-y-auto rounded-md border border-slate-200 p-2">
            {teams.map((t) => (
              <label key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggle(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="save-pool-btn">{saving ? "Creating…" : "Create Pool"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

interface StandingRow {
  team_id: number; team_name: string; played: number; won: number; lost: number; drawn: number;
  points_for: number; points_against: number; points: number; position: number;
}

function PoolDetailDialog({ poolId, canEdit, onClose, onOpenConsole, onChanged }: {
  poolId: number; canEdit: boolean; onClose: () => void; onOpenConsole: (id: number) => void; onChanged: () => void;
}) {
  const [pool, setPool] = useState<PoolT | null>(null);
  const [matches, setMatches] = useState<MatchT[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<PoolT>(`/pools/${poolId}`),
      api.get<MatchT[]>(`/pools/${poolId}/matches`),
      api.get<StandingRow[]>(`/pools/${poolId}/standings`),
    ]).then(([p, m, s]) => { setPool(p.data); setMatches(m.data); setStandings(s.data); }).finally(() => setLoading(false));
  };
  useEffect(load, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMatch = async (id: number) => {
    try {
      await api.post(`/matches/${id}/start`);
      load();
      onChanged();
      onOpenConsole(id);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not start match");
    }
  };

  const removeTeam = async (teamId: number) => {
    if (!confirm("Remove this team from the pool?")) return;
    try {
      await api.delete(`/pools/${poolId}/teams/${teamId}`);
      load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not remove team");
    }
  };

  return (
    <Dialog open onClose={onClose} title={pool ? pool.name : "Pool"} className="max-w-md border-slate-800 bg-slate-900 lg:max-w-3xl lg:border-slate-200 lg:bg-white [&>div:first-child]:border-slate-800 [&>div:first-child_button]:text-slate-300 [&>div:first-child_button:hover]:bg-white/10 [&>div:first-child_h3]:text-white lg:[&>div:first-child]:border-slate-100 lg:[&>div:first-child_button]:text-slate-700 lg:[&>div:first-child_h3]:text-slate-950" testId="pool-detail-dialog">
      {loading || !pool ? <Spinner /> : (
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 lg:text-slate-500">Teams</h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pool.teams.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 lg:border-slate-200 lg:bg-slate-50 lg:text-slate-900">
                  {t.name}
                  {canEdit && pool.status !== "finalized" && (
                    <button onClick={() => removeTeam(t.id)} className="text-slate-400 hover:text-red-400 lg:hover:text-red-500">×</button>
                  )}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 lg:text-slate-500">Fixtures ({matches.length})</h4>
            {matches.length === 0 ? (
              <p className="mt-1.5 text-sm text-slate-400">Not generated yet — finalize the pool first.</p>
            ) : (<>
              <div className="mt-1.5 grid gap-2 lg:hidden">
                {matches.map((m, i) => (
                  <div key={m.id} className="rounded-md border border-slate-800 bg-obsidian p-3 lg:border-slate-200 lg:bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold text-white lg:text-slate-800">{i + 1}. {m.team_a_name} <span className="text-slate-400">vs</span> {m.team_b_name}</p>
                      <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 lg:text-slate-500">{m.status === "SCHEDULED" ? "Score pending" : `${m.team_a_score} – ${m.team_b_score}`}</p>
                    <div className="mt-2 flex gap-2">
                      {canEdit && m.status === "SCHEDULED" && <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 lg:border-slate-300 lg:bg-white lg:text-slate-900" onClick={() => startMatch(m.id)}>Start</Button>}
                      {(m.status === "ONGOING" || m.status === "PAUSED") && <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 lg:border-slate-300 lg:bg-white lg:text-slate-900" onClick={() => onOpenConsole(m.id)}>Live</Button>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden lg:block"><Table className="mt-1.5">
                <THead><TR className="hover:bg-transparent"><TH>#</TH><TH>Fixture</TH><TH>Status</TH><TH>Score</TH><TH className="text-right">Actions</TH></TR></THead>
                <tbody>
                  {matches.map((m, i) => (
                    <TR key={m.id}>
                      <TD className="text-slate-400">{i + 1}</TD>
                      <TD className="font-semibold text-slate-800">{m.team_a_name} vs {m.team_b_name}</TD>
                      <TD><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge></TD>
                      <TD>{m.status === "SCHEDULED" ? "—" : `${m.team_a_score} – ${m.team_b_score}`}</TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          {canEdit && m.status === "SCHEDULED" && (
                            <Button size="sm" variant="outline" onClick={() => startMatch(m.id)}><Play className="h-3.5 w-3.5" /> Start</Button>
                          )}
                          {(m.status === "ONGOING" || m.status === "PAUSED") && (
                            <Button size="sm" variant="outline" onClick={() => onOpenConsole(m.id)}><Radio className="h-3.5 w-3.5 text-emerald-600" /> Open Live</Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table></div>
            </>)}
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 lg:text-slate-500">Standings</h4>
            {standings.every((s) => s.played === 0) ? (
              <p className="mt-1.5 text-sm text-slate-400">No completed matches yet.</p>
            ) : (<>
              <div className="mt-1.5 space-y-1.5 lg:hidden">
                {standings.map((s) => (
                  <div key={s.team_id} className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-obsidian px-3 py-2 text-sm lg:border-slate-200 lg:bg-white">
                    <span className="min-w-0 truncate font-semibold text-white lg:text-slate-800">{s.position}. {s.team_name}</span>
                    <span className="shrink-0 text-xs text-slate-400 lg:text-slate-500">P {s.played} · W {s.won} · {s.points} pts</span>
                  </div>
                ))}
              </div>
              <div className="hidden lg:block"><Table className="mt-1.5">
                <THead><TR className="hover:bg-transparent"><TH>#</TH><TH>Team</TH><TH className="text-right">P</TH><TH className="text-right">W</TH><TH className="text-right">L</TH><TH className="text-right">D</TH><TH className="text-right">PF</TH><TH className="text-right">PA</TH><TH className="text-right">Pts</TH></TR></THead>
                <tbody>
                  {standings.map((s) => (
                    <TR key={s.team_id}>
                      <TD className="text-slate-400">{s.position}</TD>
                      <TD className="font-semibold text-slate-800">{s.team_name}</TD>
                      <TD className="text-right">{s.played}</TD>
                      <TD className="text-right">{s.won}</TD>
                      <TD className="text-right">{s.lost}</TD>
                      <TD className="text-right">{s.drawn}</TD>
                      <TD className="text-right">{s.points_for}</TD>
                      <TD className="text-right">{s.points_against}</TD>
                      <TD className="text-right font-bold">{s.points}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table></div>
            </>)}
          </div>
        </div>
      )}
    </Dialog>
  );
}
