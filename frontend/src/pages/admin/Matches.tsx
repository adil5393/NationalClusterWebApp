import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Play,
  Pause,
  PlayCircle,
  Flag,
  Radio,
  Ban,
  Shuffle,
  Eye,
  ChevronDown,
  Search,
  Maximize2,
  Minimize2,
  Trophy,
  Shield,
  Activity,
  Calendar,
  Layers,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { connectLive, matchChannel } from "@/lib/live";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Team {
  id: number;
  name: string;
  is_active?: boolean;
  present_counts?: Record<string, number>;
}
interface Venue {
  id: number;
  name: string;
}
interface ParticipantT {
  team_id: number;
  age_group?: string | null;
  is_present?: boolean;
}
interface MatchT {
  id: number;
  tournament_id: number;
  tournament_name?: string | null;
  sport?: string | null;
  age_group?: string | null;
  round_id: number;
  round_name?: string | null;
  match_type?: string | null;
  pool_id?: number | null;
  pool_name?: string | null;
  team_a_id?: number | null;
  team_a_name?: string | null;
  team_b_id?: number | null;
  team_b_name?: string | null;
  source_match_a_id?: number | null;
  source_match_b_id?: number | null;
  venue_id?: number | null;
  venue_name?: string | null;
  scheduled_at?: string | null;
  status: string;
  team_a_score: number;
  team_b_score: number;
  winner_team_id?: number | null;
  winner_team_name?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  notes?: string | null;
}
interface RoundT {
  id: number;
  tournament_id: number;
  name: string;
  sequence: number;
  format?: "KNOCKOUT" | "LEAGUE" | null;
  source_round_id?: number | null;
  matches: MatchT[];
}
interface TournamentT {
  id: number;
  name: string;
  sport?: string | null;
  age_group?: string | null;
  status: string;
  notes?: string | null;
  min_present_players?: number;
  league_advance_count?: number;
  round_count: number;
  match_count: number;
  rounds?: RoundT[];
}

interface TeamBrief {
  id: number;
  name: string;
}
interface BucketPoolStatusT {
  pool_id: number;
  pool_name: string;
  ready: boolean;
  pulled: boolean;
  qualifiers: TeamBrief[];
  needs_tiebreak: boolean;
  tie_candidates: TeamBrief[];
  tie_need: number;
}
interface BucketKnockoutStatusT {
  ready: boolean;
  blocking?: string | null;
  new_winners: TeamBrief[];
}
interface BucketByesStatusT {
  new_byes: TeamBrief[];
}
interface BucketTeamT {
  id: number;
  name: string;
  source_pool_id?: number | null;
  source_pool_name?: string | null;
  seed_rank?: number | null;
  pushed_round_id?: number | null;
  pushed_round_name?: string | null;
}
interface BucketPushedRoundT {
  id: number;
  name: string;
  format: "KNOCKOUT" | "LEAGUE";
  team_count: number;
}
interface BucketT {
  id: number;
  tournament_id: number;
  name: string;
  source_round_id: number;
  source_round_name?: string | null;
  source_format?: "KNOCKOUT" | "LEAGUE" | null;
  teams: BucketTeamT[];
  pools: BucketPoolStatusT[] | null;
  byes: BucketByesStatusT | null;
  knockout: BucketKnockoutStatusT | null;
  pushed_rounds: BucketPushedRoundT[];
}

const STATUS_TONE: Record<string, "neutral" | "coral" | "green" | "blue" | "amber" | "red" | "slate"> = {
  SCHEDULED: "blue",
  ONGOING: "green",
  PAUSED: "amber",
  COMPLETED: "slate",
  CANCELLED: "red",
  POSTPONED: "amber",
};

const RED = "#ef4444";
const BLUE = "#3b82f6";

function PresentCount({
  counts,
  teamId,
}: {
  counts: Record<number, { present: number; total: number }>;
  teamId: string;
}) {
  if (!teamId) return null;
  const c = counts[Number(teamId)];
  if (!c) return <p className="mt-1 text-xs text-slate-400">No participants registered</p>;
  const short = c.present === 0;
  return (
    <p className={cn("mt-1 text-xs font-semibold font-mono", short ? "text-amber-400" : "text-emerald-400")}>
      {c.present} of {c.total} verified present
    </p>
  );
}

function matchLabel(m: MatchT) {
  if (m.notes === "Bye") return `${m.team_a_name ?? m.team_b_name} — Bye`;
  const a = m.team_a_name ?? (m.source_match_a_id ? `Winner of Match ${m.source_match_a_id}` : "TBD");
  const b = m.team_b_name ?? (m.source_match_b_id ? `Winner of Match ${m.source_match_b_id}` : "TBD");
  return `${a} vs ${b}`;
}

function RoundMatchesList({
  matches,
  presentCounts,
  canEdit,
  onStart,
  onOpenConsole,
  onRemove,
}: {
  matches: MatchT[];
  presentCounts: Record<number, { present: number; total: number }>;
  canEdit: boolean;
  onStart: (id: number) => void;
  onOpenConsole: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <>
      {/* MOBILE: CARD LIST */}
      <div className="mt-2 grid gap-2.5 lg:hidden">
        {matches.map((m, i) => (
          <div
            key={m.id}
            className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-obsidian-950 p-3.5 space-y-2 shadow-sm"
            data-testid={`match-card-${m.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-mono text-slate-500">#{i + 1}</span>
                <p className="font-heading font-bold text-white text-sm break-words">{matchLabel(m)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge tone={STATUS_TONE[m.status]} size="sm">
                  {m.status}
                </Badge>
                {canEdit && m.status === "SCHEDULED" && m.team_a_id && m.team_b_id && (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => onStart(m.id)}
                    title="Start match"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                )}
                {(m.status === "ONGOING" || m.status === "PAUSED") && (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => onOpenConsole(m.id)}
                    title="Open live console"
                  >
                    <Radio className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canEdit && (m.status === "SCHEDULED" || m.status === "POSTPONED") && (
                  <Button
                    variant="danger"
                    size="icon-sm"
                    onClick={() => onRemove(m.id)}
                    title="Delete fixture"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2 text-[11px] font-mono">
              <span className="rounded bg-white/5 px-2 py-0.5 text-slate-300">
                {m.venue_name ?? "No court assigned"}
              </span>
              <span className="rounded bg-white/5 px-2 py-0.5 text-slate-300">
                {m.scheduled_at ? formatDate(m.scheduled_at) : "Unscheduled"}
              </span>
              <span className="rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-gold font-bold">
                {m.status === "SCHEDULED" || m.status === "POSTPONED"
                  ? "Score pending"
                  : `${m.team_a_score} – ${m.team_b_score}`}
              </span>
            </div>

            {m.winner_team_name && (
              <p className="text-xs text-emerald-400 font-heading font-bold pt-1">
                Winner: {m.winner_team_name}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* DESKTOP: TABLE */}
      <div className="hidden lg:block">
        <Table className="mt-2">
          <THead>
            <TR>
              <TH>Match Fixture</TH>
              <TH>Squad Attendance</TH>
              <TH>Court Venue</TH>
              <TH>Scheduled Time</TH>
              <TH>Status</TH>
              <TH>Score</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {matches.map((m) => (
              <TR key={m.id} data-testid={`match-row-${m.id}`}>
                <TD className="font-heading font-bold text-white text-sm">
                  {matchLabel(m)}
                  {m.winner_team_name && (
                    <div className="text-xs font-semibold text-emerald-400 font-body">
                      Winner: {m.winner_team_name}
                    </div>
                  )}
                </TD>
                <TD className="text-xs text-slate-400 font-mono">
                  {m.team_a_id && (
                    <div>
                      {m.team_a_name}:{" "}
                      {presentCounts[m.team_a_id]
                        ? `${presentCounts[m.team_a_id].present}/${presentCounts[m.team_a_id].total}`
                        : "—"}
                    </div>
                  )}
                  {m.team_b_id && (
                    <div>
                      {m.team_b_name}:{" "}
                      {presentCounts[m.team_b_id]
                        ? `${presentCounts[m.team_b_id].present}/${presentCounts[m.team_b_id].total}`
                        : "—"}
                    </div>
                  )}
                </TD>
                <TD className="text-slate-300 font-body text-xs">{m.venue_name ?? "—"}</TD>
                <TD className="text-slate-400 font-mono text-xs">
                  {m.scheduled_at ? formatDate(m.scheduled_at) : "—"}
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[m.status]} size="sm">
                    {m.status}
                  </Badge>
                </TD>
                <TD className="font-heading font-bold text-white text-sm">
                  {m.status === "SCHEDULED" || m.status === "POSTPONED"
                    ? "—"
                    : `${m.team_a_score} – ${m.team_b_score}`}
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && m.status === "SCHEDULED" && m.team_a_id && m.team_b_id && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onStart(m.id)}
                        title="Start match"
                        data-testid={`start-match-${m.id}`}
                      >
                        <Play className="h-4 w-4 text-emerald-400" />
                      </Button>
                    )}
                    {(m.status === "ONGOING" || m.status === "PAUSED") && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onOpenConsole(m.id)}
                        title="Open live console"
                      >
                        <Radio className="h-4 w-4 text-emerald-400" />
                      </Button>
                    )}
                    {canEdit && (m.status === "SCHEDULED" || m.status === "POSTPONED") && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemove(m.id)}
                        title="Delete match"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}

function ageGroupRank(g: string) {
  const m = g.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function bracketRoundName(matchCount: number) {
  if (matchCount === 1) return "Final";
  if (matchCount === 2) return "Semi Final";
  if (matchCount === 4) return "Quarter Final";
  return `Round of ${matchCount * 2}`;
}

function teamUnplayableReason(t: Team, tournament: TournamentT | null | undefined): string | null {
  if (t.is_active === false) return "Inactive";
  if (!tournament?.age_group) return null;
  const threshold = tournament.min_present_players ?? 10;
  if (threshold <= 0) return null;
  const present = t.present_counts?.[tournament.age_group] ?? 0;
  if (present < threshold) return `${present} of ${threshold} present`;
  return null;
}

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
  const [tForm, setTForm] = useState<{
    id?: number;
    name: string;
    sport: string;
    age_group: string;
    status: string;
    notes: string;
    min_present_players: string;
    league_advance_count: string;
  }>({
    name: "",
    sport: "",
    age_group: "",
    status: "draft",
    notes: "",
    min_present_players: "10",
    league_advance_count: "2",
  });

  const [rOpen, setROpen] = useState(false);
  const [rForm, setRForm] = useState({ name: "", sequence: "0" });

  const [mOpen, setMOpen] = useState(false);
  const [mRoundId, setMRoundId] = useState<number | null>(null);
  const [mForm, setMForm] = useState({
    team_a_id: "",
    team_b_id: "",
    venue_id: "",
    scheduled_at: "",
    notes: "",
  });

  const [consoleMatchId, setConsoleMatchId] = useState<number | null>(null);

  const [bgOpen, setBgOpen] = useState(false);
  const [bgTeamIds, setBgTeamIds] = useState<number[]>([]);
  const [bgByeTeamIds, setBgByeTeamIds] = useState<number[]>([]);
  const [bgShuffle, setBgShuffle] = useState(true);
  const [bgWholeSeason, setBgWholeSeason] = useState(true);
  const [bgFormat, setBgFormat] = useState<"KNOCKOUT" | "LEAGUE">("KNOCKOUT");
  const [bgSaving, setBgSaving] = useState(false);

  const [bucketRoundId, setBucketRoundId] = useState<number | null>(null);

  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const toggleRoundCollapsed = (id: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [roundSearch, setRoundSearch] = useState<Record<number, string>>({});

  const [expandedPoolGroups, setExpandedPoolGroups] = useState<Set<string>>(new Set());
  const togglePoolGroupCollapsed = (key: string) => {
    setExpandedPoolGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [tab, setTab] = useState<"fixtures" | "league">("fixtures");

  const loadBase = () => {
    setLoading(true);
    Promise.all([
      api.get<TournamentT[]>("/tournaments"),
      api.get<Team[]>("/teams"),
      api.get<Venue[]>("/venues"),
      api.get<MatchT[]>("/matches", { params: { status: "ONGOING,PAUSED" } }),
      api.get<ParticipantT[]>("/participants"),
    ])
      .then(([t, tm, v, l, p]) => {
        setTournaments(t.data);
        setTeams(tm.data);
        setVenues(v.data);
        setLive(l.data);
        setParticipants(p.data);
        if (!selectedId && t.data.length > 0) setSelectedId(t.data[0].id);
      })
      .finally(() => setLoading(false));
  };
  useEffect(loadBase, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = (id: number) => {
    api.get<TournamentT>(`/tournaments/${id}`).then((r) => setDetail(r.data));
  };
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
    setTab("fixtures");
  }, [selectedId]);

  const refreshLive = () =>
    api
      .get<MatchT[]>("/matches", { params: { status: "ONGOING,PAUSED" } })
      .then((r) => setLive(r.data));
  const refreshAll = () => {
    loadBase();
    if (selectedId) loadDetail(selectedId);
  };

  const ageGroups = useMemo(() => {
    const set = new Set(participants.map((p) => p.age_group).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b));
  }, [participants]);

  const eligibleTeams = useMemo(() => {
    if (!detail?.age_group) return teams;
    const ids = new Set(
      participants.filter((p) => p.age_group === detail.age_group).map((p) => p.team_id),
    );
    return teams.filter((t) => ids.has(t.id));
  }, [teams, participants, detail?.age_group]);

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
    return Object.entries(groups).sort(
      ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
    );
  }, [live]);

  // --- Tournaments ---
  const saveTournament = async () => {
    if (!tForm.name.trim()) return toast.error("Tournament name is required");
    try {
      const payload = {
        name: tForm.name,
        sport: tForm.sport || null,
        age_group: tForm.age_group || null,
        status: tForm.status,
        notes: tForm.notes || null,
        min_present_players: Number(tForm.min_present_players) || 0,
        league_advance_count: Number(tForm.league_advance_count) === 1 ? 1 : 2,
      };
      if (tForm.id) await api.put(`/tournaments/${tForm.id}`, payload);
      else {
        const r = await api.post<TournamentT>("/tournaments", payload);
        setSelectedId(r.data.id);
      }
      toast.success(tForm.id ? "Tournament updated" : "Tournament created");
      setTOpen(false);
      refreshAll();
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
      await api.post(`/tournaments/${selectedId}/rounds`, {
        name: rForm.name,
        sequence: Number(rForm.sequence) || 0,
      });
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
    setBgTeamIds(eligibleTeams.filter((t) => !teamUnplayableReason(t, detail)).map((t) => t.id));
    setBgByeTeamIds([]);
    setBgShuffle(true);
    setBgWholeSeason(true);
    setBgFormat("KNOCKOUT");
    setBgOpen(true);
  };
  const toggleBgTeam = (id: number) => {
    setBgTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setBgByeTeamIds((ids) => ids.filter((x) => x !== id));
  };
  const bgNumByes =
    bgFormat === "KNOCKOUT" && bgTeamIds.length >= 2 ? bracketSizeFor(bgTeamIds.length) - bgTeamIds.length : 0;
  const bgMaxByes = bgFormat === "LEAGUE" ? Math.max(0, bgTeamIds.length - 2) : bgNumByes;
  useEffect(() => {
    if (bgFormat !== "KNOCKOUT") return;
    setBgByeTeamIds((ids) => {
      const valid = ids.filter((id) => bgTeamIds.includes(id));
      if (valid.length === bgNumByes) return valid;
      if (valid.length > bgNumByes) return valid.slice(0, bgNumByes);
      const remaining = bgTeamIds.filter((id) => !valid.includes(id));
      return [...valid, ...remaining.slice(0, bgNumByes - valid.length)];
    });
  }, [bgTeamIds, bgNumByes, bgFormat]);
  const toggleBgByeTeam = (id: number) => {
    setBgByeTeamIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= bgMaxByes) return ids;
      return [...ids, id];
    });
  };
  const saveGenerateBracket = async (replace = false) => {
    if (!selectedId) return;
    if (bgTeamIds.length < 2) return toast.error("Pick at least 2 teams");
    if (bgFormat === "KNOCKOUT" && bgByeTeamIds.length !== bgNumByes)
      return toast.error(`Select exactly ${bgNumByes} team(s) for the Round 1 bye`);
    if (bgFormat === "LEAGUE" && bgTeamIds.length - bgByeTeamIds.length < 2)
      return toast.error("At least 2 teams must play Round 1 — pick fewer byes");
    const order = bgShuffle ? [...bgTeamIds].sort(() => Math.random() - 0.5) : bgTeamIds;
    setBgSaving(true);
    try {
      await api.post(`/tournaments/${selectedId}/generate-bracket`, {
        team_ids: order,
        replace,
        bye_team_ids: bgByeTeamIds,
        whole_season: bgWholeSeason,
        format: bgFormat,
      });
      toast.success(
        bgFormat === "LEAGUE"
          ? "Round 1 generated"
          : bgWholeSeason
          ? "Bracket generated"
          : "Round 1 generated",
      );
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
  const refreshRoundAndLive = () => {
    refreshLive();
    if (selectedId) loadDetail(selectedId);
  };

  const removeMatch = async (id: number) => {
    if (!confirm("Delete this fixture?")) return;
    await api.delete(`/matches/${id}`);
    toast.success("Deleted");
    refreshRoundAndLive();
  };

  const startMatch = async (id: number) => {
    try {
      await api.post(`/matches/${id}/start`);
      toast.success("Match started");
      refreshRoundAndLive();
      setConsoleMatchId(id);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not start match");
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-6" data-testid="admin-matches">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            COMPETITION DESK & MATCH CONTROL
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Matches, Brackets & Live Scoring
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Manage tournament categories, knockout brackets, pool groups, and live arena scoreboards.
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              setTForm({
                name: "",
                sport: "",
                age_group: "",
                status: "draft",
                notes: "",
                min_present_players: "10",
                league_advance_count: "2",
              });
              setTOpen(true);
            }}
            data-testid="add-tournament-btn"
            className="text-xs font-extrabold"
          >
            <Plus className="h-4 w-4" /> New Tournament Category
          </Button>
        )}
      </div>

      {/* ONGOING MATCHES (LIVE NOW) */}
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-obsidian-900 to-obsidian-950 p-4 sm:p-5 shadow-lg space-y-3">
        <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
            <h2 className="font-heading text-sm font-black uppercase tracking-wider text-white">
              Courts in Action ({live.length})
            </h2>
          </div>
          {live.length > 0 && (
            <span className="text-xs text-emerald-400 font-mono font-bold">
              ● REAL-TIME TELEMETRY CONNECTED
            </span>
          )}
        </div>

        {live.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 italic">
            No matches are actively ongoing. Launch a scheduled match below to activate the live scoreboard console.
          </p>
        ) : (
          <div className="space-y-4">
            {liveByAgeGroup.map(([group, matches]) => (
              <div key={group} className="space-y-2">
                <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-gold flex items-center gap-1.5">
                  <span>{group}</span>
                  <span className="text-slate-500 font-mono">({matches.length} active)</span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setConsoleMatchId(m.id)}
                      data-testid={`live-match-${m.id}`}
                      className="w-full min-w-0 rounded-xl border border-emerald-500/40 bg-obsidian-950 p-3.5 text-left transition-all hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-500/10 space-y-2 group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <Badge tone={STATUS_TONE[m.status]} size="sm">
                          {m.status}
                        </Badge>
                        <span className="truncate text-slate-400 font-mono text-[11px]">
                          {m.tournament_name ?? m.round_name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-heading font-bold text-white">
                        <span className="truncate">{m.team_a_name ?? "TBD"}</span>
                        <span className="font-mono text-base font-black text-white group-hover:text-gold transition-colors">
                          {m.team_a_score}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-heading font-bold text-white">
                        <span className="truncate">{m.team_b_name ?? "TBD"}</span>
                        <span className="font-mono text-base font-black text-white group-hover:text-gold transition-colors">
                          {m.team_b_score}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono border-t border-white/5 pt-1.5">
                        <span>Click to open scoring desk →</span>
                        {m.venue_name && <span className="text-slate-400">{m.venue_name}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOURNAMENT DESK WORKSPACE */}
      {loading ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
          <Spinner label="Loading competition categories & fixtures…" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState
            title="No tournaments configured"
            hint="Create a tournament category to start generating brackets and league pools."
          />
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 shadow-md overflow-hidden">
          {/* TOURNAMENT TABS */}
          <div
            className="flex gap-2 overflow-x-auto border-b border-white/10 bg-obsidian-950 p-2 sm:px-4"
            data-testid="tournament-tabs"
          >
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                data-testid={`tournament-tab-${t.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-heading font-bold transition-all shrink-0",
                  selectedId === t.id
                    ? "bg-gold text-obsidian shadow-sm font-black"
                    : "text-slate-400 hover:text-white hover:bg-white/5",
                )}
              >
                <span>{t.name}</span>
                {t.age_group && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-mono",
                      selectedId === t.id
                        ? "bg-obsidian/20 text-obsidian font-bold"
                        : "bg-white/10 text-slate-300",
                    )}
                  >
                    {t.age_group}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    selectedId === t.id ? "text-obsidian/80 font-bold" : "text-slate-500",
                  )}
                >
                  ({t.match_count})
                </span>
              </button>
            ))}
          </div>

          {/* TOURNAMENT META & ACTIONS BAR */}
          {detail && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 p-4 sm:px-6 bg-obsidian-900">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    detail.status === "active"
                      ? "green"
                      : detail.status === "completed"
                      ? "slate"
                      : "neutral"
                  }
                  size="sm"
                >
                  {detail.status.toUpperCase()}
                </Badge>
                {detail.age_group && (
                  <Badge tone="gold" size="sm">
                    {detail.age_group}
                  </Badge>
                )}
                {detail.sport && (
                  <span className="text-xs font-heading font-bold text-slate-400">{detail.sport}</span>
                )}
                <span className="text-xs text-slate-400 font-mono">
                  · Min {detail.min_present_players ?? 10} players present
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  · {detail.league_advance_count ?? 2} advance per League pool
                </span>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTForm({
                        id: detail.id,
                        name: detail.name,
                        sport: detail.sport ?? "",
                        age_group: detail.age_group ?? "",
                        status: detail.status,
                        notes: detail.notes ?? "",
                        min_present_players: String(detail.min_present_players ?? 10),
                        league_advance_count: String(detail.league_advance_count ?? 2),
                      });
                      setTOpen(true);
                    }}
                    className="text-xs"
                    title="Edit Tournament Properties"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRForm({ name: "", sequence: String((detail.rounds?.length ?? 0) + 1) });
                      setROpen(true);
                    }}
                    data-testid="add-round-btn"
                    className="text-xs font-bold"
                  >
                    <Plus className="h-3.5 w-3.5 text-gold" /> Add Round
                  </Button>
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={openGenerateBracket}
                    data-testid="generate-bracket-btn"
                    className="text-xs font-black"
                  >
                    <Shuffle className="h-3.5 w-3.5" /> Generate Bracket / Pools
                  </Button>
                  <Button
                    variant="danger"
                    size="icon-sm"
                    onClick={() => removeTournament(detail.id)}
                    title="Delete Tournament Category"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* SUB-TABS: KNOCKOUT / FIXTURES VS LEAGUE SETUP */}
          {detail && (
            <div className="flex gap-4 border-b border-white/10 px-4 sm:px-6 text-xs font-heading font-bold bg-obsidian-950">
              <button
                onClick={() => setTab("fixtures")}
                className={cn(
                  "border-b-2 py-3 transition-colors",
                  tab === "fixtures"
                    ? "border-gold text-gold font-black"
                    : "border-transparent text-slate-400 hover:text-white",
                )}
                data-testid="subtab-fixtures"
              >
                Knockout Rounds & Fixtures
              </button>
              <button
                onClick={() => setTab("league")}
                className={cn(
                  "border-b-2 py-3 transition-colors",
                  tab === "league"
                    ? "border-gold text-gold font-black"
                    : "border-transparent text-slate-400 hover:text-white",
                )}
                data-testid="subtab-league"
              >
                League Pools & Groups Setup
              </button>
            </div>
          )}

          {/* LEAGUE SETUP SUBTAB */}
          {tab === "league" && detail && (
            <LeagueSetup
              tournamentId={detail.id}
              rounds={detail.rounds ?? []}
              teams={eligibleTeams}
              tournament={detail}
              canEdit={canEdit}
              onOpenConsole={setConsoleMatchId}
              onChanged={refreshRoundAndLive}
            />
          )}

          {/* FIXTURES SUBTAB */}
          {tab === "fixtures" && (
            <div className="p-4 sm:p-6">
              {!detail || (detail.rounds ?? []).length === 0 ? (
                <EmptyState
                  title="No competition rounds created yet"
                  hint="Add a round manually or click 'Generate Bracket / Pools' above."
                />
              ) : (
                <div className="space-y-6">
                  {detail.rounds!.map((r) => {
                    const fmt = roundFormat(r);
                    const thisRoundMatchIds = new Set(r.matches.map((m) => m.id));
                    const hasPlaceholderNext = detail.rounds!.some(
                      (other) =>
                        other.id !== r.id &&
                        other.matches.some(
                          (m) =>
                            (m.source_match_a_id != null &&
                              thisRoundMatchIds.has(m.source_match_a_id)) ||
                            (m.source_match_b_id != null &&
                              thisRoundMatchIds.has(m.source_match_b_id)),
                        ),
                    );
                    const collapsed = !expandedRounds.has(r.id);
                    const query = (roundSearch[r.id] ?? "").trim().toLowerCase();
                    const filteredMatches = query
                      ? r.matches.filter(
                          (m) =>
                            m.team_a_name?.toLowerCase().includes(query) ||
                            m.team_b_name?.toLowerCase().includes(query),
                        )
                      : r.matches;

                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-white/10 bg-obsidian-950 p-4 shadow-sm space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                          <button
                            type="button"
                            onClick={() => toggleRoundCollapsed(r.id)}
                            className="flex min-w-0 items-center gap-2 text-left"
                            data-testid={`toggle-round-${r.id}`}
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-gold transition-transform",
                                collapsed && "-rotate-90",
                              )}
                            />
                            <h3 className="font-heading text-base font-bold text-white">{r.name}</h3>
                            {fmt && (
                              <Badge tone={fmt === "LEAGUE" ? "blue" : "gold"} size="sm">
                                {fmt === "LEAGUE" ? "League Pool" : "Knockout Bracket"}
                              </Badge>
                            )}
                            <span className="text-xs text-slate-400 font-mono">
                              ({r.matches.length} matches)
                            </span>
                          </button>
                          {canEdit && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAddMatch(r.id)}
                                data-testid={`add-match-${r.id}`}
                                className="text-xs"
                              >
                                <Plus className="h-3.5 w-3.5 text-gold" /> Match
                              </Button>
                              {!hasPlaceholderNext && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setBucketRoundId(r.id)}
                                  data-testid={`advance-round-${r.id}`}
                                  className="text-xs font-bold text-emerald-400 hover:bg-emerald-500/10"
                                >
                                  Advance to Bucket →
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeRound(r.id)}
                                title="Delete Round"
                              >
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {!collapsed && r.matches.length > 0 && (
                          <div className="relative max-w-xs">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                            <Input
                              value={roundSearch[r.id] ?? ""}
                              onChange={(e) =>
                                setRoundSearch((prev) => ({ ...prev, [r.id]: e.target.value }))
                              }
                              placeholder="Search delegation or school…"
                              className="h-8 pl-8 text-xs"
                              data-testid={`round-search-${r.id}`}
                            />
                          </div>
                        )}

                        {!collapsed &&
                          (r.matches.length === 0 ? (
                            <p className="text-xs text-slate-400 py-3 italic">
                              No fixtures scheduled in this round yet.
                            </p>
                          ) : filteredMatches.length === 0 ? (
                            <p className="text-xs text-slate-400 py-3">
                              No fixtures found matching "{roundSearch[r.id]}".
                            </p>
                          ) : (
                            (() => {
                              const byPool = new Map<string, { name: string; matches: MatchT[] }>();
                              for (const m of filteredMatches) {
                                const key = m.pool_id != null ? String(m.pool_id) : "";
                                if (!byPool.has(key))
                                  byPool.set(key, {
                                    name: m.pool_name ?? "General Fixtures",
                                    matches: [],
                                  });
                                byPool.get(key)!.matches.push(m);
                              }
                              const pools = [...byPool.entries()].map(([key, v]) => ({
                                key,
                                ...v,
                              }));
                              const hasPoolMatches = pools.some((p) => p.key !== "");

                              if (!hasPoolMatches) {
                                return (
                                  <RoundMatchesList
                                    matches={filteredMatches}
                                    presentCounts={presentCounts}
                                    canEdit={canEdit}
                                    onStart={startMatch}
                                    onOpenConsole={setConsoleMatchId}
                                    onRemove={removeMatch}
                                  />
                                );
                              }
                              return (
                                <div className="space-y-4">
                                  {pools.map((p) => {
                                    const groupKey = `${r.id}:${p.key}`;
                                    const poolCollapsed = !expandedPoolGroups.has(groupKey);
                                    return (
                                      <div key={p.key || "none"} className="space-y-2">
                                        <button
                                          type="button"
                                          onClick={() => togglePoolGroupCollapsed(groupKey)}
                                          className="flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider text-gold"
                                          data-testid={`toggle-pool-group-${groupKey}`}
                                        >
                                          <ChevronDown
                                            className={cn(
                                              "h-3.5 w-3.5 shrink-0 transition-transform",
                                              poolCollapsed && "-rotate-90",
                                            )}
                                          />
                                          {p.name}{" "}
                                          <span className="font-mono text-slate-500 normal-case">
                                            ({p.matches.length} fixtures)
                                          </span>
                                        </button>
                                        {!poolCollapsed && (
                                          <RoundMatchesList
                                            matches={p.matches}
                                            presentCounts={presentCounts}
                                            canEdit={canEdit}
                                            onStart={startMatch}
                                            onOpenConsole={setConsoleMatchId}
                                            onRemove={removeMatch}
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()
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

      {/* TOURNAMENT MODAL */}
      <Dialog
        open={tOpen}
        onClose={() => setTOpen(false)}
        title={tForm.id ? "Edit Tournament Category" : "New Tournament Category"}
        testId="tournament-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Category Title *</Label>
            <Input
              value={tForm.name}
              onChange={(e) => setTForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Kabaddi — Boys Under 17"
              data-testid="tournament-name-input"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Sport Discipline</Label>
              <Input
                value={tForm.sport}
                onChange={(e) => setTForm((f) => ({ ...f, sport: e.target.value }))}
                placeholder="Kabaddi"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={tForm.status}
                onChange={(e) => setTForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Age Group Restriction</Label>
            {ageGroups.length > 0 ? (
              <Select
                value={tForm.age_group}
                onChange={(e) => setTForm((f) => ({ ...f, age_group: e.target.value }))}
                data-testid="tournament-age-group-select"
              >
                <option value="">No age group (Open to all squads)</option>
                {ageGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                value={tForm.age_group}
                onChange={(e) => setTForm((f) => ({ ...f, age_group: e.target.value }))}
                placeholder="e.g. Under 14"
              />
            )}
            <p className="mt-1 text-xs text-slate-400">
              Only squads registered in this age group will appear in match schedule builders.
            </p>
          </div>
          <div>
            <Label>Minimum Present Players Required</Label>
            <Input
              type="number"
              min={0}
              value={tForm.min_present_players}
              onChange={(e) =>
                setTForm((f) => ({ ...f, min_present_players: e.target.value }))
              }
              data-testid="tournament-min-present-input"
            />
            <p className="mt-1 text-xs text-slate-400 font-mono">
              Squads need this many checked-in athletes to start a match. Set to 0 to disable.
            </p>
          </div>
          <div>
            <Label>League Pool Qualifiers</Label>
            <Select
              value={tForm.league_advance_count}
              onChange={(e) => setTForm((f) => ({ ...f, league_advance_count: e.target.value }))}
              data-testid="tournament-league-advance-select"
            >
              <option value="1">1 team per pool (winner only)</option>
              <option value="2">2 teams per pool (winner + runner-up)</option>
            </Select>
            <p className="mt-1 text-xs text-slate-400 font-mono">
              How many teams advance from each League pool into the next Knockout round. Pools are
              paired 1st-vs-last, 2nd-vs-2nd-last, etc. — with 2 qualifiers, winners cross against the
              mirrored pool's runner-up.
            </p>
          </div>
          <div>
            <Label>Category Notes</Label>
            <Textarea
              value={tForm.notes}
              onChange={(e) => setTForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setTOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveTournament} data-testid="save-tournament-btn">
              Save Category
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ROUND MODAL */}
      <Dialog open={rOpen} onClose={() => setROpen(false)} title="Add Competition Round" testId="round-dialog">
        <div className="space-y-4">
          <div>
            <Label>Round Title *</Label>
            <Input
              value={rForm.name}
              onChange={(e) => setRForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Round 1, Quarter Final, Semi Final, Final…"
              data-testid="round-name-input"
            />
          </div>
          <div>
            <Label>Sequence Order Number</Label>
            <Input
              type="number"
              value={rForm.sequence}
              onChange={(e) => setRForm((f) => ({ ...f, sequence: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setROpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveRound} data-testid="save-round-btn">
              Add Round
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ADD FIXTURE MODAL */}
      <Dialog open={mOpen} onClose={() => setMOpen(false)} title="Schedule Match Fixture" testId="match-dialog">
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Leave squad selections as TBD if they advance from earlier rounds.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Team A (Red Side)</Label>
              <Select
                value={mForm.team_a_id}
                onChange={(e) => setMForm((f) => ({ ...f, team_a_id: e.target.value }))}
                data-testid="match-team-a-select"
              >
                <option value="">TBD (To Be Determined)</option>
                {eligibleTeams.map((t) => {
                  const reason = teamUnplayableReason(t, detail);
                  return (
                    <option key={t.id} value={t.id} disabled={!!reason}>
                      {reason ? `⚠ ${t.name} — ${reason}` : t.name}
                    </option>
                  );
                })}
              </Select>
              <PresentCount counts={presentCounts} teamId={mForm.team_a_id} />
            </div>
            <div>
              <Label>Team B (Blue Side)</Label>
              <Select
                value={mForm.team_b_id}
                onChange={(e) => setMForm((f) => ({ ...f, team_b_id: e.target.value }))}
                data-testid="match-team-b-select"
              >
                <option value="">TBD (To Be Determined)</option>
                {eligibleTeams.map((t) => {
                  const reason = teamUnplayableReason(t, detail);
                  return (
                    <option key={t.id} value={t.id} disabled={!!reason}>
                      {reason ? `⚠ ${t.name} — ${reason}` : t.name}
                    </option>
                  );
                })}
              </Select>
              <PresentCount counts={presentCounts} teamId={mForm.team_b_id} />
            </div>
          </div>
          <div>
            <Label>Match Venue / Arena</Label>
            <Select
              value={mForm.venue_id}
              onChange={(e) => setMForm((f) => ({ ...f, venue_id: e.target.value }))}
            >
              <option value="">Select Venue…</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Scheduled Date & Time</Label>
            <Input
              type="datetime-local"
              value={mForm.scheduled_at}
              onChange={(e) => setMForm((f) => ({ ...f, scheduled_at: e.target.value }))}
            />
          </div>
          <div>
            <Label>Match Notes</Label>
            <Textarea
              value={mForm.notes}
              onChange={(e) => setMForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setMOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveMatch} data-testid="save-match-btn">
              Add Match Fixture
            </Button>
          </div>
        </div>
      </Dialog>

      {/* GENERATE BRACKET MODAL */}
      <Dialog
        open={bgOpen}
        onClose={() => setBgOpen(false)}
        title="Generate Tournament Structure & Bracket"
        className="max-w-2xl"
        testId="generate-bracket-dialog"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">
            {bgFormat === "KNOCKOUT"
              ? "Round 1 pairs up the squads. If the count doesn't land on a power of two, select which seed(s) receive a Round 1 bye."
              : "Round 1 is generated as a league pool stage. Qualified teams will be pulled into subsequent knockout rounds."}
          </p>

          <div>
            <Label>Competition Format</Label>
            <div className="mt-1.5 flex gap-2">
              <Button
                type="button"
                variant={bgFormat === "KNOCKOUT" ? "gold" : "outline"}
                size="sm"
                onClick={() => setBgFormat("KNOCKOUT")}
                data-testid="bracket-format-knockout"
              >
                Knockout Elimination
              </Button>
              <Button
                type="button"
                variant={bgFormat === "LEAGUE" ? "gold" : "outline"}
                size="sm"
                onClick={() => {
                  setBgFormat("LEAGUE");
                  setBgByeTeamIds([]);
                }}
                data-testid="bracket-format-league"
              >
                League Pools
              </Button>
            </div>
          </div>

          {bgFormat === "KNOCKOUT" && (
            <div>
              <Label>Bracket Structure Scope</Label>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setBgWholeSeason(true)}
                  data-testid="bracket-scope-whole"
                  className={cn(
                    "rounded-xl border p-3 text-left text-xs transition-all",
                    bgWholeSeason
                      ? "border-gold bg-gold/10 ring-1 ring-gold"
                      : "border-white/10 bg-obsidian-950 hover:bg-white/5",
                  )}
                >
                  <p className="font-heading font-bold text-white">Full Tournament Tree</p>
                  <p className="mt-0.5 text-slate-400">
                    Auto-generates every round through the Final, auto-advancing winners as matches conclude.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setBgWholeSeason(false)}
                  data-testid="bracket-scope-first-round"
                  className={cn(
                    "rounded-xl border p-3 text-left text-xs transition-all",
                    !bgWholeSeason
                      ? "border-gold bg-gold/10 ring-1 ring-gold"
                      : "border-white/10 bg-obsidian-950 hover:bg-white/5",
                  )}
                >
                  <p className="font-heading font-bold text-white">Round 1 Only</p>
                  <p className="mt-0.5 text-slate-400">
                    Creates Round 1 only — later stages are advanced round-by-round through the Bucket.
                  </p>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>Eligible Squads ({bgTeamIds.length} selected)</Label>
            <div className="flex gap-2 text-xs font-mono">
              <button
                className="font-semibold text-gold hover:underline"
                onClick={() =>
                  setBgTeamIds(
                    eligibleTeams
                      .filter((t) => !teamUnplayableReason(t, detail))
                      .map((t) => t.id),
                  )
                }
              >
                Select all
              </button>
              <button
                className="font-semibold text-slate-400 hover:text-white"
                onClick={() => setBgTeamIds([])}
              >
                Clear
              </button>
            </div>
          </div>
          <div
            className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-obsidian-950 p-2 space-y-1"
            data-testid="bracket-team-list"
          >
            {eligibleTeams.map((t) => {
              const reason = teamUnplayableReason(t, detail);
              return (
                <label
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer hover:bg-white/5",
                    reason ? "text-amber-400" : "text-slate-200",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={bgTeamIds.includes(t.id)}
                    disabled={!!reason}
                    onChange={() => toggleBgTeam(t.id)}
                    className="rounded border-white/20 text-gold focus:ring-gold"
                  />
                  <span>{t.name}</span>
                  {reason && <span className="text-[10px] text-amber-500 font-mono">— {reason}</span>}
                </label>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={bgShuffle}
              onChange={(e) => setBgShuffle(e.target.checked)}
              className="rounded border-white/20 text-gold focus:ring-gold"
            />
            <span>Shuffle seed positions (Random Draw)</span>
          </label>

          {(bgFormat === "KNOCKOUT" ? bgNumByes > 0 : bgTeamIds.length >= 2) && (
            <div>
              <Label>
                {bgFormat === "KNOCKOUT"
                  ? `Round 1 Byes (${bgByeTeamIds.length} of ${bgNumByes} selected)`
                  : `Skip Round 1 (${bgByeTeamIds.length} picked — optional)`}
              </Label>
              <div
                className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-obsidian-950 p-2 space-y-1"
                data-testid="bracket-bye-team-list"
              >
                {eligibleTeams
                  .filter((t) => bgTeamIds.includes(t.id))
                  .map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-200 hover:bg-white/5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={bgByeTeamIds.includes(t.id)}
                        disabled={!bgByeTeamIds.includes(t.id) && bgByeTeamIds.length >= bgMaxByes}
                        onChange={() => toggleBgByeTeam(t.id)}
                        className="rounded border-white/20 text-gold focus:ring-gold"
                      />
                      <span>{t.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          {bgFormat === "KNOCKOUT" && bgTeamIds.length >= 2 && (
            <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs text-slate-200">
              <span className="font-heading font-bold text-gold">Bracket Preview:</span>{" "}
              {previewBracketRounds(bgTeamIds.length)
                .map((r) => `${r.name} (${r.matches})`)
                .join(" → ")}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setBgOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={() => saveGenerateBracket(false)}
              disabled={
                bgSaving ||
                bgTeamIds.length < 2 ||
                (bgFormat === "KNOCKOUT"
                  ? bgByeTeamIds.length !== bgNumByes
                  : bgTeamIds.length - bgByeTeamIds.length < 2)
              }
              data-testid="save-generate-bracket-btn"
            >
              {bgSaving ? "Generating Bracket…" : "Generate Structure"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* LIVE SCORING CONSOLE */}
      {consoleMatchId && (
        <LiveConsole
          matchId={consoleMatchId}
          canEdit={canEdit}
          onClose={() => setConsoleMatchId(null)}
          onChanged={() => {
            refreshLive();
            if (selectedId) loadDetail(selectedId);
          }}
        />
      )}

      {/* BUCKET DIALOG */}
      {bucketRoundId !== null && selectedId && (
        <BucketDialog
          tournamentId={selectedId}
          roundId={bucketRoundId}
          onClose={() => setBucketRoundId(null)}
          onRoundCreated={() => {
            setBucketRoundId(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function LiveConsole({
  matchId,
  canEdit,
  onClose,
  onChanged,
}: {
  matchId: number;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [m, setM] = useState<MatchT | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // 2-step scoring: tapping a value only stages it — nothing hits the server
  // (or the official score) until it's explicitly confirmed. Catches misclicks
  // during fast live-raid scoring instead of committing on the very first tap.
  const [pendingScore, setPendingScore] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });

  const load = () =>
    api
      .get<MatchT>(`/matches/${matchId}`)
      .then((r) => setM(r.data))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
    setPendingScore({ a: null, b: null });
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stop = connectLive(matchChannel(matchId), (evt) => {
      setM((prev) =>
        prev
          ? {
              ...prev,
              status: evt.status,
              team_a_score: evt.team_a_score,
              team_b_score: evt.team_b_score,
              winner_team_id: evt.winner_team_id,
            }
          : prev,
      );
    });
    return stop;
  }, [matchId]);

  const score = async (team: "a" | "b", delta: number) => {
    try {
      const response = await api.post<MatchT>(`/matches/${matchId}/score`, { team, delta });
      setM(response.data);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update score");
    }
  };
  // Step 1: stage a value (or clear it, tapping the same one again). Nothing
  // is submitted yet.
  const pickScore = (side: "a" | "b", n: number) => {
    setPendingScore((p) => ({ ...p, [side]: p[side] === n ? null : n }));
  };
  // Step 2: actually submit the staged value.
  const confirmScore = (side: "a" | "b") => {
    const n = pendingScore[side];
    if (n == null) return;
    setPendingScore((p) => ({ ...p, [side]: null }));
    score(side, n);
  };
  const cancelScore = (side: "a" | "b") => setPendingScore((p) => ({ ...p, [side]: null }));

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
  const cancelMatch = () => {
    if (!confirm("Cancel this match? It won't count toward standings and this can't be undone.")) return;
    act("cancel", "Match cancelled");
  };
  const complete = async () => {
    if (!m) return;
    if (m.team_a_score === m.team_b_score)
      return toast.error("Scores are tied — resolve tie-breaker before completing");
    if (!confirm("End this match and declare official winner?")) return;
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

  // FULL-SCREEN ARENA SCOREBOARD DISPLAY MODE
  if (fullscreen && m) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-between bg-obsidian-950 p-6 sm:p-12 select-none overflow-hidden bg-kabaddi-court-subtle">
        {/* HEADER BAR */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-4 w-4 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_15px_#34d399]" />
            <div>
              <p className="font-heading text-xs sm:text-sm font-extrabold uppercase tracking-widest text-gold">
                CBSE NATIONAL KABADDI CHAMPIONSHIP 2026–27
              </p>
              <h2 className="font-heading text-lg sm:text-xl font-black text-white">
                {m.tournament_name ?? m.round_name} · {m.venue_name ?? "Main Arena"}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[m.status]} size="md">
              {m.status}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFullscreen(false)}
              className="text-xs font-bold"
            >
              <Minimize2 className="h-4 w-4" /> Exit Fullscreen
            </Button>
          </div>
        </div>

        {/* MASSIVE SCOREBOARD NUMBERS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 my-auto items-center">
          {/* TEAM A (RED) */}
          <div className="rounded-3xl border-2 border-red-500/40 bg-red-950/20 p-5 sm:p-8 lg:p-12 text-center space-y-3 sm:space-y-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-4 left-4">
              <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-red-500 inline-block shadow-[0_0_12px_#ef4444]" />
            </div>
            {leader === "a" && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 border border-gold/40 px-3 py-1 text-xs font-heading font-black text-gold">
                <Flag className="h-3.5 w-3.5" /> LEADING
              </div>
            )}
            <h3
              className="font-heading text-xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight truncate"
              title={m.team_a_name ?? "Team Red"}
            >
              {m.team_a_name ?? "Team Red"}
            </h3>
            <div
              key={m.team_a_score}
              className="font-heading text-6xl sm:text-8xl lg:text-9xl font-black tabular-nums text-white"
              style={{ animation: "scorePop 0.35s ease-out" }}
            >
              {m.team_a_score}
            </div>
            {canEdit && m.status === "ONGOING" && (
              <div className="flex flex-col items-center gap-2 pt-2 sm:pt-4">
                {pendingScore.a == null ? (
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3].map((n) => (
                      <Button
                        key={n}
                        variant="outline"
                        className="text-base sm:text-lg font-black px-4 sm:px-6 py-3 sm:py-4 border-red-500/40 hover:bg-red-500/20"
                        onClick={() => pickScore("a", n)}
                      >
                        +{n}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      className="text-base sm:text-lg font-black px-4 sm:px-6 py-3 sm:py-4 border-white/15 text-slate-400 hover:bg-white/10"
                      onClick={() => pickScore("a", -1)}
                      title="Correct a scoring mistake"
                    >
                      −1
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5" data-testid="score-a-confirm-row">
                    <span className="font-heading text-lg font-black text-gold">
                      {pendingScore.a > 0 ? `+${pendingScore.a}` : pendingScore.a}?
                    </span>
                    <Button
                      variant="gold"
                      className="font-black px-5 py-3"
                      onClick={() => confirmScore("a")}
                      data-testid="confirm-score-a"
                    >
                      <Check className="h-4 w-4" /> Confirm
                    </Button>
                    <Button variant="outline" className="px-3 py-3" onClick={() => cancelScore("a")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* TEAM B (BLUE) */}
          <div className="rounded-3xl border-2 border-blue-500/40 bg-blue-950/20 p-5 sm:p-8 lg:p-12 text-center space-y-3 sm:space-y-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-4 left-4">
              <span className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-blue-500 inline-block shadow-[0_0_12px_#3b82f6]" />
            </div>
            {leader === "b" && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 border border-gold/40 px-3 py-1 text-xs font-heading font-black text-gold">
                <Flag className="h-3.5 w-3.5" /> LEADING
              </div>
            )}
            <h3
              className="font-heading text-xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight truncate"
              title={m.team_b_name ?? "Team Blue"}
            >
              {m.team_b_name ?? "Team Blue"}
            </h3>
            <div
              key={m.team_b_score}
              className="font-heading text-7xl sm:text-9xl font-black tabular-nums text-white"
              style={{ animation: "scorePop 0.35s ease-out" }}
            >
              {m.team_b_score}
            </div>
            {canEdit && m.status === "ONGOING" && (
              <div className="flex flex-col items-center gap-2 pt-4">
                {pendingScore.b == null ? (
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3].map((n) => (
                      <Button
                        key={n}
                        variant="outline"
                        className="text-lg font-black px-6 py-4 border-blue-500/40 hover:bg-blue-500/20"
                        onClick={() => pickScore("b", n)}
                      >
                        +{n}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      className="text-lg font-black px-6 py-4 border-white/15 text-slate-400 hover:bg-white/10"
                      onClick={() => pickScore("b", -1)}
                      title="Correct a scoring mistake"
                    >
                      −1
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5" data-testid="score-b-confirm-row">
                    <span className="font-heading text-lg font-black text-gold">
                      {pendingScore.b > 0 ? `+${pendingScore.b}` : pendingScore.b}?
                    </span>
                    <Button
                      variant="gold"
                      className="font-black px-5 py-3"
                      onClick={() => confirmScore("b")}
                      data-testid="confirm-score-b"
                    >
                      <Check className="h-4 w-4" /> Confirm
                    </Button>
                    <Button variant="outline" className="px-3 py-3" onClick={() => cancelScore("b")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER CONTROLS */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <span className="text-xs text-slate-400 font-mono">
            {m.notes ? `Notes: ${m.notes}` : "Official Electronic Scoreboard Feed"}
          </span>
          {canEdit && (
            <div className="flex gap-2">
              {m.status === "ONGOING" && (
                <Button variant="outline" size="sm" onClick={() => act("pause", "Match paused")}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              )}
              {m.status === "PAUSED" && (
                <Button variant="outline" size="sm" onClick={() => act("resume", "Match resumed")}>
                  <PlayCircle className="h-4 w-4" /> Resume
                </Button>
              )}
              <Button variant="gold" size="sm" onClick={complete}>
                <Flag className="h-4 w-4" /> Conclude Match
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Electronic Scoring Desk"
      className="max-w-xl"
      testId="live-console"
    >
      {loading || !m ? (
        <div className="py-8">
          <Spinner label="Loading match telemetry…" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* HEADER */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[m.status]} size="sm">
                {m.status === "ONGOING" ? "● LIVE IN PROGRESS" : m.status}
              </Badge>
              <span className="text-xs text-slate-400 font-mono">{m.round_name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFullscreen(true)}
              className="text-xs font-bold"
              title="Full-screen LED arena mode"
            >
              <Maximize2 className="h-3.5 w-3.5 text-gold" /> Fullscreen Arena Mode
            </Button>
          </div>

          {/* TEAMS SCORING PANELS */}
          {(["a", "b"] as const).map((side) => {
            const name = side === "a" ? m.team_a_name ?? "TBD" : m.team_b_name ?? "TBD";
            const value = side === "a" ? m.team_a_score : m.team_b_score;
            const isLeader = leader === side;
            const isRed = side === "a";
            return (
              <div
                key={side}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-4 transition-all shadow-md",
                  isRed
                    ? "border-red-500/30 bg-red-950/20"
                    : "border-blue-500/30 bg-blue-950/20",
                  isLeader && "ring-1 ring-gold border-gold/60",
                )}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: isRed ? RED : BLUE }}
                  />
                  {isLeader && <Flag className="h-4 w-4 shrink-0 text-gold" />}
                  <span className="truncate font-heading font-bold text-white text-base">
                    {name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    key={value}
                    className="w-14 text-right font-heading text-3xl sm:text-4xl font-black tabular-nums text-white"
                    style={{ animation: "scorePop 0.35s ease-out" }}
                    data-testid={`console-score-${side}`}
                  >
                    {value}
                  </span>
                  {canEdit && m.status === "ONGOING" && (
                    pendingScore[side] == null ? (
                      <div className="flex gap-1.5">
                        {[1, 2, 3].map((n) => (
                          <Button
                            key={n}
                            size="sm"
                            variant="outline"
                            className="font-bold text-xs h-9 w-9 px-0 hover:bg-white/10"
                            onClick={() => pickScore(side, n)}
                            data-testid={`score-${side}-plus-${n}`}
                          >
                            +{n}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-bold text-xs h-9 w-9 px-0 text-slate-400 hover:bg-white/10"
                          onClick={() => pickScore(side, -1)}
                          data-testid={`score-${side}-minus-1`}
                          title="Correct a scoring mistake"
                        >
                          −1
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5" data-testid={`score-${side}-confirm-row`}>
                        <span className="font-heading text-sm font-black text-gold">
                          {pendingScore[side]! > 0 ? `+${pendingScore[side]}` : pendingScore[side]}?
                        </span>
                        <Button
                          size="sm"
                          variant="gold"
                          className="h-9 px-2.5 font-bold text-xs"
                          onClick={() => confirmScore(side)}
                          data-testid={`confirm-score-${side}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 px-0"
                          onClick={() => cancelScore(side)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {/* ACTION CONTROLS */}
          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
              <div className="flex gap-2">
                {m.status === "ONGOING" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => act("pause", "Match paused")}
                  >
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                )}
                {m.status === "PAUSED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => act("resume", "Match resumed")}
                  >
                    <PlayCircle className="h-4 w-4" /> Resume
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelMatch}
                >
                  <Ban className="h-4 w-4" /> Cancel
                </Button>
              </div>
              <Button
                variant="gold"
                size="sm"
                onClick={complete}
                data-testid="end-match-btn"
                className="font-extrabold"
              >
                <Flag className="h-4 w-4" /> Conclude Match
              </Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function BucketDialog({
  tournamentId,
  roundId,
  onClose,
  onRoundCreated,
}: {
  tournamentId: number;
  roundId: number;
  onClose: () => void;
  onRoundCreated: () => void;
}) {
  const [bucket, setBucket] = useState<BucketT | null>(null);
  const [loading, setLoading] = useState(true);
  const [tiePicks, setTiePicks] = useState<Record<number, number[]>>({});
  const [pullingPoolId, setPullingPoolId] = useState<number | null>(null);
  const [pullingKnockout, setPullingKnockout] = useState(false);
  const [pullingByes, setPullingByes] = useState(false);

  const [format, setFormat] = useState<"KNOCKOUT" | "LEAGUE">("KNOCKOUT");
  const [name, setName] = useState("");
  const [byeTeamIds, setByeTeamIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [targetRoundId, setTargetRoundId] = useState<number | "new">("new");
  const [targetInitialized, setTargetInitialized] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .post<BucketT>(`/tournaments/${tournamentId}/rounds/${roundId}/bucket`)
      .then((r) => setBucket(r.data))
      .catch((e) => toast.error(e?.response?.data?.detail ?? "Could not load bucket"))
      .finally(() => setLoading(false));
  }, [tournamentId, roundId]);

  useEffect(() => {
    if (!bucket || targetInitialized) return;
    const latest = bucket.pushed_rounds[bucket.pushed_rounds.length - 1];
    setTargetRoundId(latest ? latest.id : "new");
    setTargetInitialized(true);
  }, [bucket, targetInitialized]);

  const bucketId = bucket?.id;
  const refresh = () => {
    if (bucketId) api.get<BucketT>(`/buckets/${bucketId}`).then((r) => setBucket(r.data));
  };

  const toggleTiePick = (poolId: number, teamId: number, need: number) => {
    setTiePicks((prev) => {
      const cur = prev[poolId] ?? [];
      if (cur.includes(teamId))
        return { ...prev, [poolId]: cur.filter((x) => x !== teamId) };
      if (cur.length >= need) return prev;
      return { ...prev, [poolId]: [...cur, teamId] };
    });
  };

  const pullPool = async (p: BucketPoolStatusT) => {
    if (!bucketId) return;
    const picked = tiePicks[p.pool_id] ?? [];
    if (picked.length !== p.tie_need)
      return toast.error(`Pick ${p.tie_need} squad(s) to resolve ${p.pool_name}'s tie first`);
    setPullingPoolId(p.pool_id);
    try {
      const team_ids = [...p.qualifiers.map((t) => t.id), ...picked];
      const r = await api.post<BucketT>(`/buckets/${bucketId}/pull`, {
        pool_id: p.pool_id,
        team_ids,
      });
      setBucket(r.data);
      setTiePicks((prev) => {
        const next = { ...prev };
        delete next[p.pool_id];
        return next;
      });
      toast.success(`Pulled ${p.pool_name} into the advancement bucket`);
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
      toast.success("Pulled winners into the advancement bucket");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not pull winners");
    } finally {
      setPullingKnockout(false);
    }
  };

  const pullByes = async () => {
    if (!bucketId || !bucket?.byes?.new_byes.length) return;
    setPullingByes(true);
    try {
      const team_ids = bucket.byes.new_byes.map((t) => t.id);
      const r = await api.post<BucketT>(`/buckets/${bucketId}/pull`, { team_ids });
      setBucket(r.data);
      toast.success("Pulled byes into the advancement bucket");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not pull byes");
    } finally {
      setPullingByes(false);
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

  const allTeams = bucket?.teams ?? [];
  const pulledTeams = allTeams.filter((t) => t.pushed_round_id == null);
  const pushedTeams = allTeams.filter((t) => t.pushed_round_id != null);
  const bucketTeamCount = pulledTeams.length;
  const targetRound =
    targetRoundId === "new"
      ? null
      : bucket?.pushed_rounds.find((r) => r.id === targetRoundId) ?? null;
  const effectiveFormat = targetRound ? targetRound.format : format;
  const suggestedByeCount =
    bucketTeamCount >= 2 ? bracketSizeFor(bucketTeamCount) - bucketTeamCount : 0;
  const pendingSourceCount = bucket
    ? bucket.pools
      ? bucket.pools.filter((p) => !p.pulled).length
      : bucket.knockout && (!bucket.knockout.ready || bucket.knockout.new_winners.length > 0)
      ? 1
      : 0
    : 0;
  const toggleByeTeam = (id: number) => {
    setByeTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };
  useEffect(() => {
    const pulledIds = pulledTeams.map((t) => t.id);
    setByeTeamIds((ids) => {
      const valid = ids.filter((id) => pulledIds.includes(id));
      if (valid.length === suggestedByeCount) return valid;
      if (valid.length > suggestedByeCount) return valid.slice(0, suggestedByeCount);
      const remaining = pulledIds.filter((id) => !valid.includes(id));
      return [...valid, ...remaining.slice(0, suggestedByeCount - valid.length)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, suggestedByeCount]);

  const createRound = async () => {
    if (!bucketId) return;
    if (targetRound) {
      if (bucketTeamCount < 1) return toast.error("Pull at least 1 team into the bucket first");
    } else {
      if (!name.trim()) return toast.error("Round name is required");
      if (bucketTeamCount < 2) return toast.error("Pull at least 2 teams into the bucket first");
    }
    setCreating(true);
    try {
      await api.post(`/buckets/${bucketId}/create-round`, {
        ...(targetRound ? { target_round_id: targetRound.id } : { name, format }),
        bye_team_ids: effectiveFormat === "KNOCKOUT" ? byeTeamIds : [],
      });
      toast.success(targetRound ? `Added to ${targetRound.name}` : "Round created");
      onRoundCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create the round");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={bucket ? `${bucket.name} — Advancement Manager` : "Advancement Bucket"}
      className="max-w-2xl"
      testId="bucket-dialog"
    >
      {loading || !bucket ? (
        <div className="py-8">
          <Spinner label="Loading advancement bucket telemetry…" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Advancement Holding Pool ({allTeams.length} total)</Label>
            {allTeams.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">No squads pulled in yet.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="bucket-teams">
                {pulledTeams.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    {t.name}
                    {t.source_pool_name ? ` (${t.source_pool_name})` : ""}
                    <button
                      onClick={() => removeTeam(t.id)}
                      className="text-slate-400 hover:text-red-400 font-bold"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {pushedTeams.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400/90"
                    title={`Already advanced into ${t.pushed_round_name ?? "a later round"}`}
                  >
                    {t.name}
                    {t.source_pool_name ? ` (${t.source_pool_name})` : ""} →{" "}
                    {t.pushed_round_name ?? "further round"}
                  </span>
                ))}
              </div>
            )}
          </div>

          {bucket.pools && (
            <div className="space-y-2">
              <Label>
                Pool Results Source{bucket.source_round_name ? ` — ${bucket.source_round_name}` : ""}
              </Label>
              <div className="space-y-2">
                {bucket.pools.map((p) => (
                  <div
                    key={p.pool_id}
                    className="rounded-xl border border-white/10 bg-obsidian-950 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-heading font-bold text-white">{p.pool_name}</p>
                      {p.pulled ? (
                        <Badge tone="green" size="sm">
                          Pulled into Bucket
                        </Badge>
                      ) : !p.ready ? (
                        <Badge tone="amber" size="sm">
                          Matches in Progress
                        </Badge>
                      ) : null}
                    </div>
                    {!p.pulled && p.ready && (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {p.qualifiers.map((t) => (
                            <span
                              key={t.id}
                              className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-400 font-mono"
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                        {p.needs_tiebreak && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1.5">
                            <p className="text-xs font-semibold text-amber-400">
                              Tie for qualifying spot — pick {p.tie_need} of {p.tie_candidates.length} (
                              {(tiePicks[p.pool_id] ?? []).length} selected)
                            </p>
                            <div
                              className="space-y-1 max-h-32 overflow-y-auto"
                              data-testid={`tiebreak-pool-${p.pool_id}`}
                            >
                              {p.tie_candidates.map((t) => (
                                <label
                                  key={t.id}
                                  className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(tiePicks[p.pool_id] ?? []).includes(t.id)}
                                    disabled={
                                      !(tiePicks[p.pool_id] ?? []).includes(t.id) &&
                                      (tiePicks[p.pool_id]?.length ?? 0) >= p.tie_need
                                    }
                                    onChange={() => toggleTiePick(p.pool_id, t.id, p.tie_need)}
                                    className="rounded border-white/20 text-gold focus:ring-gold"
                                  />
                                  <span>{t.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex justify-end pt-1">
                          <Button
                            size="sm"
                            variant="gold"
                            onClick={() => pullPool(p)}
                            disabled={
                              pullingPoolId === p.pool_id ||
                              (p.needs_tiebreak &&
                                (tiePicks[p.pool_id]?.length ?? 0) !== p.tie_need)
                            }
                            data-testid={`pull-pool-${p.pool_id}`}
                            className="text-xs"
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

          {bucket.byes && (
            <div>
              <Label>Round Byes — Skipped {bucket.source_round_name ?? "This Stage"}</Label>
              {bucket.byes.new_byes.length === 0 ? (
                <p className="text-xs text-slate-400 py-1">All bye teams are already in the bucket.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {bucket.byes.new_byes.map((t) => (
                      <span
                        key={t.id}
                        className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-400 font-mono"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="gold"
                      onClick={pullByes}
                      disabled={pullingByes}
                      data-testid="pull-byes"
                      className="text-xs"
                    >
                      {pullingByes ? "Pulling…" : "Pull Byes into Bucket"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {bucket.knockout && (
            <div>
              <Label>Knockout Winners Feed</Label>
              {!bucket.knockout.ready ? (
                <p className="text-xs text-slate-400 py-1">
                  {bucket.knockout.blocking ?? "Previous round matches still in progress."}
                </p>
              ) : bucket.knockout.new_winners.length === 0 ? (
                <p className="text-xs text-slate-400 py-1">
                  All current winners are already pulled into the bucket.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {bucket.knockout.new_winners.map((t) => (
                      <span
                        key={t.id}
                        className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-400 font-mono"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="gold"
                      onClick={pullKnockoutWinners}
                      disabled={pullingKnockout}
                      data-testid="pull-knockout-winners"
                      className="text-xs"
                    >
                      {pullingKnockout ? "Pulling…" : "Pull Winners into Bucket"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {bucketTeamCount >= (targetRound ? 1 : 2) || bucket.pushed_rounds.length > 0 ? (
            <div className="space-y-4 border-t border-white/10 pt-4">
              {bucket.pushed_rounds.length > 0 && (
                <div>
                  <Label>Advancement Destination</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {bucket.pushed_rounds.map((r) => (
                      <Button
                        key={r.id}
                        type="button"
                        variant={targetRoundId === r.id ? "gold" : "outline"}
                        size="sm"
                        onClick={() => setTargetRoundId(r.id)}
                        data-testid={`advance-target-round-${r.id}`}
                        className="text-xs"
                      >
                        Add to {r.name} ({r.team_count} squads)
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant={targetRoundId === "new" ? "gold" : "outline"}
                      size="sm"
                      onClick={() => setTargetRoundId("new")}
                      data-testid="advance-target-new"
                      className="text-xs"
                    >
                      Start a new round
                    </Button>
                  </div>
                </div>
              )}

              {!targetRound && (
                <>
                  <div>
                    <Label>New Round Title *</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Round 2, Quarter Final, Semi Final…"
                      data-testid="advance-round-name-input"
                    />
                  </div>
                  <div>
                    <Label>Target Round Format</Label>
                    <div className="mt-1.5 flex gap-2">
                      <Button
                        type="button"
                        variant={format === "KNOCKOUT" ? "gold" : "outline"}
                        size="sm"
                        onClick={() => setFormat("KNOCKOUT")}
                        data-testid="advance-format-knockout"
                        className="text-xs"
                      >
                        Knockout Bracket
                      </Button>
                      <Button
                        type="button"
                        variant={format === "LEAGUE" ? "gold" : "outline"}
                        size="sm"
                        onClick={() => setFormat("LEAGUE")}
                        data-testid="advance-format-league"
                        className="text-xs"
                      >
                        League Pools
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {effectiveFormat === "KNOCKOUT" && suggestedByeCount > 0 && (
                <div>
                  <Label>Byes ({byeTeamIds.length} picked — optional)</Label>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {bucketTeamCount} squads isn't a power of two. Optionally pick teams to advance
                    without playing.
                  </p>
                  <div
                    className="mt-1.5 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-obsidian-950 p-2 space-y-1"
                    data-testid="advance-bye-team-list"
                  >
                    {pulledTeams.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-200 hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={byeTeamIds.includes(t.id)}
                          onChange={() => toggleByeTeam(t.id)}
                          className="rounded border-white/20 text-gold focus:ring-gold"
                        />
                        <span>{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  onClick={createRound}
                  disabled={creating || bucketTeamCount < (targetRound ? 1 : 2)}
                  data-testid="save-advance-round-btn"
                  className="font-bold text-xs"
                >
                  {creating
                    ? "Creating Round…"
                    : targetRound
                    ? `Add to ${targetRound.name}`
                    : "Create Round"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end pt-3 border-t border-white/10">
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

interface PoolT {
  id: number;
  round_id: number;
  name: string;
  status: "draft" | "finalized";
  team_count: number;
  match_count: number;
  expected_match_count: number;
  is_valid: boolean;
  teams: { id: number; name: string }[];
}
interface LeagueSummaryT {
  round_id: number;
  round_name: string;
  eligible_team_count: number;
  eligible_teams: { id: number; name: string }[];
  assigned_team_count: number;
  unassigned_teams: { id: number; name: string }[];
  pool_count: number;
  pools: PoolT[];
  all_teams_assigned: boolean;
  all_pools_valid: boolean;
  fixtures_generated: boolean;
}
interface AutoPreviewT {
  pool_count: number;
  pools: {
    name: string;
    team_count: number;
    team_ids: number[];
    teams: { id: number; name: string }[];
  }[];
}

function LeagueSetup({
  tournamentId,
  rounds,
  teams,
  tournament,
  canEdit,
  onOpenConsole,
  onChanged,
}: {
  tournamentId: number;
  rounds: RoundT[];
  teams: Team[];
  tournament: TournamentT;
  canEdit: boolean;
  onOpenConsole: (id: number) => void;
  onChanged: () => void;
}) {
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

  const load = (silent = false) => {
    if (!roundId) {
      setSummary(null);
      return;
    }
    if (!silent) setLoading(true);
    api
      .get<LeagueSummaryT>(`/tournaments/${tournamentId}/rounds/${roundId}/league-summary`)
      .then((r) => setSummary(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), [roundId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    load(true);
    onChanged();
  };

  const openAutoPreview = async () => {
    if (!roundId) return;
    const n = Number(teamsPerPool);
    if (!Number.isFinite(n) || n < 1) return toast.error("Enter a valid number of teams per pool");
    try {
      const r = await api.post<AutoPreviewT>(
        `/tournaments/${tournamentId}/rounds/${roundId}/pools/auto-create`,
        { commit: false, teams_per_pool: n },
      );
      setAutoPreview(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not compute pool breakdown");
    }
  };
  const commitAutoCreate = async () => {
    if (!roundId) return;
    setAutoSaving(true);
    try {
      await api.post(`/tournaments/${tournamentId}/rounds/${roundId}/pools/auto-create`, {
        commit: true,
        teams_per_pool: Number(teamsPerPool),
      });
      toast.success("Pools created and round-robin fixtures generated");
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
        if (
          confirm(
            "Changing squads will regenerate this pool's fixtures. Existing match data may be affected.\n\nRegenerate?",
          )
        ) {
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
    <div className="p-4 sm:p-6 space-y-6" data-testid="league-setup">
      {/* ROUND SWITCHER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Label className="mb-0 text-xs font-heading font-bold text-slate-400 uppercase">
            Active Round:
          </Label>
          <Select
            value={roundId ?? ""}
            onChange={(e) => setRoundId(Number(e.target.value))}
            className="w-auto h-9 text-xs font-heading font-bold"
            data-testid="league-round-select"
          >
            {leagueRounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>

        {canEdit && summary && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label className="mb-0 text-xs text-slate-400 whitespace-nowrap">Squads/Pool:</Label>
              <Input
                type="number"
                min={1}
                value={teamsPerPool}
                onChange={(e) => setTeamsPerPool(e.target.value)}
                disabled={autoPreview !== null}
                className="h-8 w-16 text-center text-xs font-mono"
                data-testid="teams-per-pool-input"
              />
            </div>
            <Button
              size="sm"
              variant="gold"
              onClick={openAutoPreview}
              data-testid="auto-create-pools-btn"
              className="text-xs font-black"
            >
              <Shuffle className="h-3.5 w-3.5" /> Auto-Create Pools
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
              data-testid="create-pool-btn"
              className="text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5 text-gold" /> Custom Pool
            </Button>
          </div>
        )}
      </div>

      {leagueRounds.length === 0 ? (
        <div className="py-8">
          <EmptyState
            title="No league rounds created yet"
            hint="Add a round under Knockout / Fixtures, or advance an existing round into a League format."
          />
        </div>
      ) : loading || !summary ? (
        <div className="py-12">
          <Spinner label="Loading pool setup summary…" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* POOL TELEMETRY METRIC STRIP */}
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-white/10 bg-obsidian-950 p-4 shadow-sm"
            data-testid="league-summary"
          >
            <div>
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Eligible Squads
              </p>
              <p className="mt-1 font-heading text-xl font-black text-white font-mono">
                {summary.eligible_team_count}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Assigned
              </p>
              <p className="mt-1 font-heading text-xl font-black text-emerald-400 font-mono">
                {summary.assigned_team_count}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Unassigned
              </p>
              <p
                className={cn(
                  "mt-1 font-heading text-xl font-black font-mono",
                  summary.unassigned_teams.length > 0 ? "text-amber-400" : "text-slate-400",
                )}
              >
                {summary.unassigned_teams.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Total Pools
              </p>
              <p className="mt-1 font-heading text-xl font-black text-gold font-mono">
                {summary.pool_count}
              </p>
            </div>
          </div>

          {/* POOL CARDS GRID */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.pools.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-white/10 bg-obsidian-950 p-4 space-y-3 shadow-md"
                data-testid={`pool-card-${p.id}`}
              >
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
                  <div>
                    <span className="text-[10px] font-heading font-bold uppercase tracking-wider text-gold">
                      Group Pool
                    </span>
                    <h4 className="font-heading font-bold text-white text-base truncate">{p.name}</h4>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={p.status === "finalized" ? "green" : "neutral"} size="sm">
                      {p.status}
                    </Badge>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setDetailPoolId(p.id)}
                      title="View Pool Details"
                    >
                      <Eye className="h-4 w-4 text-slate-300" />
                    </Button>
                    {canEdit && p.is_valid && p.team_count > 0 && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => finalizePool(p, p.status === "finalized")}
                        title={p.status === "finalized" ? "Regenerate fixtures" : "Finalize pool"}
                      >
                        {p.status === "finalized" ? (
                          <Shuffle className="h-3.5 w-3.5 text-gold" />
                        ) : (
                          <Play className="h-3.5 w-3.5 text-emerald-400" />
                        )}
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => deletePool(p)}
                        title="Delete Pool"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {p.teams.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className="rounded bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300 truncate max-w-full"
                    >
                      {t.name}
                    </span>
                  ))}
                  {p.teams.length > 3 && (
                    <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-400 font-mono">
                      +{p.teams.length - 3} more
                    </span>
                  )}
                  {p.teams.length === 0 && (
                    <span className="text-xs text-slate-500 italic">No squads assigned</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 font-mono border-t border-white/5 pt-2">
                  <span>{p.team_count} squads</span>
                  <span>
                    {p.status === "finalized"
                      ? `${p.match_count} matches`
                      : `${p.expected_match_count} matches`}
                  </span>
                </div>
              </div>
            ))}
            {summary.pools.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  title="No pools created in this round"
                  hint='Click "Auto-Create Pools" or "Custom Pool" above.'
                />
              </div>
            )}
          </div>

          {/* UNASSIGNED TEAMS */}
          <div className="rounded-xl border border-white/10 bg-obsidian-950 p-4 space-y-3 shadow-sm">
            <h4 className="text-xs font-heading font-bold uppercase tracking-wider text-slate-400">
              Unassigned Squads ({summary.unassigned_teams.length})
            </h4>
            {summary.unassigned_teams.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                All eligible squads have been assigned into competition pools.
              </p>
            ) : (
              <div className="divide-y divide-white/5 max-h-56 overflow-y-auto">
                {summary.unassigned_teams.map((t) => {
                  const full = teams.find((x) => x.id === t.id);
                  const reason = full ? teamUnplayableReason(full, tournament) : null;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <span
                        className={cn(
                          "truncate font-medium",
                          reason ? "text-amber-400" : "text-slate-200",
                        )}
                      >
                        {t.name}
                        {reason && (
                          <span className="ml-1.5 text-[11px] text-amber-500 font-mono">
                            — {reason}
                          </span>
                        )}
                      </span>
                      {canEdit && summary.pools.length > 0 && (
                        <select
                          className="rounded-lg border border-white/10 bg-obsidian-900 px-3 py-1 text-xs text-white"
                          defaultValue=""
                          disabled={!!reason}
                          onChange={(e) => {
                            if (e.target.value) assignTeam(t.id, Number(e.target.value));
                            e.target.value = "";
                          }}
                          data-testid={`assign-team-${t.id}`}
                        >
                          <option value="">Assign to pool…</option>
                          {summary.pools.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE POOL MODAL */}
      {createOpen && roundId && (
        <CreatePoolDialog
          tournamentId={tournamentId}
          roundId={roundId}
          teams={summary?.eligible_teams ?? teams}
          fullTeams={teams}
          tournament={tournament}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      )}

      {/* AUTO CREATE PREVIEW MODAL */}
      {autoPreview && (
        <Dialog
          open
          onClose={() => setAutoPreview(null)}
          title="Confirm Auto-Pool Generation"
          testId="auto-create-preview-dialog"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              This will create {autoPreview.pool_count} group pool{autoPreview.pool_count === 1 ? "" : "s"} and
              generate round-robin match fixtures immediately.
            </p>
            <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-obsidian-950 max-h-56 overflow-y-auto">
              {autoPreview.pools.map((p) => (
                <div key={p.name} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                  <span className="font-heading font-bold text-white">{p.name}</span>
                  <span className="text-slate-400 font-mono">{p.team_count} squads</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button variant="outline" size="sm" onClick={() => setAutoPreview(null)}>
                Cancel
              </Button>
              <Button
                variant="gold"
                size="sm"
                onClick={commitAutoCreate}
                disabled={autoSaving}
                data-testid="confirm-auto-create-btn"
              >
                {autoSaving ? "Creating Pools…" : "Confirm & Generate"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* POOL DETAIL DIALOG */}
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

function CreatePoolDialog({
  tournamentId,
  roundId,
  teams,
  fullTeams,
  tournament,
  onClose,
  onCreated,
}: {
  tournamentId: number;
  roundId: number;
  teams: Team[];
  fullTeams: Team[];
  tournament: TournamentT;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (id: number) =>
    setTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async () => {
    if (!name.trim()) return toast.error("Pool name is required");
    setSaving(true);
    try {
      await api.post(`/tournaments/${tournamentId}/rounds/${roundId}/pools`, {
        name,
        team_ids: teamIds,
      });
      toast.success("Pool created");
      onCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create pool");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Create Group Pool" testId="create-pool-dialog">
      <div className="space-y-4">
        <div>
          <Label>Pool Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pool A"
            data-testid="pool-name-input"
          />
        </div>
        <div>
          <Label>Select Squads ({teamIds.length})</Label>
          <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-obsidian-950 p-2 space-y-1">
            {teams.map((t) => {
              const full = fullTeams.find((x) => x.id === t.id) ?? t;
              const reason = teamUnplayableReason(full, tournament);
              return (
                <label
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer hover:bg-white/5",
                    reason ? "text-amber-400" : "text-slate-200",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={teamIds.includes(t.id)}
                    disabled={!!reason}
                    onChange={() => toggle(t.id)}
                    className="rounded border-white/20 text-gold focus:ring-gold"
                  />
                  <span>{t.name}</span>
                  {reason && <span className="text-[10px] text-amber-500 font-mono">— {reason}</span>}
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={save}
            disabled={saving}
            data-testid="save-pool-btn"
          >
            {saving ? "Creating…" : "Create Pool"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface StandingRow {
  team_id: number;
  team_name: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points_for: number;
  points_against: number;
  points: number;
  position: number;
}

function PoolDetailDialog({
  poolId,
  canEdit,
  onClose,
  onOpenConsole,
  onChanged,
}: {
  poolId: number;
  canEdit: boolean;
  onClose: () => void;
  onOpenConsole: (id: number) => void;
  onChanged: () => void;
}) {
  const [pool, setPool] = useState<PoolT | null>(null);
  const [matches, setMatches] = useState<MatchT[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.get<PoolT>(`/pools/${poolId}`),
      api.get<MatchT[]>(`/pools/${poolId}/matches`),
      api.get<StandingRow[]>(`/pools/${poolId}/standings`),
    ])
      .then(([p, m, s]) => {
        setPool(p.data);
        setMatches(m.data);
        setStandings(s.data);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMatch = async (id: number) => {
    try {
      await api.post(`/matches/${id}/start`);
      load(true);
      onChanged();
      onOpenConsole(id);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not start match");
    }
  };

  const removeTeam = async (teamId: number) => {
    if (!confirm("Remove this squad from the pool?")) return;
    try {
      await api.delete(`/pools/${poolId}/teams/${teamId}`);
      load(true);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not remove squad");
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={pool ? `${pool.name} Management & Standings` : "Pool Overview"}
      className="max-w-3xl"
      testId="pool-detail-dialog"
    >
      {loading || !pool ? (
        <div className="py-8">
          <Spinner label="Loading pool details…" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* SQUADS */}
          <div>
            <h4 className="text-xs font-heading font-bold uppercase tracking-wider text-slate-400">
              Enrolled Squads
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pool.teams.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-obsidian-950 px-2.5 py-1 text-xs font-semibold text-white"
                >
                  {t.name}
                  {canEdit && pool.status !== "finalized" && (
                    <button
                      onClick={() => removeTeam(t.id)}
                      className="text-slate-400 hover:text-red-400 font-bold"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* STANDINGS */}
          <div>
            <h4 className="text-xs font-heading font-bold uppercase tracking-wider text-slate-400">
              Group Standings
            </h4>
            {standings.every((s) => s.played === 0) ? (
              <p className="text-xs text-slate-400 py-2 italic">No completed matches yet.</p>
            ) : (
              <div className="mt-2 rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden shadow-sm">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-10">#</TH>
                      <TH>Squad</TH>
                      <TH className="text-right">P</TH>
                      <TH className="text-right">W</TH>
                      <TH className="text-right">L</TH>
                      <TH className="text-right">D</TH>
                      <TH className="text-right">PF</TH>
                      <TH className="text-right">PA</TH>
                      <TH className="text-right">Pts</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {standings.map((s) => (
                      <TR key={s.team_id}>
                        <TD className="font-mono text-xs text-slate-400">{s.position}</TD>
                        <TD className="font-heading font-bold text-white text-xs">{s.team_name}</TD>
                        <TD className="text-right font-mono text-xs text-slate-300">{s.played}</TD>
                        <TD className="text-right font-mono text-xs text-emerald-400 font-bold">
                          {s.won}
                        </TD>
                        <TD className="text-right font-mono text-xs text-slate-400">{s.lost}</TD>
                        <TD className="text-right font-mono text-xs text-slate-400">{s.drawn}</TD>
                        <TD className="text-right font-mono text-xs text-slate-300">
                          {s.points_for}
                        </TD>
                        <TD className="text-right font-mono text-xs text-slate-400">
                          {s.points_against}
                        </TD>
                        <TD className="text-right font-heading font-bold text-gold text-sm">
                          {s.points}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>

          {/* FIXTURES */}
          <div>
            <h4 className="text-xs font-heading font-bold uppercase tracking-wider text-slate-400">
              Pool Fixtures ({matches.length})
            </h4>
            {matches.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 italic">
                Fixtures not generated yet — finalize the pool first.
              </p>
            ) : (
              <div className="mt-2 rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden shadow-sm">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-10">#</TH>
                      <TH>Fixture</TH>
                      <TH>Status</TH>
                      <TH>Score</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {matches.map((m, i) => (
                      <TR key={m.id}>
                        <TD className="font-mono text-xs text-slate-500">{i + 1}</TD>
                        <TD className="font-heading font-bold text-white text-xs">
                          {m.team_a_name} vs {m.team_b_name}
                        </TD>
                        <TD>
                          <Badge tone={STATUS_TONE[m.status]} size="sm">
                            {m.status}
                          </Badge>
                        </TD>
                        <TD className="font-mono text-xs font-bold text-slate-200">
                          {m.status === "SCHEDULED"
                            ? "—"
                            : `${m.team_a_score} – ${m.team_b_score}`}
                        </TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && m.status === "SCHEDULED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startMatch(m.id)}
                                className="text-xs"
                              >
                                <Play className="h-3 w-3 text-emerald-400" /> Start
                              </Button>
                            )}
                            {(m.status === "ONGOING" || m.status === "PAUSED") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onOpenConsole(m.id)}
                                className="text-xs text-emerald-400"
                              >
                                <Radio className="h-3 w-3" /> Live
                              </Button>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
