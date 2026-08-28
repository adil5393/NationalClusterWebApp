import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, Flag, Trophy, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { connectLive, matchChannel, tournamentChannel } from "@/lib/live";
import { formatDate } from "@/lib/meta";
import { Dialog } from "@/components/ui/dialog";

// Every match has two sides — team A is always red, team B is always blue,
// regardless of which actual team ends up in that slot as the bracket fills
// in. Live/completed connector lines borrow whichever color is currently
// ahead (or the winner's, once decided).
export const RED = "#ef4444";
export const BLUE = "#3b82f6";
const NEUTRAL = "#334155";
// A team crossing from a pool into the next stage has no "side" the way a
// knockout match's two slots do, so boundary connectors leaving a pool use
// this instead of red/blue — the same emerald already used for "qualified"
// elsewhere on this page.
const ADVANCE = "#10b981";

export interface MatchT {
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
interface PoolSummaryT { id: number; name: string; status: "draft" | "finalized"; team_count: number; match_count: number; teams: { id: number; name: string }[] }
interface RoundT {
  id: number; name: string; sequence: number;
  format?: "KNOCKOUT" | "LEAGUE" | null; source_round_id?: number | null;
  matches: MatchT[]; pools: PoolSummaryT[];
}
interface Bracket { id: number; name: string; sport?: string | null; status: string; has_pools: boolean; rounds: RoundT[] }
interface TournamentSummary { id: number; name: string; sport?: string | null; status: string }

function ScoreLine({ label, value, leading, color }: { label: string; value: number; leading: boolean; color: string }) {
  return (
    <div className={`flex items-center justify-between rounded px-2 py-1 ${leading ? "bg-emerald-950/40" : ""}`}>
      <span className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${leading ? "font-bold text-emerald-400" : "text-slate-300"}`}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        {leading && <Flag className="h-3 w-3 shrink-0 text-emerald-400" />}
        <span className="truncate">{label}</span>
      </span>
      <span key={value} className="font-heading text-lg font-black tabular-nums text-white">{value}</span>
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
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm" data-testid={`public-live-match-${m.id}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold uppercase tracking-wide text-slate-400">{m.sport ?? m.tournament_name}</span>
        <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{m.round_name}</p>
      <div className="mt-2 space-y-1">
        <ScoreLine label={m.team_a_name ?? "TBD"} value={m.team_a_score} leading={leader === "a"} color={RED} />
        <ScoreLine label={m.team_b_name ?? "TBD"} value={m.team_b_score} leading={leader === "b"} color={BLUE} />
      </div>
    </div>
  );
}

// Classic single-elimination bracket layout
const CARD_W = 224;
const CARD_H = 88;
const COL_GAP = 56;
const ROW_GAP = 20;
const HEADER_H = 32;
const COMPACT_THRESHOLD = 32;
const COMPACT_CARD_H = 44;
const COMPACT_ROW_GAP = 6;

interface Pos { x: number; y: number }

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

function resolveSource(m: MatchT, prevRoundMatches: MatchT[], side: "a" | "b"): number | undefined {
  const explicit = side === "a" ? m.source_match_a_id : m.source_match_b_id;
  if (explicit != null) return explicit;
  const teamId = side === "a" ? m.team_a_id : m.team_b_id;
  if (teamId == null) return undefined;
  return prevRoundMatches.find((pm) => pm.winner_team_id === teamId)?.id;
}

function layoutBracket(rounds: RoundT[], compact: boolean) {
  const cardH = compact ? COMPACT_CARD_H : CARD_H;
  const rowGap = compact ? COMPACT_ROW_GAP : ROW_GAP;
  const teamARowY = compact ? cardH * 0.32 : 34;
  const teamBRowY = compact ? cardH * 0.72 : 60;

  const sorted = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const positions: Record<number, Pos> = {};
  const centers: Record<number, number> = {};

  sorted[0]?.matches.forEach((m, i) => {
    const y = HEADER_H + i * (cardH + rowGap);
    positions[m.id] = { x: 0, y };
    centers[m.id] = y + cardH / 2;
  });

  for (let r = 1; r < sorted.length; r++) {
    const x = r * (CARD_W + COL_GAP);
    const prevMatches = sorted[r - 1].matches;
    let cursor = HEADER_H;
    sorted[r].matches.forEach((m) => {
      const srcA = resolveSource(m, prevMatches, "a");
      const srcB = resolveSource(m, prevMatches, "b");
      const a = srcA != null ? centers[srcA] : undefined;
      const b = srcB != null ? centers[srcB] : undefined;
      let centerY: number;
      if (a != null && b != null) centerY = (a + b) / 2;
      else if (a != null || b != null) centerY = (a ?? b)!;
      else { centerY = cursor + cardH / 2; cursor += cardH + rowGap; }
      positions[m.id] = { x, y: centerY - cardH / 2 };
      centers[m.id] = centerY;
    });
  }

  const allPos = Object.values(positions);
  const width = sorted.length > 0 ? sorted.length * CARD_W + (sorted.length - 1) * COL_GAP : 0;
  const height = allPos.length > 0 ? Math.max(...allPos.map((p) => p.y)) + cardH : 0;

  const matchById: Record<number, MatchT> = {};
  sorted.forEach((r) => r.matches.forEach((m) => { matchById[m.id] = m; }));

  const connectors: { d: string; color: string }[] = [];
  for (let r = 1; r < sorted.length; r++) {
    const prevMatches = sorted[r - 1].matches;
    sorted[r].matches.forEach((m) => {
      const target = positions[m.id];
      if (!target) return;
      const targetLeftX = target.x;
      const prevRightX = targetLeftX - COL_GAP;
      const midX = targetLeftX - COL_GAP / 2;

      const srcA = resolveSource(m, prevMatches, "a");
      const aPos = srcA != null ? positions[srcA] : undefined;
      if (aPos) {
        const aY = aPos.y + cardH / 2;
        const targetAY = target.y + teamARowY;
        connectors.push({ d: `M${prevRightX},${aY} H${midX} V${targetAY} H${targetLeftX}`, color: leaderColor(matchById[srcA!]) });
      }
      const srcB = resolveSource(m, prevMatches, "b");
      const bPos = srcB != null ? positions[srcB] : undefined;
      if (bPos) {
        const bY = bPos.y + cardH / 2;
        const targetBY = target.y + teamBRowY;
        connectors.push({ d: `M${prevRightX},${bY} H${midX} V${targetBY} H${targetLeftX}`, color: leaderColor(matchById[srcB!]) });
      }
    });
  }

  return { sorted, positions, width, height, connectors, cardH };
}

type AnchorRegistrar = (roundId: number, teamId: number, el: HTMLElement | null) => void;

export function BracketMatchCard({ m, isFinal, onSelect, autoHeight, registerAnchor, compact }: {
  m: MatchT; isFinal?: boolean; onSelect?: (id: number) => void; autoHeight?: boolean;
  registerAnchor?: AnchorRegistrar; compact?: boolean;
}) {
  const live = m.status === "ONGOING" || m.status === "PAUSED";
  const done = m.status === "COMPLETED";
  const isBye = m.notes === "Bye";
  const clickable = !!onSelect && !!m.team_a_id && !!m.team_b_id;
  const cardH = compact ? COMPACT_CARD_H : CARD_H;
  const boxStyle = autoHeight ? undefined : { width: CARD_W, height: cardH };
  const boxClass = autoHeight ? "w-full" : "shrink-0";

  if (isBye) {
    const byeTeamId = m.team_a_id ?? m.team_b_id;
    return (
      <div style={boxStyle} className={`${boxClass} flex flex-col justify-center rounded-md border border-slate-800 bg-obsidian ${compact ? "p-1" : "p-2.5"} text-sm`}>
        <span
          ref={(el) => { if (byeTeamId != null) registerAnchor?.(m.round_id, byeTeamId, el); }}
          className={`truncate font-bold text-slate-200 ${compact ? "text-xs leading-tight" : ""}`}
        >
          {m.team_a_name ?? m.team_b_name}
        </span>
        <span className={`font-semibold uppercase tracking-wide text-slate-500 ${compact ? "text-[9px] leading-tight" : "mt-1 text-[11px]"}`}>
          {compact ? "Bye" : "Bye — advances automatically"}
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        onClick={() => clickable && onSelect!(m.id)}
        style={boxStyle}
        className={`${boxClass} flex flex-col justify-center gap-0.5 rounded-md border p-1 text-xs shadow-sm transition-shadow ${live ? "border-emerald-500/50 bg-emerald-950/40" : isFinal ? "border-coral bg-coral/10" : "border-slate-800 bg-slate-900"} ${clickable ? "cursor-pointer hover:border-slate-700" : ""}`}
        data-testid={`bracket-match-${m.id}`}
      >
        <div
          ref={(el) => { if (m.team_a_id != null) registerAnchor?.(m.round_id, m.team_a_id, el); }}
          className="flex items-center justify-between gap-1 leading-tight"
        >
          <span className={`truncate ${done && m.winner_team_id === m.team_a_id ? "font-bold text-white" : ""}`} style={{ color: RED }}>{m.team_a_name ?? "TBD"}</span>
          {(live || done) && <span className="shrink-0 tabular-nums font-bold" style={{ color: RED }}>{m.team_a_score}</span>}
        </div>
        <div
          ref={(el) => { if (m.team_b_id != null) registerAnchor?.(m.round_id, m.team_b_id, el); }}
          className="flex items-center justify-between gap-1 leading-tight"
        >
          <span className={`truncate ${done && m.winner_team_id === m.team_b_id ? "font-bold text-white" : ""}`} style={{ color: BLUE }}>{m.team_b_name ?? "TBD"}</span>
          {(live || done) && <span className="shrink-0 tabular-nums font-bold" style={{ color: BLUE }}>{m.team_b_score}</span>}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => clickable && onSelect!(m.id)}
      style={boxStyle}
      className={`${boxClass} rounded-md border p-2.5 text-sm shadow-sm transition-shadow ${live ? "border-emerald-500/50 bg-emerald-950/40" : isFinal ? "border-coral bg-coral/10" : "border-slate-800 bg-slate-900"} ${clickable ? "cursor-pointer hover:border-slate-700" : ""}`}
      data-testid={`bracket-match-${m.id}`}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate">{m.venue_name ?? "Venue TBD"}</span>
        {live && <span className="shrink-0 font-bold text-emerald-400">● LIVE</span>}
        {m.status === "SCHEDULED" && m.scheduled_at && <span className="shrink-0">{formatDate(m.scheduled_at)}</span>}
      </div>
      <div
        ref={(el) => { if (m.team_a_id != null) registerAnchor?.(m.round_id, m.team_a_id, el); }}
        className={`mt-1 flex items-center justify-between ${done && m.winner_team_id === m.team_a_id ? "font-bold text-white" : "text-slate-300"}`}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RED }} />
          <span className="truncate">{m.team_a_name ?? "TBD"}</span>
        </span>
        {(live || done) && <span className="shrink-0 tabular-nums font-bold text-white">{m.team_a_score}</span>}
      </div>
      <div
        ref={(el) => { if (m.team_b_id != null) registerAnchor?.(m.round_id, m.team_b_id, el); }}
        className={`flex items-center justify-between ${done && m.winner_team_id === m.team_b_id ? "font-bold text-white" : "text-slate-300"}`}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BLUE }} />
          <span className="truncate">{m.team_b_name ?? "TBD"}</span>
        </span>
        {(live || done) && <span className="shrink-0 tabular-nums font-bold text-white">{m.team_b_score}</span>}
      </div>
      {done && m.winner_team_name && (
        <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-emerald-400">
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
      <div className="flex items-center gap-1.5 border-b border-white/10 pb-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <h4 className="truncate font-heading font-bold text-white">{name}</h4>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {(roster ?? []).map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-slate-300">
            <span className="truncate">{p.full_name}</span>
            {p.role && <span className="text-xs text-slate-500">{p.role}</span>}
          </li>
        ))}
        {(roster ?? []).length === 0 && (
          <li className="text-xs text-slate-500">No roster members listed</li>
        )}
      </ul>
    </div>
  );
}

export function MatchRosterDialog({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  useEffect(() => {
    api.get<MatchDetail>(`/public/matches/${matchId}`).then((r) => setDetail(r.data));
  }, [matchId]);

  return (
    <Dialog open onClose={onClose} title={detail ? `${detail.team_a_name ?? "TBD"} vs ${detail.team_b_name ?? "TBD"}` : "Match Details"} className="max-w-2xl border-slate-800 bg-slate-900 text-white" testId="public-match-roster-dialog">
      {!detail ? <p className="text-sm text-slate-400">Loading roster…</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>{detail.round_name}</span>
            <span>{detail.venue_name ?? "Venue TBD"}</span>
            {detail.scheduled_at && <span>{formatDate(detail.scheduled_at)}</span>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <RosterColumn name={detail.team_a_name ?? "Team A"} color={RED} roster={detail.team_a_roster} />
            <RosterColumn name={detail.team_b_name ?? "Team B"} color={BLUE} roster={detail.team_b_roster} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

type RoundSegment =
  | { type: "bracket"; rounds: RoundT[] }
  | { type: "pools"; round: RoundT };

function segmentRounds(rounds: RoundT[]): RoundSegment[] {
  const sorted = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const segments: RoundSegment[] = [];
  let bracketBuf: RoundT[] = [];

  const flushBracket = () => {
    if (bracketBuf.length > 0) {
      segments.push({ type: "bracket", rounds: bracketBuf });
      bracketBuf = [];
    }
  };

  for (const r of sorted) {
    if (r.format === "LEAGUE") {
      flushBracket();
      segments.push({ type: "pools", round: r });
    } else {
      bracketBuf.push(r);
    }
  }
  flushBracket();
  return segments;
}

function segmentFirstRound(seg: RoundSegment): RoundT {
  return seg.type === "bracket" ? seg.rounds[0] : seg.round;
}
function segmentLastRound(seg: RoundSegment): RoundT {
  return seg.type === "bracket" ? seg.rounds[seg.rounds.length - 1] : seg.round;
}

function roundTeamIds(r: RoundT): number[] {
  if (r.format === "LEAGUE") {
    return (r.pools ?? []).flatMap((p) => p.teams.map((t) => t.id));
  }
  const ids: number[] = [];
  for (const m of r.matches) {
    if (m.team_a_id != null) ids.push(m.team_a_id);
    if (m.team_b_id != null) ids.push(m.team_b_id);
  }
  return ids;
}

function boundaryColor(sourceRound: RoundT, teamId: number): string {
  if (sourceRound.format === "LEAGUE") return ADVANCE;
  const match = sourceRound.matches.find((m) => m.team_a_id === teamId || m.team_b_id === teamId);
  if (!match) return NEUTRAL;
  if (match.notes === "Bye") return RED;
  if (match.winner_team_id === teamId) {
    return match.winner_team_id === match.team_a_id ? RED : BLUE;
  }
  return NEUTRAL;
}

function BracketSegment({ rounds, onSelectMatch, registerAnchor }: {
  rounds: RoundT[]; onSelectMatch: (id: number) => void; registerAnchor?: AnchorRegistrar;
}) {
  const compact = useMemo(
    () => rounds.some((r) => r.matches.length >= COMPACT_THRESHOLD),
    [rounds],
  );
  const layout = useMemo(() => layoutBracket(rounds, compact), [rounds, compact]);

  if (layout.sorted.length === 0) return null;

  return (
    <div className="relative inline-block" style={{ width: layout.width, height: layout.height }}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {layout.connectors.map((c, i) => (
          <path key={i} d={c.d} stroke={c.color} strokeWidth={2} fill="none" opacity={0.85} />
        ))}
      </svg>
      {layout.sorted.map((r, cIdx) => (
        <div key={r.id} className="pointer-events-none absolute" style={{ left: cIdx * (CARD_W + COL_GAP), top: 0, width: CARD_W }}>
          <h3 className="truncate font-heading text-xs font-bold uppercase tracking-wider text-slate-400">
            {r.name}
          </h3>
        </div>
      ))}
      {layout.sorted.map((r, rIdx) => {
        const isFinal = rIdx === layout.sorted.length - 1 && r.matches.length === 1;
        return r.matches.map((m) => {
          const pos = layout.positions[m.id];
          if (!pos) return null;
          return (
            <div key={m.id} className="absolute" style={{ left: pos.x, top: pos.y }}>
              <BracketMatchCard m={m} isFinal={isFinal} onSelect={onSelectMatch} registerAnchor={registerAnchor} compact={compact} />
            </div>
          );
        });
      })}
    </div>
  );
}

function PoolsSegment({ round, registerAnchor }: { round: RoundT; registerAnchor?: AnchorRegistrar }) {
  return (
    <div className="inline-block align-top" style={{ width: CARD_W }} data-testid={`public-pools-segment-${round.id}`}>
      <h3 className="truncate font-heading text-xs font-bold uppercase tracking-wider text-slate-400">
        {round.name}
      </h3>
      {round.pools.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No pools configured yet.</p>
      ) : (
        <div className="flex flex-col gap-3 mt-3">
          {round.pools.map((p) => (
            <Link
              key={p.id}
              to={`/live/pools/${p.id}`}
              data-testid={`public-pool-${p.id}`}
              className="block rounded-md border border-slate-800 bg-slate-900 p-3 text-left shadow-sm transition-shadow hover:border-coral"
            >
              <div className="flex items-center justify-between">
                <h4 className="truncate font-heading text-sm font-bold text-white">{p.name}</h4>
                <span className={`shrink-0 text-xs font-semibold ${p.status === "finalized" ? "text-emerald-400" : "text-slate-400"}`}>
                  {p.status === "finalized" ? "Ready" : "Draft"}
                </span>
              </div>
              <ol className="mt-2 space-y-0.5 text-xs text-slate-300">
                {p.teams.map((t, i) => (
                  <li key={t.id} ref={(el) => registerAnchor?.(round.id, t.id, el)} className="truncate">{i + 1}. {t.name}</li>
                ))}
                {p.teams.length === 0 && <li className="text-slate-500">No teams yet</li>}
              </ol>
              <p className="mt-2 text-xs text-slate-400">{p.team_count} teams · {p.match_count} matches</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FlowDivider({ label }: { label: string }) {
  return (
    <div className="mx-4 flex shrink-0 flex-col items-center self-stretch" title={label}>
      <span className="w-px flex-1 bg-white/10" />
      <span className="my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-obsidian text-slate-400">
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
      <span className="w-px flex-1 bg-white/10" />
    </div>
  );
}

function TournamentFlow({ tournamentId, onSelectMatch }: { tournamentId: number; onSelectMatch: (id: number) => void }) {
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [boundaryPaths, setBoundaryPaths] = useState<{ d: string; color: string }[]>([]);

  const load = () => api.get<Bracket>(`/public/tournaments/${tournamentId}/bracket`).then((r) => setBracket(r.data));
  useEffect(() => { load(); }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stop = connectLive(tournamentChannel(tournamentId), () => load());
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const segments = useMemo(() => (bracket ? segmentRounds(bracket.rounds) : []), [bracket]);

  const registerAnchor = useCallback<AnchorRegistrar>((roundId, teamId, el) => {
    const key = `${roundId}:${teamId}`;
    if (el) anchorsRef.current.set(key, el);
    else anchorsRef.current.delete(key);
  }, []);

  const recomputeBoundaries = useCallback(() => {
    const container = containerRef.current;
    if (!container || segments.length < 2) { setBoundaryPaths([]); return; }
    const containerBox = container.getBoundingClientRect();
    const paths: { d: string; color: string }[] = [];
    for (let i = 1; i < segments.length; i++) {
      const sourceRound = segmentLastRound(segments[i - 1]);
      const targetRound = segmentFirstRound(segments[i]);
      const sourceTeamIds = new Set(roundTeamIds(sourceRound));
      for (const teamId of roundTeamIds(targetRound)) {
        if (!sourceTeamIds.has(teamId)) continue;
        const from = anchorsRef.current.get(`${sourceRound.id}:${teamId}`);
        const to = anchorsRef.current.get(`${targetRound.id}:${teamId}`);
        if (!from || !to) continue;
        const fromBox = from.getBoundingClientRect();
        const toBox = to.getBoundingClientRect();
        const x1 = fromBox.right - containerBox.left;
        const y1 = fromBox.top - containerBox.top + fromBox.height / 2;
        const x2 = toBox.left - containerBox.left;
        const y2 = toBox.top - containerBox.top + toBox.height / 2;
        const midX = (x1 + x2) / 2;
        paths.push({ d: `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`, color: boundaryColor(sourceRound, teamId) });
      }
    }
    setBoundaryPaths(paths);
  }, [segments]);

  useLayoutEffect(() => { recomputeBoundaries(); }, [recomputeBoundaries]);

  useEffect(() => {
    window.addEventListener("resize", recomputeBoundaries);
    return () => window.removeEventListener("resize", recomputeBoundaries);
  }, [recomputeBoundaries]);

  if (!bracket) return null;
  if (segments.length === 0) return <p className="mt-4 text-sm text-slate-400">No rounds yet.</p>;

  const children: React.ReactNode[] = [];
  segments.forEach((seg, i) => {
    const segKey = seg.type === "bracket" ? seg.rounds.map((r) => r.id).join("-") : String(seg.round.id);
    if (i > 0) children.push(<FlowDivider key={`div-${segKey}`} label="Winners advance" />);
    children.push(
      seg.type === "bracket"
        ? <BracketSegment key={segKey} rounds={seg.rounds} onSelectMatch={onSelectMatch} registerAnchor={registerAnchor} />
        : <PoolsSegment key={segKey} round={seg.round} registerAnchor={registerAnchor} />,
    );
  });

  return (
    <div className="mt-4 overflow-x-auto pb-2" ref={scrollWrapperRef} data-testid="public-tournament-flow">
      <div className="relative inline-flex items-center" ref={containerRef}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {boundaryPaths.map((p, i) => (
            <path key={i} d={p.d} stroke={p.color} strokeWidth={2} fill="none" opacity={0.85} />
          ))}
        </svg>
        {children}
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
    <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 text-slate-100">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-coral" />
        <h1 className="font-heading text-2xl font-black tracking-tight text-white">Live &amp; Fixtures</h1>
      </div>
      <p className="mt-1 text-sm text-slate-400">Live scores and the tournament bracket, updating in real time.</p>

      <section className="mt-8">
        <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-400">Live Now</h2>
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
          <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-400">Tournament Flow</h2>
          {tournaments.length > 0 && (
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="rounded-md border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white"
              data-testid="public-tournament-select"
            >
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        {!loading && tournaments.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">No published tournaments yet.</p>
        )}
        {selectedTournament && <TournamentFlow tournamentId={selectedTournament.id} onSelectMatch={setRosterMatchId} />}
      </section>

      {rosterMatchId && <MatchRosterDialog matchId={rosterMatchId} onClose={() => setRosterMatchId(null)} />}
    </div>
  );
}
