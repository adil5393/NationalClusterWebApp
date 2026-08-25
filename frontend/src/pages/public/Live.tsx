import { useEffect, useMemo, useState } from "react";
import { Radio, Flag, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { connectLive, matchChannel, tournamentChannel } from "@/lib/live";
import { formatDate } from "@/lib/meta";
import { Dialog } from "@/components/ui/dialog";

// Every match has two sides — team A is always red, team B is always blue,
// regardless of which actual team ends up in that slot as the bracket fills
// in. Live/completed connector lines borrow whichever color is currently
// ahead (or the winner's, once decided).
const RED = "#ef4444";
const BLUE = "#3b82f6";
const NEUTRAL = "#cbd5e1";

interface MatchT {
  id: number; tournament_id: number; tournament_name?: string; sport?: string | null;
  round_id: number; round_name?: string | null;
  team_a_id?: number | null; team_a_name?: string | null;
  team_b_id?: number | null; team_b_name?: string | null;
  source_match_a_id?: number | null; source_match_b_id?: number | null;
  venue_name?: string | null; scheduled_at?: string | null;
  status: string; team_a_score: number; team_b_score: number;
  winner_team_id?: number | null; winner_team_name?: string | null;
  notes?: string | null;
}
interface RoundT { id: number; name: string; sequence: number; matches: MatchT[] }
interface Bracket { id: number; name: string; sport?: string | null; status: string; rounds: RoundT[] }
interface TournamentSummary { id: number; name: string; sport?: string | null; status: string }

function ScoreLine({ label, value, leading, color }: { label: string; value: number; leading: boolean; color: string }) {
  return (
    <div className={`flex items-center justify-between rounded px-2 py-1 ${leading ? "bg-emerald-50" : ""}`}>
      <span className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${leading ? "font-bold text-emerald-800" : "text-slate-700"}`}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        {leading && <Flag className="h-3 w-3 shrink-0 text-emerald-600" />}
        <span className="truncate">{label}</span>
      </span>
      <span key={value} className="font-heading text-lg font-black tabular-nums text-slate-950">{value}</span>
    </div>
  );
}

function LiveMatchCard({ initial }: { initial: MatchT }) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const stop = connectLive(matchChannel(initial.id), (evt) => {
      setM((prev) => ({ ...prev, status: evt.status, team_a_score: evt.team_a_score, team_b_score: evt.team_b_score, winner_team_id: evt.winner_team_id }));
    });
    return stop;
  }, [initial.id]);

  const leader = m.team_a_score === m.team_b_score ? null : m.team_a_score > m.team_b_score ? "a" : "b";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid={`public-live-match-${m.id}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold uppercase tracking-wide text-slate-500">{m.sport ?? m.tournament_name}</span>
        <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> LIVE
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{m.round_name}</p>
      <div className="mt-2 space-y-1">
        <ScoreLine label={m.team_a_name ?? "TBD"} value={m.team_a_score} leading={leader === "a"} color={RED} />
        <ScoreLine label={m.team_b_name ?? "TBD"} value={m.team_b_score} leading={leader === "b"} color={BLUE} />
      </div>
    </div>
  );
}

// Classic single-elimination bracket layout: rounds as columns, each match's
// vertical center sits at the midpoint of the two matches feeding it (via
// source_match_a/b_id), so the tree naturally tapers toward the final — the
// same shape as a printed tournament bracket. Positions are computed from the
// data directly rather than measured from the DOM, since the topology
// (source_match links) already tells us exactly how rounds should nest.
const CARD_W = 224;
const CARD_H = 88;
const COL_GAP = 56;
const ROW_GAP = 20;
const HEADER_H = 32;

interface Pos { x: number; y: number }

// Which color a match's own outgoing connector should currently show: the
// leader while it's live, the winner once decided, or neutral if it's tied /
// hasn't started. A bye always resolves to red since the bye'd team is
// always placed in the team_a slot (see backend generate-bracket).
function leaderColor(src: MatchT | undefined): string {
  if (!src) return NEUTRAL;
  if (src.notes === "Bye") return RED;
  if (src.status === "COMPLETED") {
    if (src.winner_team_id != null && src.winner_team_id === src.team_a_id) return RED;
    if (src.winner_team_id != null && src.winner_team_id === src.team_b_id) return BLUE;
    return NEUTRAL;
  }
  if (src.status === "ONGOING" || src.status === "PAUSED") {
    if (src.team_a_score > src.team_b_score) return RED;
    if (src.team_b_score > src.team_a_score) return BLUE;
  }
  return NEUTRAL;
}

function layoutBracket(rounds: RoundT[]) {
  const sorted = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const positions: Record<number, Pos> = {};
  const centers: Record<number, number> = {};

  sorted[0]?.matches.forEach((m, i) => {
    const y = HEADER_H + i * (CARD_H + ROW_GAP);
    positions[m.id] = { x: 0, y };
    centers[m.id] = y + CARD_H / 2;
  });

  for (let r = 1; r < sorted.length; r++) {
    const x = r * (CARD_W + COL_GAP);
    let cursor = HEADER_H;
    sorted[r].matches.forEach((m) => {
      const a = m.source_match_a_id != null ? centers[m.source_match_a_id] : undefined;
      const b = m.source_match_b_id != null ? centers[m.source_match_b_id] : undefined;
      let centerY: number;
      if (a != null && b != null) centerY = (a + b) / 2;
      else if (a != null || b != null) centerY = (a ?? b)!;
      else { centerY = cursor + CARD_H / 2; cursor += CARD_H + ROW_GAP; }
      positions[m.id] = { x, y: centerY - CARD_H / 2 };
      centers[m.id] = centerY;
    });
  }

  const allPos = Object.values(positions);
  const width = sorted.length > 0 ? sorted.length * CARD_W + (sorted.length - 1) * COL_GAP : 0;
  const height = allPos.length > 0 ? Math.max(...allPos.map((p) => p.y)) + CARD_H : 0;

  const matchById: Record<number, MatchT> = {};
  sorted.forEach((r) => r.matches.forEach((m) => { matchById[m.id] = m; }));

  // Each match's own outgoing stub is colored separately by that source
  // match's leader/winner — the "half of the connecting line" that shows
  // red or blue. The joiner + final run into the target stays neutral: it
  // merges two different matches' outcomes, so no single team's color applies
  // to it until the target match itself is decided.
  //
  // Each source gets its own complete, never-shared path — entering the
  // target card at a distinct point (the team_a row for source A, the
  // team_b row for source B) rather than merging into one trunk. That way
  // when a source is decided, its ENTIRE line (not just the stub near it)
  // is one solid color, with no ambiguous shared segment to disagree on.
  const TEAM_A_ROW_Y = 34;
  const TEAM_B_ROW_Y = 60;
  const connectors: { d: string; color: string }[] = [];
  for (let r = 1; r < sorted.length; r++) {
    sorted[r].matches.forEach((m) => {
      const target = positions[m.id];
      if (!target) return;
      const targetLeftX = target.x;
      const prevRightX = targetLeftX - COL_GAP;
      const midX = targetLeftX - COL_GAP / 2;

      const aPos = m.source_match_a_id != null ? positions[m.source_match_a_id] : undefined;
      if (aPos) {
        const aY = aPos.y + CARD_H / 2;
        const targetAY = target.y + TEAM_A_ROW_Y;
        connectors.push({ d: `M${prevRightX},${aY} H${midX} V${targetAY} H${targetLeftX}`, color: leaderColor(matchById[m.source_match_a_id!]) });
      }
      const bPos = m.source_match_b_id != null ? positions[m.source_match_b_id] : undefined;
      if (bPos) {
        const bY = bPos.y + CARD_H / 2;
        const targetBY = target.y + TEAM_B_ROW_Y;
        connectors.push({ d: `M${prevRightX},${bY} H${midX} V${targetBY} H${targetLeftX}`, color: leaderColor(matchById[m.source_match_b_id!]) });
      }
    });
  }

  return { sorted, positions, width, height, connectors };
}

function BracketMatchCard({ m, isFinal, onSelect }: { m: MatchT; isFinal?: boolean; onSelect?: (id: number) => void }) {
  const live = m.status === "ONGOING" || m.status === "PAUSED";
  const done = m.status === "COMPLETED";
  const isBye = m.notes === "Bye";
  const clickable = !!onSelect && !!m.team_a_id && !!m.team_b_id;

  if (isBye) {
    return (
      <div style={{ width: CARD_W, height: CARD_H }} className="flex shrink-0 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm">
        <span className="truncate font-bold text-slate-800">{m.team_a_name ?? m.team_b_name}</span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bye — advances automatically</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => clickable && onSelect!(m.id)}
      style={{ width: CARD_W, height: CARD_H }}
      className={`shrink-0 rounded-md border p-2.5 text-sm shadow-sm transition-shadow ${live ? "border-emerald-300 bg-emerald-50" : isFinal ? "border-coral bg-orange-50/50" : "border-slate-200 bg-white"} ${clickable ? "cursor-pointer hover:shadow-md" : ""}`}
      data-testid={`bracket-match-${m.id}`}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate">{m.venue_name ?? "Venue TBD"}</span>
        {live && <span className="shrink-0 font-bold text-emerald-600">● LIVE</span>}
        {m.status === "SCHEDULED" && m.scheduled_at && <span className="shrink-0">{formatDate(m.scheduled_at)}</span>}
      </div>
      <div className={`mt-1 flex items-center justify-between ${done && m.winner_team_id === m.team_a_id ? "font-bold text-slate-950" : "text-slate-700"}`}>
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RED }} />
          <span className="truncate">{m.team_a_name ?? "TBD"}</span>
        </span>
        {(live || done) && <span className="shrink-0 tabular-nums">{m.team_a_score}</span>}
      </div>
      <div className={`flex items-center justify-between ${done && m.winner_team_id === m.team_b_id ? "font-bold text-slate-950" : "text-slate-700"}`}>
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BLUE }} />
          <span className="truncate">{m.team_b_name ?? "TBD"}</span>
        </span>
        {(live || done) && <span className="shrink-0 tabular-nums">{m.team_b_score}</span>}
      </div>
      {done && m.winner_team_name && (
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
          <Trophy className="h-3 w-3 shrink-0" /> <span className="truncate">{m.winner_team_name}</span>
        </div>
      )}
    </div>
  );
}

interface RosterEntry { full_name: string; role?: string | null }
interface MatchDetail extends MatchT { team_a_roster?: RosterEntry[]; team_b_roster?: RosterEntry[] }

function RosterColumn({ name, color, roster }: { name: string; color: string; roster?: RosterEntry[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <h4 className="truncate font-heading font-bold text-slate-900">{name}</h4>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {(roster ?? []).map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-slate-700">
            <span className="truncate">{p.full_name}</span>
            {p.role && <span className="shrink-0 text-xs text-slate-400">{p.role}</span>}
          </li>
        ))}
        {(roster ?? []).length === 0 && <li className="text-xs text-slate-400">No roster published.</li>}
      </ul>
    </div>
  );
}

function MatchRosterDialog({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  useEffect(() => {
    setDetail(null);
    api.get<MatchDetail>(`/public/matches/${matchId}`).then((r) => setDetail(r.data));
  }, [matchId]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={detail ? `${detail.team_a_name ?? "TBD"} vs ${detail.team_b_name ?? "TBD"}` : "Match"}
      className="max-w-2xl"
      testId="match-roster-dialog"
    >
      {!detail ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <RosterColumn name={detail.team_a_name ?? "TBD"} color={RED} roster={detail.team_a_roster} />
          <RosterColumn name={detail.team_b_name ?? "TBD"} color={BLUE} roster={detail.team_b_roster} />
        </div>
      )}
    </Dialog>
  );
}

function BracketView({ tournamentId, onSelectMatch }: { tournamentId: number; onSelectMatch: (id: number) => void }) {
  const [bracket, setBracket] = useState<Bracket | null>(null);

  const load = () => api.get<Bracket>(`/public/tournaments/${tournamentId}/bracket`).then((r) => setBracket(r.data));
  useEffect(() => { load(); }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // A tournament's structure rarely changes mid-session, so a full refetch on
    // any match event is simple and correct — no need to hand-patch nested state.
    const stop = connectLive(tournamentChannel(tournamentId), () => load());
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const layout = useMemo(() => (bracket ? layoutBracket(bracket.rounds) : null), [bracket]);
  if (!bracket || !layout) return null;

  return (
    <div className="mt-4 overflow-x-auto pb-4" data-testid="public-bracket">
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        {layout.sorted.map((r, ri) => (
          <div
            key={r.id}
            className="absolute top-0 text-center text-xs font-bold uppercase tracking-widest text-slate-500"
            style={{ left: ri * (CARD_W + COL_GAP), width: CARD_W }}
          >
            {r.name}
          </div>
        ))}
        <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
          {layout.connectors.map((c, i) => (
            <path key={i} d={c.d} stroke={c.color} strokeWidth={2} fill="none" />
          ))}
        </svg>
        {layout.sorted.flatMap((r, ri) =>
          r.matches.map((m) => {
            const pos = layout.positions[m.id];
            if (!pos) return null;
            return (
              <div key={m.id} className="absolute" style={{ left: pos.x, top: pos.y }}>
                <BracketMatchCard m={m} isFinal={ri === layout.sorted.length - 1 && r.matches.length === 1} onSelect={onSelectMatch} />
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

export default function Live() {
  const [liveMatches, setLiveMatches] = useState<MatchT[]>([]);
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [rosterMatchId, setRosterMatchId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<MatchT[]>("/public/matches/live"),
      api.get<TournamentSummary[]>("/public/tournaments"),
    ]).then(([l, t]) => {
      setLiveMatches(l.data);
      setTournaments(t.data);
      if (t.data.length > 0) setSelected(t.data[0].id);
    }).finally(() => setLoading(false));
  }, []);

  const selectedTournament = useMemo(() => tournaments.find((t) => t.id === selected), [tournaments, selected]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-coral" />
        <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Live & Fixtures</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">Live scores and the tournament bracket, updating in real time.</p>

      <section className="mt-8">
        <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-500">Live Now</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : liveMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No matches are live right now — check back soon.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveMatches.map((m) => <LiveMatchCard key={m.id} initial={m} />)}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-500">Bracket</h2>
          {tournaments.length > 0 && (
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              data-testid="public-tournament-select"
            >
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        {!loading && tournaments.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">No published tournaments yet.</p>
        )}
        {selectedTournament && <BracketView tournamentId={selectedTournament.id} onSelectMatch={setRosterMatchId} />}
      </section>

      {rosterMatchId && <MatchRosterDialog matchId={rosterMatchId} onClose={() => setRosterMatchId(null)} />}
    </div>
  );
}
