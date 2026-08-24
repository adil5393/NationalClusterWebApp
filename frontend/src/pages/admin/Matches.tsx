import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Play, Pause, PlayCircle, Flag, Radio, Ban } from "lucide-react";
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

interface Team { id: number; name: string }
interface Venue { id: number; name: string }
interface ParticipantT { team_id: number; age_group?: string | null; is_present?: boolean }
interface MatchT {
  id: number; tournament_id: number; round_id: number; round_name?: string | null;
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
interface RoundT { id: number; tournament_id: number; name: string; sequence: number; matches: MatchT[] }
interface TournamentT {
  id: number; name: string; sport?: string | null; age_group?: string | null; status: string; notes?: string | null;
  round_count: number; match_count: number; rounds?: RoundT[];
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
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); }, [selectedId]);

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
    <div data-testid="admin-matches">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Matches & Fixtures</h1>
          <p className="mt-1 text-sm text-slate-500">Tournaments, rounds, brackets, and live scoring.</p>
        </div>
        {canEdit && (
          <Button onClick={() => { setTForm({ name: "", sport: "", age_group: "", status: "draft", notes: "" }); setTOpen(true); }} data-testid="add-tournament-btn">
            <Plus className="h-4 w-4" /> New Tournament
          </Button>
        )}
      </div>

      {/* LIVE NOW */}
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-600" />
          <h2 className="font-heading text-sm font-bold text-slate-900">Ongoing Matches</h2>
          <span className="text-xs text-slate-500">({live.length})</span>
        </div>
        {live.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing live right now.</p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((m) => (
              <button
                key={m.id}
                onClick={() => setConsoleMatchId(m.id)}
                data-testid={`live-match-${m.id}`}
                className="rounded-md border border-slate-200 bg-white p-3 text-left hover:border-emerald-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                  <span className="text-xs text-slate-400">{m.round_name}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm font-bold text-slate-900">
                  <span className="truncate">{m.team_a_name ?? "TBD"}</span><span>{m.team_a_score}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm font-bold text-slate-900">
                  <span className="truncate">{m.team_b_name ?? "TBD"}</span><span>{m.team_b_score}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <div className="mt-6"><Spinner /></div> : tournaments.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <EmptyState title="No tournaments yet" hint="Create one to start building fixtures." />
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2" data-testid="tournament-tabs">
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                data-testid={`tournament-tab-${t.id}`}
                className={`shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selectedId === t.id
                    ? "border-coral text-coral-600"
                    : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"
                }`}
              >
                {t.name}
                {t.age_group && <span className="ml-1.5 text-xs font-normal text-slate-400">· {t.age_group}</span>}
                <span className="ml-1.5 text-xs font-normal text-slate-400">({t.match_count})</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
            {detail && (
              <>
                <Badge tone={detail.status === "active" ? "green" : detail.status === "completed" ? "slate" : "neutral"}>{detail.status}</Badge>
                {detail.age_group && <Badge tone="coral">{detail.age_group}</Badge>}
                {detail.sport && <span className="text-xs text-slate-500">{detail.sport}</span>}
                {canEdit && (
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setTForm({ id: detail.id, name: detail.name, sport: detail.sport ?? "", age_group: detail.age_group ?? "", status: detail.status, notes: detail.notes ?? "" }); setTOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => removeTournament(detail.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    <Button variant="outline" size="sm" onClick={() => { setRForm({ name: "", sequence: String((detail.rounds?.length ?? 0) + 1) }); setROpen(true); }} data-testid="add-round-btn"><Plus className="h-4 w-4" /> Round</Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-4">
            {!detail || (detail.rounds ?? []).length === 0 ? (
              <EmptyState title="No rounds yet" hint="Add a round (e.g. Round 1, Quarter Final) to start scheduling matches." />
            ) : (
              <div className="space-y-6">
                {detail.rounds!.map((r) => (
                  <div key={r.id}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-heading text-sm font-bold text-slate-900">{r.name}</h3>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => openAddMatch(r.id)} data-testid={`add-match-${r.id}`}><Plus className="h-3.5 w-3.5" /> Match</Button>
                          <Button variant="ghost" size="icon" onClick={() => removeRound(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      )}
                    </div>
                    {r.matches.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-400">No matches in this round yet.</p>
                    ) : (
                      <Table className="mt-2">
                        <THead><TR className="hover:bg-transparent"><TH>Fixture</TH><TH>Venue</TH><TH>Scheduled</TH><TH>Status</TH><TH>Score</TH><TH className="text-right">Actions</TH></TR></THead>
                        <tbody>
                          {r.matches.map((m) => (
                            <TR key={m.id} data-testid={`match-row-${m.id}`}>
                              <TD className="font-semibold text-slate-800">{matchLabel(m)}{m.winner_team_name && <div className="text-xs font-normal text-emerald-600">Winner: {m.winner_team_name}</div>}</TD>
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
                      </Table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tournament dialog */}
      <Dialog open={tOpen} onClose={() => setTOpen(false)} title={tForm.id ? "Edit Tournament" : "New Tournament"} testId="tournament-dialog">
        <div className="space-y-4">
          <div><Label>Name *</Label><Input value={tForm.name} onChange={(e) => setTForm((f) => ({ ...f, name: e.target.value }))} placeholder="Kabaddi — Boys Under 17" data-testid="tournament-name-input" /></div>
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
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

      {consoleMatchId && (
        <LiveConsole
          matchId={consoleMatchId}
          canEdit={canEdit}
          onClose={() => setConsoleMatchId(null)}
          onChanged={() => { refreshLive(); if (selectedId) loadDetail(selectedId); }}
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
      await api.post(`/matches/${matchId}/score`, { team, delta });
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
    <Dialog open onClose={onClose} title="Live Match Console" testId="live-console">
      {loading || !m ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[m.status]}>{m.status === "ONGOING" ? "● LIVE" : m.status}</Badge>
            <span className="text-xs text-slate-500">{m.round_name}</span>
          </div>

          {(["a", "b"] as const).map((side) => {
            const name = side === "a" ? (m.team_a_name ?? "TBD") : (m.team_b_name ?? "TBD");
            const value = side === "a" ? m.team_a_score : m.team_b_score;
            const isLeader = leader === side;
            return (
              <div key={side} className={`flex items-center justify-between rounded-md border p-3 transition-colors ${isLeader ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center gap-2 truncate">
                  {isLeader && <Flag className="h-4 w-4 shrink-0 text-emerald-600" />}
                  <span className="truncate font-bold text-slate-900">{name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span key={value} className="w-10 text-right font-heading text-2xl font-black tabular-nums text-slate-950" data-testid={`console-score-${side}`}>{value}</span>
                  {canEdit && m.status === "ONGOING" && (
                    <div className="flex gap-1">
                      {[1, 2, 3].map((n) => (
                        <Button key={n} size="sm" variant="outline" onClick={() => score(side, n)} data-testid={`score-${side}-plus-${n}`}>+{n}</Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              {m.status === "ONGOING" && <Button variant="outline" onClick={() => act("pause", "Match paused")}><Pause className="h-4 w-4" /> Pause</Button>}
              {m.status === "PAUSED" && <Button variant="outline" onClick={() => act("resume", "Match resumed")}><PlayCircle className="h-4 w-4" /> Resume</Button>}
              <Button variant="outline" onClick={() => act("cancel", "Match cancelled")}><Ban className="h-4 w-4" /> Cancel</Button>
              <Button onClick={complete} data-testid="end-match-btn"><Flag className="h-4 w-4" /> End Match</Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
