import { useEffect, useMemo, useState } from "react";
import { Radio, Flag, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { connectLive, matchChannel, tournamentChannel } from "@/lib/live";
import { formatDate } from "@/lib/meta";

interface MatchT {
  id: number; tournament_id: number; tournament_name?: string; sport?: string | null;
  round_id: number; round_name?: string | null;
  team_a_id?: number | null; team_a_name?: string | null;
  team_b_id?: number | null; team_b_name?: string | null;
  source_match_a_id?: number | null; source_match_b_id?: number | null;
  venue_name?: string | null; scheduled_at?: string | null;
  status: string; team_a_score: number; team_b_score: number;
  winner_team_id?: number | null; winner_team_name?: string | null;
}
interface RoundT { id: number; name: string; sequence: number; matches: MatchT[] }
interface Bracket { id: number; name: string; sport?: string | null; status: string; rounds: RoundT[] }
interface TournamentSummary { id: number; name: string; sport?: string | null; status: string }

function ScoreLine({ label, value, leading }: { label: string; value: number; leading: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded px-2 py-1 ${leading ? "bg-emerald-50" : ""}`}>
      <span className={`truncate text-sm ${leading ? "font-bold text-emerald-800" : "text-slate-700"}`}>
        {leading && <Flag className="mr-1 inline h-3 w-3 text-emerald-600" />}
        {label}
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
        <ScoreLine label={m.team_a_name ?? "TBD"} value={m.team_a_score} leading={leader === "a"} />
        <ScoreLine label={m.team_b_name ?? "TBD"} value={m.team_b_score} leading={leader === "b"} />
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

  const connectors: string[] = [];
  for (let r = 1; r < sorted.length; r++) {
    sorted[r].matches.forEach((m) => {
      const target = positions[m.id];
      if (!target) return;
      const targetLeftX = target.x;
      const targetCenterY = target.y + CARD_H / 2;
      const prevRightX = targetLeftX - COL_GAP;
      const midX = targetLeftX - COL_GAP / 2;
      const aPos = m.source_match_a_id != null ? positions[m.source_match_a_id] : undefined;
      const bPos = m.source_match_b_id != null ? positions[m.source_match_b_id] : undefined;
      if (aPos && bPos) {
        const aY = aPos.y + CARD_H / 2;
        const bY = bPos.y + CARD_H / 2;
        connectors.push(`M${prevRightX},${aY} H${midX} M${prevRightX},${bY} H${midX} M${midX},${aY} V${bY} M${midX},${targetCenterY} H${targetLeftX}`);
      } else if (aPos || bPos) {
        const srcY = (aPos ?? bPos)!.y + CARD_H / 2;
        connectors.push(`M${prevRightX},${srcY} H${targetLeftX}`);
      }
    });
  }

  return { sorted, positions, width, height, connectors };
}

function BracketMatchCard({ m, isFinal }: { m: MatchT; isFinal?: boolean }) {
  const live = m.status === "ONGOING" || m.status === "PAUSED";
  const done = m.status === "COMPLETED";
  return (
    <div
      style={{ width: CARD_W, height: CARD_H }}
      className={`shrink-0 rounded-md border p-2.5 text-sm shadow-sm ${live ? "border-emerald-300 bg-emerald-50" : isFinal ? "border-coral bg-orange-50/50" : "border-slate-200 bg-white"}`}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate">{m.venue_name ?? "Venue TBD"}</span>
        {live && <span className="shrink-0 font-bold text-emerald-600">● LIVE</span>}
        {m.status === "SCHEDULED" && m.scheduled_at && <span className="shrink-0">{formatDate(m.scheduled_at)}</span>}
      </div>
      <div className={`mt-1 flex items-center justify-between ${done && m.winner_team_id === m.team_a_id ? "font-bold text-slate-950" : "text-slate-700"}`}>
        <span className="truncate">{m.team_a_name ?? "TBD"}</span>
        {(live || done) && <span className="shrink-0 tabular-nums">{m.team_a_score}</span>}
      </div>
      <div className={`flex items-center justify-between ${done && m.winner_team_id === m.team_b_id ? "font-bold text-slate-950" : "text-slate-700"}`}>
        <span className="truncate">{m.team_b_name ?? "TBD"}</span>
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

function BracketView({ tournamentId }: { tournamentId: number }) {
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
          {layout.connectors.map((d, i) => (
            <path key={i} d={d} stroke="#cbd5e1" strokeWidth={2} fill="none" />
          ))}
        </svg>
        {layout.sorted.flatMap((r, ri) =>
          r.matches.map((m) => {
            const pos = layout.positions[m.id];
            if (!pos) return null;
            return (
              <div key={m.id} className="absolute" style={{ left: pos.x, top: pos.y }}>
                <BracketMatchCard m={m} isFinal={ri === layout.sorted.length - 1 && r.matches.length === 1} />
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
        {selectedTournament && <BracketView tournamentId={selectedTournament.id} />}
      </section>
    </div>
  );
}
