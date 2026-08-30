import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, Flag, Trophy, ChevronRight, ChevronLeft, CheckCircle2, Columns, Layers, Activity, Users, Shield, MapPin, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { connectLive, matchChannel, tournamentChannel } from "@/lib/live";
import { formatDate } from "@/lib/meta";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  id: number;
  tournament_id: number;
  tournament_name?: string;
  sport?: string | null;
  round_id: number;
  round_name?: string | null;
  team_a_id?: number | null;
  team_a_name?: string | null;
  team_b_id?: number | null;
  team_b_name?: string | null;
  source_match_a_id?: number | null;
  source_match_b_id?: number | null;
  venue_name?: string | null;
  scheduled_at?: string | null;
  status: string;
  team_a_score: number;
  team_b_score: number;
  winner_team_id?: number | null;
  winner_team_name?: string | null;
  notes?: string | null;
}

interface PoolSummaryT {
  id: number;
  name: string;
  status: "draft" | "finalized";
  team_count: number;
  match_count: number;
  pending_count: number;
  teams: { id: number; name: string }[];
}

interface RoundT {
  id: number;
  name: string;
  sequence: number;
  format?: "KNOCKOUT" | "LEAGUE" | null;
  source_round_id?: number | null;
  matches: MatchT[];
  pools: PoolSummaryT[];
}

interface Bracket {
  id: number;
  name: string;
  sport?: string | null;
  status: string;
  has_pools: boolean;
  rounds: RoundT[];
}

interface TournamentSummary {
  id: number;
  name: string;
  sport?: string | null;
  status: string;
}

function ScoreLine({
  label,
  value,
  leading,
  color,
  isWinner,
  isLoser,
  onTeamClick,
  onTeamHover,
}: {
  label: string;
  value: number;
  leading: boolean;
  color: string;
  isWinner?: boolean;
  isLoser?: boolean;
  onTeamClick?: () => void;
  onTeamHover?: (hovering: boolean) => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (onTeamClick) {
          e.stopPropagation();
          onTeamClick();
        }
      }}
      onMouseEnter={() => onTeamHover?.(true)}
      onMouseLeave={() => onTeamHover?.(false)}
      className={cn(
        "group flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-all duration-150 cursor-pointer",
        isWinner
          ? "bg-emerald-950/60 ring-1 ring-emerald-500/40"
          : leading
          ? "bg-emerald-950/40"
          : isLoser
          ? "opacity-50 grayscale-[0.4]"
          : "hover:bg-white/5",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-center gap-2 truncate text-xs sm:text-sm transition-colors",
          isWinner
            ? "font-extrabold text-white"
            : leading
            ? "font-bold text-emerald-400"
            : "text-slate-300 group-hover:text-white",
        )}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full transition-transform group-hover:scale-125 shadow-sm"
          style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
        />
        {leading && <Flag className="h-3 w-3 shrink-0 text-emerald-400" />}
        {isWinner && <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" />}
        <span className="truncate">{label}</span>
      </span>
      <span
        key={value}
        className="font-heading text-lg sm:text-xl font-black tabular-nums text-white shrink-0 ml-2"
        style={{ animation: "scorePop 0.35s ease-out" }}
      >
        {value}
      </span>
    </div>
  );
}

function LiveMatchCard({ initial }: { initial: MatchT }) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const stop = connectLive(matchChannel(initial.id), (evt) => {
      setM((prev) => ({
        ...prev,
        status: evt.status,
        team_a_score: evt.team_a_score,
        team_b_score: evt.team_b_score,
        winner_team_id: evt.winner_team_id,
      }));
    });
    return stop;
  }, [initial.id]);

  const leader = m.team_a_score === m.team_b_score ? null : m.team_a_score > m.team_b_score ? "a" : "b";

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-emerald-500/50 bg-gradient-to-b from-slate-900 to-obsidian-950 p-4 shadow-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-emerald-500/10"
      style={{ animation: "liveCardAura 2.5s ease-in-out infinite" }}
      data-testid={`public-live-match-${m.id}`}
    >
      {/* Subtle Court Watermark */}
      <div className="pointer-events-none absolute -right-4 -bottom-4 opacity-5">
        <Shield className="h-28 w-28 text-white" />
      </div>

      <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2">
        <span className="font-heading font-extrabold uppercase tracking-wider text-gold">
          {m.sport ?? m.tournament_name}
        </span>
        <span className="inline-flex items-center gap-1.5 font-heading font-black tracking-widest text-emerald-400 text-[11px]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> LIVE ARENA
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span className="truncate">{m.round_name}</span>
        {m.venue_name && (
          <span className="flex items-center gap-1 truncate text-slate-300 font-semibold">
            <MapPin className="h-3 w-3 text-gold" /> {m.venue_name}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <ScoreLine label={m.team_a_name ?? "TBD"} value={m.team_a_score} leading={leader === "a"} color={RED} />
        <ScoreLine label={m.team_b_name ?? "TBD"} value={m.team_b_score} leading={leader === "b"} color={BLUE} />
      </div>
    </div>
  );
}

// Classic single-elimination bracket layout constants
const CARD_W = 224;
const CARD_H = 88;
const COL_GAP = 56;
const ROW_GAP = 20;
const HEADER_H = 44;
const COMPACT_THRESHOLD = 32;
const COMPACT_CARD_H = 44;
const COMPACT_ROW_GAP = 6;

interface Pos {
  x: number;
  y: number;
}

export interface ConnectorInfo {
  d: string;
  color: string;
  srcMatchId: number;
  targetMatchId: number;
  side: "a" | "b";
  srcTeamId?: number | null;
  roundIdx: number;
}

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
  const teamARowY = compact ? cardH * 0.32 : 42;
  const teamBRowY = compact ? cardH * 0.72 : 66;

  const sorted = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const positions: Record<number, Pos> = {};
  const centers: Record<number, number> = {};

  if (sorted.length === 0) {
    return { sorted, positions, width: 0, height: 0, connectors: [], cardH, matchById: {} };
  }

  // First round cards positioned sequentially
  sorted[0].matches.forEach((m, i) => {
    const y = HEADER_H + i * (cardH + rowGap);
    positions[m.id] = { x: 0, y };
    centers[m.id] = y + cardH / 2;
  });

  // Subsequent round cards vertically centered between their source matches
  for (let r = 1; r < sorted.length; r++) {
    const x = r * (CARD_W + COL_GAP);
    const prevMatches = sorted[r - 1].matches;
    let cursor = HEADER_H;

    sorted[r].matches.forEach((m, mIdx) => {
      let srcA = resolveSource(m, prevMatches, "a");
      let srcB = resolveSource(m, prevMatches, "b");
      if (srcA == null && prevMatches[mIdx * 2]) {
        srcA = prevMatches[mIdx * 2].id;
      }
      if (srcB == null && prevMatches[mIdx * 2 + 1]) {
        srcB = prevMatches[mIdx * 2 + 1].id;
      }

      const a = srcA != null ? centers[srcA] : undefined;
      const b = srcB != null ? centers[srcB] : undefined;
      let centerY: number;
      if (a != null && b != null) {
        centerY = (a + b) / 2;
      } else if (a != null || b != null) {
        centerY = (a ?? b)!;
      } else {
        centerY = cursor + cardH / 2;
        cursor += cardH + rowGap;
      }
      positions[m.id] = { x, y: centerY - cardH / 2 };
      centers[m.id] = centerY;
    });
  }

  const allPos = Object.values(positions);
  const width = sorted.length > 0 ? sorted.length * CARD_W + (sorted.length - 1) * COL_GAP : 0;
  const height = allPos.length > 0 ? Math.max(...allPos.map((p) => p.y)) + cardH + 20 : 0;

  const matchById: Record<number, MatchT> = {};
  sorted.forEach((r) =>
    r.matches.forEach((m) => {
      matchById[m.id] = m;
    })
  );

  const connectors: ConnectorInfo[] = [];
  for (let r = 1; r < sorted.length; r++) {
    const prevMatches = sorted[r - 1].matches;
    sorted[r].matches.forEach((m, mIdx) => {
      const target = positions[m.id];
      if (!target) return;
      const targetLeftX = target.x;
      const prevRightX = targetLeftX - COL_GAP;
      const midX = targetLeftX - COL_GAP / 2;

      let srcA = resolveSource(m, prevMatches, "a");
      if (srcA == null && prevMatches[mIdx * 2]) {
        srcA = prevMatches[mIdx * 2].id;
      }
      const aPos = srcA != null ? positions[srcA] : undefined;
      if (aPos) {
        const aY = aPos.y + cardH / 2;
        const targetAY = target.y + teamARowY;
        const srcMatch = matchById[srcA!];
        connectors.push({
          d: `M${prevRightX},${aY} H${midX} V${targetAY} H${targetLeftX}`,
          color: leaderColor(srcMatch),
          srcMatchId: srcA!,
          targetMatchId: m.id,
          side: "a",
          srcTeamId: srcMatch?.winner_team_id ?? srcMatch?.team_a_id,
          roundIdx: r,
        });
      }

      let srcB = resolveSource(m, prevMatches, "b");
      if (srcB == null && prevMatches[mIdx * 2 + 1]) {
        srcB = prevMatches[mIdx * 2 + 1].id;
      }
      const bPos = srcB != null ? positions[srcB] : undefined;
      if (bPos) {
        const bY = bPos.y + cardH / 2;
        const targetBY = target.y + teamBRowY;
        const srcMatch = matchById[srcB!];
        connectors.push({
          d: `M${prevRightX},${bY} H${midX} V${targetBY} H${targetLeftX}`,
          color: leaderColor(srcMatch),
          srcMatchId: srcB!,
          targetMatchId: m.id,
          side: "b",
          srcTeamId: srcMatch?.winner_team_id ?? srcMatch?.team_b_id,
          roundIdx: r,
        });
      }
    });
  }

  return { sorted, positions, width, height, connectors, cardH, matchById };
}

type AnchorRegistrar = (roundId: number, teamId: number, el: HTMLElement | null) => void;

function ChampionshipCelebration() {
  const particles = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => {
      const angle = (i / 22) * 360 + (Math.random() * 20 - 10);
      const rad = (angle * Math.PI) / 180;
      const dist = 45 + Math.random() * 55;
      const tx = Math.cos(rad) * dist;
      const ty = Math.sin(rad) * dist;
      const colors = ["#F59E0B", "#EF4444", "#10B981", "#3B82F6", "#FBBF24", "#F43F5E", "#FFFFFF"];
      const color = colors[i % colors.length];
      const size = 3 + (i % 3) * 2;
      return { id: i, tx, ty, color, size, delay: (i % 4) * 50 };
    });
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 -m-6 flex items-center justify-center overflow-visible z-20">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 8px ${p.color}`,
            animation: `particleBurst 1.8s cubic-bezier(0.12, 0.8, 0.32, 1) ${p.delay}ms forwards`,
            // @ts-expect-error custom CSS variable
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
          }}
        />
      ))}
    </div>
  );
}

export function BracketMatchCard({
  m,
  isFinal,
  onSelect,
  autoHeight,
  registerAnchor,
  compact,
  roundIdx = 0,
  matchIdx = 0,
  roundStatus,
  highlightedTeamId,
  onHoverTeam,
  onSelectTeam,
  isAdvancingWinner,
  isChampion,
  hasInitialRevealed = true,
}: {
  m: MatchT;
  isFinal?: boolean;
  onSelect?: (id: number) => void;
  autoHeight?: boolean;
  registerAnchor?: AnchorRegistrar;
  compact?: boolean;
  roundIdx?: number;
  matchIdx?: number;
  roundStatus?: "completed" | "current" | "future";
  highlightedTeamId?: number | null;
  onHoverTeam?: (teamId: number | null) => void;
  onSelectTeam?: (teamId: number | null) => void;
  isAdvancingWinner?: boolean;
  isChampion?: boolean;
  hasInitialRevealed?: boolean;
}) {
  const live = m.status === "ONGOING" || m.status === "PAUSED";
  const done = m.status === "COMPLETED";
  const isBye = m.notes === "Bye";
  const clickable = !!onSelect && !!m.team_a_id && !!m.team_b_id;
  const cardH = compact ? COMPACT_CARD_H : CARD_H;
  const boxStyle = autoHeight ? undefined : { width: CARD_W, height: cardH };
  const boxClass = autoHeight ? "w-full" : "shrink-0";

  // Check if card or any of its teams is part of the highlighted route
  const isTeamAHighlighted = highlightedTeamId != null && m.team_a_id === highlightedTeamId;
  const isTeamBHighlighted = highlightedTeamId != null && m.team_b_id === highlightedTeamId;
  const isCardHighlighted =
    isTeamAHighlighted || isTeamBHighlighted || (highlightedTeamId != null && m.winner_team_id === highlightedTeamId);
  const isDimmed = highlightedTeamId != null && !isCardHighlighted;

  // Entrance style calculated dynamically
  const entranceDelay = roundIdx * 90 + matchIdx * 55;
  const cardAnimation = !hasInitialRevealed
    ? `bracketEntrance 0.42s cubic-bezier(0.16, 1, 0.3, 1) ${entranceDelay}ms both`
    : isChampion && done
    ? "championAura 2.5s ease-in-out infinite"
    : live
    ? "liveCardAura 2s ease-in-out infinite"
    : isAdvancingWinner
    ? "winnerFlash 1.2s ease-out"
    : undefined;

  if (isBye) {
    const byeTeamId = m.team_a_id ?? m.team_b_id;
    return (
      <div
        style={{
          ...boxStyle,
          animation: cardAnimation,
        }}
        className={cn(
          boxClass,
          "flex flex-col justify-center rounded-xl border border-white/10 bg-obsidian-950 p-2.5 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20",
          compact ? "p-1" : "p-2.5",
          isDimmed && "opacity-30",
          isCardHighlighted && "ring-2 ring-gold border-gold/80",
        )}
      >
        <span
          ref={(el) => {
            if (byeTeamId != null) registerAnchor?.(m.round_id, byeTeamId, el);
          }}
          onClick={(e) => {
            if (byeTeamId != null && onSelectTeam) {
              e.stopPropagation();
              onSelectTeam(byeTeamId);
            }
          }}
          onMouseEnter={() => byeTeamId != null && onHoverTeam?.(byeTeamId)}
          onMouseLeave={() => byeTeamId != null && onHoverTeam?.(null)}
          className={cn(
            "truncate font-heading font-bold text-slate-200 cursor-pointer hover:text-white",
            compact && "text-xs leading-tight",
          )}
        >
          {m.team_a_name ?? m.team_b_name}
        </span>
        <span
          className={cn(
            "font-semibold uppercase tracking-wider text-slate-500 font-mono",
            compact ? "text-[9px] leading-tight" : "mt-1 text-[10px]",
          )}
        >
          {compact ? "Bye" : "Bye — Automatic Advance"}
        </span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        onClick={() => clickable && onSelect!(m.id)}
        style={{
          ...boxStyle,
          animation: cardAnimation,
        }}
        className={cn(
          boxClass,
          "relative flex flex-col justify-center gap-0.5 rounded-lg border p-1 text-xs shadow-sm transition-all duration-200",
          isChampion && done
            ? "border-gold bg-amber-950/40 ring-1 ring-gold/50"
            : live
            ? "border-emerald-500/60 bg-emerald-950/40"
            : isFinal
            ? "border-gold/80 bg-gold/10"
            : roundStatus === "completed"
            ? "border-white/10 bg-obsidian-950"
            : "border-white/10 bg-obsidian-950",
          clickable && "cursor-pointer hover:border-white/30 hover:-translate-y-0.5",
          isDimmed && "opacity-30",
          isCardHighlighted && "ring-2 ring-gold shadow-lg shadow-gold/20",
        )}
        data-testid={`bracket-match-${m.id}`}
      >
        {isChampion && done && <ChampionshipCelebration />}
        <div
          ref={(el) => {
            if (m.team_a_id != null) registerAnchor?.(m.round_id, m.team_a_id, el);
          }}
          onClick={(e) => {
            if (m.team_a_id != null && onSelectTeam) {
              e.stopPropagation();
              onSelectTeam(m.team_a_id);
            }
          }}
          onMouseEnter={() => m.team_a_id != null && onHoverTeam?.(m.team_a_id)}
          onMouseLeave={() => m.team_a_id != null && onHoverTeam?.(null)}
          className={cn(
            "flex items-center justify-between gap-1 leading-tight rounded px-1 transition-colors hover:bg-white/5",
            done && m.winner_team_id === m.team_b_id && "opacity-50 grayscale-[0.4]",
          )}
        >
          <span
            className={cn("truncate", done && m.winner_team_id === m.team_a_id && "font-black text-white")}
            style={{ color: RED }}
          >
            {m.team_a_name ?? "TBD"}
          </span>
          {(live || done) && (
            <span
              key={m.team_a_score}
              className="shrink-0 tabular-nums font-mono font-bold"
              style={{ color: RED, animation: "scorePop 0.35s ease-out" }}
            >
              {m.team_a_score}
            </span>
          )}
        </div>
        <div
          ref={(el) => {
            if (m.team_b_id != null) registerAnchor?.(m.round_id, m.team_b_id, el);
          }}
          onClick={(e) => {
            if (m.team_b_id != null && onSelectTeam) {
              e.stopPropagation();
              onSelectTeam(m.team_b_id);
            }
          }}
          onMouseEnter={() => m.team_b_id != null && onHoverTeam?.(m.team_b_id)}
          onMouseLeave={() => m.team_b_id != null && onHoverTeam?.(null)}
          className={cn(
            "flex items-center justify-between gap-1 leading-tight rounded px-1 transition-colors hover:bg-white/5",
            done && m.winner_team_id === m.team_a_id && "opacity-50 grayscale-[0.4]",
          )}
        >
          <span
            className={cn("truncate", done && m.winner_team_id === m.team_b_id && "font-black text-white")}
            style={{ color: BLUE }}
          >
            {m.team_b_name ?? "TBD"}
          </span>
          {(live || done) && (
            <span
              key={m.team_b_score}
              className="shrink-0 tabular-nums font-mono font-bold"
              style={{ color: BLUE, animation: "scorePop 0.35s ease-out" }}
            >
              {m.team_b_score}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => clickable && onSelect!(m.id)}
      style={{
        ...boxStyle,
        animation: cardAnimation,
      }}
      className={cn(
        boxClass,
        "relative flex flex-col justify-between rounded-xl border p-2.5 text-sm shadow-md transition-all duration-200",
        isChampion && done
          ? "border-gold bg-gradient-to-br from-amber-950/60 via-slate-900 to-obsidian-950 shadow-gold/20 ring-1 ring-gold/60"
          : live
          ? "border-emerald-500/60 bg-gradient-to-br from-emerald-950/40 to-obsidian-950"
          : isFinal
          ? "border-gold/60 bg-gradient-to-br from-gold/10 to-obsidian-950"
          : roundStatus === "completed"
          ? "border-white/10 bg-obsidian-950"
          : "border-white/10 bg-obsidian-950",
        clickable && "cursor-pointer hover:border-white/30 hover:-translate-y-0.5 hover:shadow-lg",
        isDimmed && "opacity-30 scale-[0.99]",
        isCardHighlighted && "ring-2 ring-gold shadow-xl shadow-gold/20 border-gold/80",
      )}
      data-testid={`bracket-match-${m.id}`}
    >
      {isChampion && done && <ChampionshipCelebration />}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono border-b border-white/5 pb-1">
        <span className="truncate">{m.venue_name ?? "Court TBD"}</span>
        {live && (
          <span className="inline-flex items-center gap-1 shrink-0 font-heading font-black text-emerald-400 tracking-wider">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
          </span>
        )}
        {m.status === "SCHEDULED" && m.scheduled_at && (
          <span className="shrink-0">{formatDate(m.scheduled_at)}</span>
        )}
      </div>
      <div
        ref={(el) => {
          if (m.team_a_id != null) registerAnchor?.(m.round_id, m.team_a_id, el);
        }}
        onClick={(e) => {
          if (m.team_a_id != null && onSelectTeam) {
            e.stopPropagation();
            onSelectTeam(m.team_a_id);
          }
        }}
        onMouseEnter={() => m.team_a_id != null && onHoverTeam?.(m.team_a_id)}
        onMouseLeave={() => m.team_a_id != null && onHoverTeam?.(null)}
        className={cn(
          "mt-1 flex items-center justify-between rounded-lg px-2 py-0.5 transition-all",
          done && m.winner_team_id === m.team_a_id
            ? "font-extrabold text-white bg-emerald-950/40 ring-1 ring-emerald-500/30"
            : done && m.winner_team_id === m.team_b_id
            ? "text-slate-500 opacity-50 grayscale-[0.4]"
            : "text-slate-200 hover:bg-white/5",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate cursor-pointer font-heading font-bold">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RED, boxShadow: `0 0 6px ${RED}66` }} />
          <span className="truncate">{m.team_a_name ?? "TBD"}</span>
        </span>
        {(live || done) && (
          <span
            key={m.team_a_score}
            className="shrink-0 tabular-nums font-mono font-black text-white ml-2"
            style={{ animation: "scorePop 0.35s ease-out" }}
          >
            {m.team_a_score}
          </span>
        )}
      </div>
      <div
        ref={(el) => {
          if (m.team_b_id != null) registerAnchor?.(m.round_id, m.team_b_id, el);
        }}
        onClick={(e) => {
          if (m.team_b_id != null && onSelectTeam) {
            e.stopPropagation();
            onSelectTeam(m.team_b_id);
          }
        }}
        onMouseEnter={() => m.team_b_id != null && onHoverTeam?.(m.team_b_id)}
        onMouseLeave={() => m.team_b_id != null && onHoverTeam?.(null)}
        className={cn(
          "flex items-center justify-between rounded-lg px-2 py-0.5 transition-all",
          done && m.winner_team_id === m.team_b_id
            ? "font-extrabold text-white bg-emerald-950/40 ring-1 ring-emerald-500/30"
            : done && m.winner_team_id === m.team_a_id
            ? "text-slate-500 opacity-50 grayscale-[0.4]"
            : "text-slate-200 hover:bg-white/5",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate cursor-pointer font-heading font-bold">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BLUE, boxShadow: `0 0 6px ${BLUE}66` }} />
          <span className="truncate">{m.team_b_name ?? "TBD"}</span>
        </span>
        {(live || done) && (
          <span
            key={m.team_b_score}
            className="shrink-0 tabular-nums font-mono font-black text-white ml-2"
            style={{ animation: "scorePop 0.35s ease-out" }}
          >
            {m.team_b_score}
          </span>
        )}
      </div>
      {done && m.winner_team_name && (
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-[11px] font-heading font-black pt-1 border-t border-white/5",
            isFinal ? "text-gold" : "text-emerald-400",
          )}
        >
          <Trophy className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {isFinal ? "CHAMPION: " : "Winner: "}
            {m.winner_team_name}
          </span>
        </div>
      )}
    </div>
  );
}

interface RosterEntry {
  full_name: string;
  role?: string | null;
}
interface MatchDetail extends MatchT {
  team_a_roster?: RosterEntry[];
  team_b_roster?: RosterEntry[];
}

function RosterColumn({ name, color, roster }: { name: string; color: string; roster?: RosterEntry[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5">
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}88` }} />
        <h4 className="truncate font-heading font-bold text-white text-sm">{name}</h4>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs">
        {(roster ?? []).map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-slate-300">
            <span className="truncate font-medium">{p.full_name}</span>
            {p.role && <span className="text-[10px] text-slate-500 font-mono">{p.role}</span>}
          </li>
        ))}
        {(roster ?? []).length === 0 && <li className="text-xs text-slate-500 py-2">No roster members listed</li>}
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
    <Dialog
      open
      onClose={onClose}
      title={detail ? `${detail.team_a_name ?? "TBD"} vs ${detail.team_b_name ?? "TBD"}` : "Match Details"}
      className="max-w-2xl"
      testId="public-match-roster-dialog"
    >
      {!detail ? (
        <p className="text-xs text-slate-400 py-6 text-center">Loading match squad rosters…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono border-b border-white/10 pb-3">
            <span className="font-heading font-bold text-gold">{detail.round_name}</span>
            <span>{detail.venue_name ?? "Venue TBD"}</span>
            {detail.scheduled_at && <span>{formatDate(detail.scheduled_at)}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <RosterColumn name={detail.team_a_name ?? "Team A"} color={RED} roster={detail.team_a_roster} />
            <RosterColumn name={detail.team_b_name ?? "Team B"} color={BLUE} roster={detail.team_b_roster} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

type RoundSegment = { type: "bracket"; rounds: RoundT[] } | { type: "pools"; round: RoundT };

function isPoolsRound(r: RoundT): boolean {
  return r.format === "LEAGUE" || (r.pools?.length ?? 0) > 0;
}

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
    if (isPoolsRound(r)) {
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
  if (isPoolsRound(r)) {
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
  if (isPoolsRound(sourceRound)) return ADVANCE;
  const match = sourceRound.matches.find((m) => m.team_a_id === teamId || m.team_b_id === teamId);
  if (!match) return NEUTRAL;
  if (match.notes === "Bye") return RED;
  if (match.winner_team_id === teamId) {
    return match.winner_team_id === match.team_a_id ? RED : BLUE;
  }
  return NEUTRAL;
}

function getRoundProgression(rounds: RoundT[]): Record<number, "completed" | "current" | "future"> {
  const result: Record<number, "completed" | "current" | "future"> = {};
  let currentAssigned = false;

  const sorted = [...rounds].sort((a, b) => a.sequence - b.sequence);
  sorted.forEach((r) => {
    const allDone = r.matches.length > 0 && r.matches.every((m) => m.status === "COMPLETED" || m.notes === "Bye");
    const hasLive = r.matches.some((m) => m.status === "ONGOING" || m.status === "PAUSED");

    if (allDone) {
      result[r.id] = "completed";
    } else if (hasLive || !currentAssigned) {
      result[r.id] = "current";
      currentAssigned = true;
    } else {
      result[r.id] = "future";
    }
  });

  return result;
}

function BracketSegment({
  rounds,
  onSelectMatch,
  registerAnchor,
  highlightedTeamId,
  onHoverTeam,
  onSelectTeam,
  advancingMatchEvents,
  hasInitialRevealed,
}: {
  rounds: RoundT[];
  onSelectMatch: (id: number) => void;
  registerAnchor?: AnchorRegistrar;
  highlightedTeamId?: number | null;
  onHoverTeam?: (teamId: number | null) => void;
  onSelectTeam?: (teamId: number | null) => void;
  advancingMatchEvents?: Record<number, number>;
  hasInitialRevealed?: boolean;
}) {
  const compact = useMemo(() => rounds.some((r) => r.matches.length >= COMPACT_THRESHOLD), [rounds]);
  const layout = useMemo(() => layoutBracket(rounds, compact), [rounds, compact]);
  const roundProgression = useMemo(() => getRoundProgression(rounds), [rounds]);

  if (layout.sorted.length === 0) return null;

  return (
    <div className="relative inline-block" style={{ width: layout.width, height: layout.height }}>
      {/* SVG Connectors with broadcast animations and energy pulses */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {layout.connectors.map((c, i) => {
          const srcMatch = layout.matchById[c.srcMatchId];
          const isLive = srcMatch?.status === "ONGOING" || srcMatch?.status === "PAUSED";
          const isWinnerPath = srcMatch?.status === "COMPLETED" && srcMatch.winner_team_id != null;
          const isHighlighted =
            highlightedTeamId != null &&
            (srcMatch?.winner_team_id === highlightedTeamId ||
              srcMatch?.team_a_id === highlightedTeamId ||
              srcMatch?.team_b_id === highlightedTeamId);
          const isDimmed = highlightedTeamId != null && !isHighlighted;
          const isAdvancing = advancingMatchEvents && advancingMatchEvents[c.srcMatchId] != null;

          const strokeColor = isHighlighted ? (c.color !== NEUTRAL ? c.color : "#F59E0B") : c.color;
          const strokeWidth = isHighlighted ? 3 : isWinnerPath ? 2 : 1.5;
          const pathOpacity = isDimmed ? 0.12 : isHighlighted ? 1 : isWinnerPath ? 0.85 : 0.4;
          // Cards drop down first; connectors begin drawing after cards have settled
          const drawDelay = 520 + (c.roundIdx - 1) * 260;

          return (
            <g key={i}>
              {/* Base connector path: slowly connects to appropriate card */}
              <path
                d={c.d}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={!hasInitialRevealed ? 350 : undefined}
                fill="none"
                opacity={pathOpacity}
                filter={isHighlighted ? "url(#glow-gold)" : undefined}
                style={{
                  animation: !hasInitialRevealed
                    ? `bracketDrawConnector 0.85s cubic-bezier(0.4, 0, 0.2, 1) ${drawDelay}ms forwards`
                    : undefined,
                  // @ts-expect-error custom CSS variable
                  "--path-length": "350",
                  "--final-opacity": String(pathOpacity),
                }}
              />

              {/* Continuous subtle flowing dashed energy on outgoing connector for LIVE matches only */}
              {isLive && (
                <path
                  d={c.d}
                  stroke={c.color !== NEUTRAL ? c.color : "#10b981"}
                  strokeWidth={2.5}
                  strokeDasharray="6 6"
                  fill="none"
                  opacity={0.9}
                  style={{ animation: "liveDashFlow 1.2s linear infinite" }}
                />
              )}

              {/* Winner Advancement Traveling Glow Pulse */}
              {isAdvancing && (
                <g>
                  <circle r="4.5" fill={c.color !== NEUTRAL ? c.color : "#F59E0B"} filter="drop-shadow(0 0 6px #ffffff)">
                    <animateMotion dur="0.75s" repeatCount="1" path={c.d} fill="freeze" />
                  </circle>
                  <circle r="9" fill={c.color !== NEUTRAL ? c.color : "#F59E0B"} opacity="0.35">
                    <animateMotion dur="0.75s" repeatCount="1" path={c.d} fill="freeze" />
                  </circle>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Round Headers */}
      {layout.sorted.map((r, cIdx) => {
        const status = roundProgression[r.id] ?? "future";
        const headerDelay = cIdx * 75;

        return (
          <div
            key={r.id}
            className="pointer-events-none absolute flex items-center justify-between"
            style={{
              left: cIdx * (CARD_W + COL_GAP),
              top: 0,
              width: CARD_W,
              animation: !hasInitialRevealed
                ? `bracketHeaderEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) ${headerDelay}ms both`
                : undefined,
            }}
          >
            <h3
              className={cn(
                "truncate font-heading text-xs font-bold uppercase tracking-wider",
                status === "current"
                  ? "text-emerald-400 font-black"
                  : status === "completed"
                  ? "text-slate-400"
                  : "text-slate-500",
              )}
            >
              {r.name}
            </h3>
            {status === "completed" && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <CheckCircle2 className="h-3 w-3 text-slate-500" />
              </span>
            )}
            {status === "current" && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              </span>
            )}
          </div>
        );
      })}

      {/* Match Cards */}
      {layout.sorted.map((r, rIdx) => {
        const isFinal = rIdx === layout.sorted.length - 1 && r.matches.length === 1;
        const status = roundProgression[r.id] ?? "future";

        return r.matches.map((m, mIdx) => {
          const pos = layout.positions[m.id];
          if (!pos) return null;
          const isAdvancing = advancingMatchEvents && advancingMatchEvents[m.id] != null;
          const isChampion = isFinal && m.status === "COMPLETED" && m.winner_team_id != null;

          return (
            <div key={m.id} className="absolute" style={{ left: pos.x, top: pos.y }}>
              <BracketMatchCard
                m={m}
                isFinal={isFinal}
                onSelect={onSelectMatch}
                registerAnchor={registerAnchor}
                compact={compact}
                roundIdx={rIdx}
                matchIdx={mIdx}
                roundStatus={status}
                highlightedTeamId={highlightedTeamId}
                onHoverTeam={onHoverTeam}
                onSelectTeam={onSelectTeam}
                isAdvancingWinner={isAdvancing}
                isChampion={isChampion}
                hasInitialRevealed={hasInitialRevealed}
              />
            </div>
          );
        });
      })}
    </div>
  );
}

interface BoundaryPathT {
  d: string;
  color: string;
  teamId: number;
  sourceRoundId: number;
  targetRoundId: number;
}

function PoolsSegment({
  round,
  registerAnchor,
  highlightedTeamId,
  onHoverTeam,
  onSelectTeam,
  hasInitialRevealed,
}: {
  round: RoundT;
  registerAnchor?: AnchorRegistrar;
  highlightedTeamId?: number | null;
  onHoverTeam?: (teamId: number | null) => void;
  onSelectTeam?: (teamId: number | null) => void;
  hasInitialRevealed?: boolean;
}) {
  return (
    <div className="inline-flex flex-col self-stretch" style={{ width: CARD_W }} data-testid={`public-pools-segment-${round.id}`}>
      <h3
        className="truncate font-heading text-xs font-bold uppercase tracking-wider text-slate-400"
        style={{
          animation: !hasInitialRevealed
            ? "bracketHeaderEntrance 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0ms both"
            : undefined,
        }}
      >
        {round.name}
      </h3>
      {round.pools.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No pools configured yet.</p>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3 mt-3">
          {round.pools.map((p, pIdx) => {
            const hasHighlightedTeam =
              highlightedTeamId != null && p.teams.some((t) => t.id === highlightedTeamId);
            const isDimmed = highlightedTeamId != null && !hasHighlightedTeam;

            return (
              <Link
                key={p.id}
                to={`/live/pools/${p.id}`}
                data-testid={`public-pool-${p.id}`}
                style={{
                  animation: !hasInitialRevealed
                    ? `bracketEntrance 0.42s cubic-bezier(0.16, 1, 0.3, 1) ${pIdx * 60 + 50}ms both`
                    : undefined,
                }}
                className={cn(
                  "block rounded-xl border p-3.5 text-left shadow-md transition-all duration-200 hover:border-gold hover:-translate-y-0.5",
                  hasHighlightedTeam
                    ? "border-emerald-500/80 bg-obsidian-950 ring-2 ring-emerald-500/30"
                    : isDimmed
                    ? "border-white/10 bg-obsidian-950 opacity-35"
                    : "border-white/10 bg-obsidian-950",
                )}
              >
                <div className="flex items-center justify-between">
                  <h4 className="truncate font-heading text-sm font-bold text-white">{p.name}</h4>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold font-mono",
                      p.status !== "finalized"
                        ? "text-slate-400"
                        : p.match_count > 0 && p.pending_count === 0
                        ? "text-emerald-400"
                        : "text-amber-400",
                    )}
                  >
                    {p.status !== "finalized" ? "Draft" : p.match_count > 0 && p.pending_count === 0 ? "Done" : "In Progress"}
                  </span>
                </div>
                <ol className="mt-2.5 space-y-1 text-xs text-slate-300">
                  {p.teams.map((t, i) => {
                    const isTeamActive = highlightedTeamId === t.id;
                    return (
                      <li
                        key={t.id}
                        ref={(el) => registerAnchor?.(round.id, t.id, el)}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectTeam?.(t.id);
                        }}
                        onMouseEnter={() => onHoverTeam?.(t.id)}
                        onMouseLeave={() => onHoverTeam?.(null)}
                        className={cn(
                          "cursor-pointer truncate rounded-lg px-2 py-0.5 transition-all",
                          isTeamActive
                            ? "bg-emerald-950/70 font-bold text-emerald-400 ring-1 ring-emerald-500/50"
                            : highlightedTeamId != null
                            ? "opacity-40"
                            : "hover:bg-white/5 hover:text-white",
                        )}
                      >
                        {i + 1}. {t.name}
                      </li>
                    );
                  })}
                  {p.teams.length === 0 && <li className="text-slate-500">No teams yet</li>}
                </ol>
                <p className="mt-2.5 text-[11px] text-slate-400 font-mono border-t border-white/5 pt-1.5">
                  {p.team_count} teams · {p.match_count} matches
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FlowDivider({ label }: { label: string }) {
  return (
    <div className="mx-4 flex shrink-0 flex-col items-center self-stretch" title={label}>
      <span className="w-px flex-1 bg-white/10" />
      <span className="my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-obsidian text-gold shadow-sm">
        <ChevronRight className="h-4 w-4" />
      </span>
      <span className="w-px flex-1 bg-white/10" />
    </div>
  );
}

interface PageT {
  index: number;
  label: string;
  shortLabel: string;
  rounds: RoundT[];
  isPoolTransition?: boolean;
}

function shortRoundName(name: string): string {
  const n = name.trim();
  if (/round\s*1/i.test(n)) return "R1";
  if (/round\s*2/i.test(n)) return "R2";
  if (/round\s*3/i.test(n)) return "R3";
  if (/round\s*4/i.test(n)) return "R4";
  if (/quarter\s*final/i.test(n)) return "QF";
  if (/semi\s*final/i.test(n)) return "SF";
  if (/final/i.test(n)) return "Final";
  if (/pool|group/i.test(n)) return "Pools";
  return n.length > 10 ? n.slice(0, 9) + "…" : n;
}

function TournamentFlow({
  tournamentId,
  onSelectMatch,
}: {
  tournamentId: number;
  onSelectMatch: (id: number) => void;
}) {
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [hasInitialRevealed, setHasInitialRevealed] = useState(false);
  const [highlightedTeamId, setHighlightedTeamId] = useState<number | null>(null);
  const [advancingMatchEvents, setAdvancingMatchEvents] = useState<Record<number, number>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [viewMode, setViewMode] = useState<"auto" | "all" | "paged">("auto");
  const prevMatchesRef = useRef<Map<number, { status: string; winner_team_id?: number | null }>>(new Map());

  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [boundaryPaths, setBoundaryPaths] = useState<BoundaryPathT[]>([]);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load bracket data and detect state transitions for winner advancement
  const load = useCallback(() => {
    return api.get<Bracket>(`/public/tournaments/${tournamentId}/bracket`).then((r) => {
      const data = r.data;
      if (!data) return;

      // Check for newly completed matches
      const newAdvancing: Record<number, number> = {};
      const newMap = new Map<number, { status: string; winner_team_id?: number | null }>();

      data.rounds.forEach((rnd) => {
        rnd.matches.forEach((m) => {
          newMap.set(m.id, { status: m.status, winner_team_id: m.winner_team_id });
          const prev = prevMatchesRef.current.get(m.id);
          if (
            prev &&
            prev.status !== "COMPLETED" &&
            m.status === "COMPLETED" &&
            m.winner_team_id != null
          ) {
            newAdvancing[m.id] = Date.now();
          }
        });
      });

      prevMatchesRef.current = newMap;
      setBracket(data);

      if (Object.keys(newAdvancing).length > 0) {
        setAdvancingMatchEvents((curr) => ({ ...curr, ...newAdvancing }));
        setTimeout(() => {
          setAdvancingMatchEvents((curr) => {
            const next = { ...curr };
            Object.keys(newAdvancing).forEach((id) => delete next[Number(id)]);
            return next;
          });
        }, 1500);
      }
    });
  }, [tournamentId]);

  // Initial load and timer to mark entrance completed
  useEffect(() => {
    setHasInitialRevealed(false);
    setCurrentPage(0);
    prevMatchesRef.current.clear();
    load().then(() => {
      const timer = setTimeout(() => {
        setHasInitialRevealed(true);
      }, 2400);
      return () => clearTimeout(timer);
    });
  }, [tournamentId, load]);

  // Real-time updates subscription
  useEffect(() => {
    const stop = connectLive(tournamentChannel(tournamentId), () => load());
    return stop;
  }, [tournamentId, load]);

  const sortedRounds = useMemo(
    () => (bracket ? [...bracket.rounds].sort((a, b) => a.sequence - b.sequence) : []),
    [bracket]
  );

  const segments = useMemo(() => (bracket ? segmentRounds(bracket.rounds) : []), [bracket]);

  // Create 2-round pages: page 0 = R1 & R2, page 1 = R2 & R3, page 2 = R3 & R4...
  const pages = useMemo<PageT[]>(() => {
    if (sortedRounds.length <= 2) {
      if (sortedRounds.length === 0) return [];
      return [
        {
          index: 0,
          label: sortedRounds.map((r) => r.name).join(" → "),
          shortLabel: sortedRounds.map((r) => shortRoundName(r.name)).join(" → "),
          rounds: sortedRounds,
          isPoolTransition: isPoolsRound(sortedRounds[0]),
        },
      ];
    }

    const result: PageT[] = [];
    for (let i = 0; i < sortedRounds.length - 1; i++) {
      const r1 = sortedRounds[i];
      const r2 = sortedRounds[i + 1];
      result.push({
        index: i,
        label: `${r1.name} → ${r2.name}`,
        shortLabel: `${shortRoundName(r1.name)} → ${shortRoundName(r2.name)}`,
        rounds: [r1, r2],
        isPoolTransition: isPoolsRound(r1) && !isPoolsRound(r2),
      });
    }
    return result;
  }, [sortedRounds]);

  const isPagedView = viewMode === "paged" || (viewMode === "auto" && isMobile);

  const activeSegments = useMemo(() => {
    if (!isPagedView || pages.length === 0) return segments;
    const activePage = pages[currentPage];
    if (!activePage) return segments;
    return segmentRounds(activePage.rounds);
  }, [isPagedView, pages, currentPage, segments]);

  const [wrapperWidth, setWrapperWidth] = useState<number>(0);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);

  useLayoutEffect(() => {
    if (!scrollWrapperRef.current) return;
    const updateDimensions = () => {
      if (scrollWrapperRef.current) {
        setWrapperWidth(scrollWrapperRef.current.clientWidth);
      }
      if (containerRef.current) {
        setNaturalHeight(containerRef.current.scrollHeight);
      }
    };
    updateDimensions();
    const ro = new ResizeObserver(updateDimensions);
    ro.observe(scrollWrapperRef.current);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", updateDimensions);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [activeSegments, currentPage, isPagedView]);

  const baseWidth = 504;
  const scaleFactor = wrapperWidth > 0 && isPagedView && wrapperWidth < baseWidth ? wrapperWidth / baseWidth : 1;

  const registerAnchor = useCallback<AnchorRegistrar>((roundId, teamId, el) => {
    const key = `${roundId}:${teamId}`;
    if (el) anchorsRef.current.set(key, el);
    else anchorsRef.current.delete(key);
  }, []);

  const recomputeBoundaries = useCallback(() => {
    const container = containerRef.current;
    if (!container || activeSegments.length < 2 || !hasInitialRevealed) {
      setBoundaryPaths([]);
      return;
    }
    const containerBox = container.getBoundingClientRect();
    const currentScale = wrapperWidth > 0 && isPagedView && wrapperWidth < 504 ? wrapperWidth / 504 : 1;
    const paths: BoundaryPathT[] = [];
    for (let i = 1; i < activeSegments.length; i++) {
      const sourceRound = segmentLastRound(activeSegments[i - 1]);
      const targetRound = segmentFirstRound(activeSegments[i]);
      const sourceTeamIds = new Set(roundTeamIds(sourceRound));
      for (const teamId of roundTeamIds(targetRound)) {
        if (!sourceTeamIds.has(teamId)) continue;
        const from = anchorsRef.current.get(`${sourceRound.id}:${teamId}`);
        const to = anchorsRef.current.get(`${targetRound.id}:${teamId}`);
        if (!from || !to) continue;
        const fromBox = from.getBoundingClientRect();
        const toBox = to.getBoundingClientRect();
        const x1 = (fromBox.right - containerBox.left) / currentScale;
        const y1 = (fromBox.top - containerBox.top + fromBox.height / 2) / currentScale;
        const x2 = (toBox.left - containerBox.left) / currentScale;
        const y2 = (toBox.top - containerBox.top + toBox.height / 2) / currentScale;
        const midX = (x1 + x2) / 2;
        paths.push({
          d: `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`,
          color: boundaryColor(sourceRound, teamId),
          teamId,
          sourceRoundId: sourceRound.id,
          targetRoundId: targetRound.id,
        });
      }
    }
    setBoundaryPaths(paths);
  }, [activeSegments, wrapperWidth, isPagedView, hasInitialRevealed]);

  useLayoutEffect(() => {
    recomputeBoundaries();
  }, [recomputeBoundaries]);

  useEffect(() => {
    window.addEventListener("resize", recomputeBoundaries);
    return () => window.removeEventListener("resize", recomputeBoundaries);
  }, [recomputeBoundaries]);

  // Click outside to clear highlighted team
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "DIV" || (e.target as HTMLElement).tagName === "svg") {
      setHighlightedTeamId(null);
    }
  }, []);

  // Touch swipe support on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || pages.length <= 1) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX.current - touchEndX;
    if (diffX > 60 && currentPage < pages.length - 1) {
      setCurrentPage((p) => Math.min(pages.length - 1, p + 1));
    } else if (diffX < -60 && currentPage > 0) {
      setCurrentPage((p) => Math.max(0, p - 1));
    }
    touchStartX.current = null;
  };

  if (!bracket) return null;
  if (sortedRounds.length === 0) return <p className="mt-4 text-xs text-slate-400 py-6 text-center">No rounds scheduled yet.</p>;

  const children: React.ReactNode[] = [];
  activeSegments.forEach((seg, i) => {
    const segKey = seg.type === "bracket" ? seg.rounds.map((r) => r.id).join("-") : String(seg.round.id);
    if (i > 0) children.push(<FlowDivider key={`div-${segKey}`} label="Winners advance" />);
    children.push(
      seg.type === "bracket" ? (
        <BracketSegment
          key={segKey}
          rounds={seg.rounds}
          onSelectMatch={onSelectMatch}
          registerAnchor={registerAnchor}
          highlightedTeamId={highlightedTeamId}
          onHoverTeam={(tId) => setHighlightedTeamId(tId)}
          onSelectTeam={(tId) => setHighlightedTeamId((prev) => (prev === tId ? null : tId))}
          advancingMatchEvents={advancingMatchEvents}
          hasInitialRevealed={hasInitialRevealed}
        />
      ) : (
        <PoolsSegment
          key={segKey}
          round={seg.round}
          registerAnchor={registerAnchor}
          highlightedTeamId={highlightedTeamId}
          onHoverTeam={(tId) => setHighlightedTeamId(tId)}
          onSelectTeam={(tId) => setHighlightedTeamId((prev) => (prev === tId ? null : tId))}
          hasInitialRevealed={hasInitialRevealed}
        />
      )
    );
  });

  return (
    <div className="mt-4 space-y-4" data-testid="public-tournament-flow">
      {/* 2-Round Pages Navigation Bar for Small Screens & Focus View */}
      {pages.length > 1 && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-obsidian-900 p-3 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Page Buttons with Round Names */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-obsidian-950 px-3 py-1.5 text-xs font-heading font-bold text-slate-300 transition-all hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none shrink-0"
                title="Previous 2 rounds"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-gold" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                {pages.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentPage(idx);
                      if (viewMode === "all") setViewMode("paged");
                    }}
                    className={cn(
                      "flex items-center gap-1 shrink-0 rounded-lg px-3 py-1.5 text-xs font-heading font-bold transition-all",
                      currentPage === idx && isPagedView
                        ? "bg-gold text-obsidian shadow-sm font-black"
                        : "border border-white/10 bg-obsidian-950 text-slate-400 hover:text-white hover:bg-white/5",
                    )}
                  >
                    <span className="sm:hidden">{p.shortLabel}</span>
                    <span className="hidden sm:inline">{p.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={currentPage === pages.length - 1}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-obsidian-950 px-3 py-1.5 text-xs font-heading font-bold text-slate-300 transition-all hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none shrink-0"
                title="Next 2 rounds"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5 text-gold" />
              </button>
            </div>

            {/* Desktop / Toggle view mode */}
            <div className="hidden md:flex items-center gap-1 rounded-lg border border-white/10 bg-obsidian-950 p-1 text-xs font-heading">
              <button
                onClick={() => setViewMode("all")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold transition-colors",
                  !isPagedView ? "bg-gold text-obsidian shadow-sm font-black" : "text-slate-400 hover:text-white",
                )}
                title="View all rounds horizontally"
              >
                <Columns className="h-3.5 w-3.5" /> Full Tournament Tree
              </button>
              <button
                onClick={() => setViewMode("paged")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold transition-colors",
                  isPagedView ? "bg-gold text-obsidian shadow-sm font-black" : "text-slate-400 hover:text-white",
                )}
                title="View 2 connected rounds per page"
              >
                <Layers className="h-3.5 w-3.5" /> 2-Round Segments
              </button>
            </div>
          </div>

          {/* Current Page Subtitle Indicator */}
          {isPagedView && pages[currentPage] && (
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-white/5 font-mono">
              <span>
                Segment {currentPage + 1} of {pages.length}: <strong className="text-white">{pages[currentPage].label}</strong>
              </span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">Swipe or tap Next to navigate adjacent rounds</span>
            </div>
          )}
        </div>
      )}

      {/* Bracket Flow Canvas */}
      <div
        className={cn(
          "w-full select-none pt-3 pb-4 rounded-xl border border-white/10 bg-obsidian-900 p-4 shadow-inner",
          isPagedView && scaleFactor < 1
            ? "flex items-start justify-center overflow-hidden"
            : "overflow-x-auto",
        )}
        ref={scrollWrapperRef}
        onClick={handleContainerClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={
          isPagedView && scaleFactor < 1 && naturalHeight > 0
            ? { height: Math.ceil(naturalHeight * scaleFactor) + 24 }
            : undefined
        }
      >
        <div
          className="relative inline-flex items-center pt-2 pb-2"
          ref={containerRef}
          style={
            isPagedView && scaleFactor < 1
              ? {
                  transform: `scale(${scaleFactor})`,
                  transformOrigin: "top center",
                  width: 504,
                }
              : undefined
          }
        >
          {/* SVG Connecting Lines from Pool Cards to next round / bracket */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible z-10">
            <defs>
              <filter id="glow-gold-boundary" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {boundaryPaths.map((p, i) => {
              const isHighlighted = highlightedTeamId != null && p.teamId === highlightedTeamId;
              const isDimmed = highlightedTeamId != null && !isHighlighted;
              const strokeColor = isHighlighted ? (p.color !== NEUTRAL ? p.color : "#F59E0B") : p.color;
              const strokeWidth = isHighlighted ? 3 : 2;
              const pathOpacity = isDimmed ? 0.12 : isHighlighted ? 1 : 0.85;

              return (
                <path
                  key={i}
                  d={p.d}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={350}
                  fill="none"
                  opacity={pathOpacity}
                  filter={isHighlighted ? "url(#glow-gold-boundary)" : undefined}
                  style={{
                    animation: "bracketDrawConnector 0.85s cubic-bezier(0.4, 0, 0.2, 1) forwards",
                    // @ts-expect-error custom CSS variable
                    "--path-length": "350",
                    "--final-opacity": String(pathOpacity),
                  }}
                />
              );
            })}
          </svg>
          {children}
        </div>
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
    ])
      .then(([l, t]) => {
        setLiveMatches(l.data);
        setTournaments(t.data);
        if (t.data.length > 0) setSelected(t.data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedTournament = useMemo(
    () => tournaments.find((t) => t.id === selected),
    [tournaments, selected]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
      {/* ARENA BROADCAST BANNER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              OFFICIAL CHAMPIONSHIP ARENA FEED
            </span>
          </div>
          <h1 className="mt-1 font-heading text-3xl sm:text-4xl font-black tracking-tight text-white">
            Live Matches & Bracket Center
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Real-time court scorecards, electronic point trackers, and live knockout tree progression.
          </p>
        </div>

        {/* TOURNAMENT SELECTOR DROPDOWN */}
        {tournaments.length > 0 && (
          <div className="shrink-0">
            <label className="block text-[10px] font-heading font-bold uppercase tracking-wider text-slate-400 mb-1">
              Select Category
            </label>
            <select
              value={selected ?? ""}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="rounded-lg border border-white/15 bg-obsidian-900 px-4 py-2 text-xs sm:text-sm font-heading font-bold text-white transition-colors hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold"
              data-testid="public-tournament-select"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* LIVE NOW SECTION */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h2 className="font-heading text-sm font-black uppercase tracking-widest text-white">
              Courts Live Now ({liveMatches.length})
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-10 text-center text-xs text-slate-400 font-mono">
            Connecting to arena telemetry…
          </div>
        ) : liveMatches.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900/60 p-6 text-center">
            <Radio className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="font-heading font-bold text-white text-sm">No Matches Currently in Progress</p>
            <p className="text-xs text-slate-400 mt-1">
              Scheduled fixtures and pool matches will stream live points here the instant the whistle blows.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveMatches.map((m) => (
              <LiveMatchCard key={m.id} initial={m} />
            ))}
          </div>
        )}
      </section>

      {/* TOURNAMENT FLOW / BRACKET / POOLS */}
      <section className="space-y-3 pt-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold" />
            <h2 className="font-heading text-sm font-black uppercase tracking-widest text-white">
              Championship Tournament Progression
            </h2>
          </div>
          {selectedTournament && (
            <span className="font-heading font-bold text-xs text-gold">
              {selectedTournament.name}
            </span>
          )}
        </div>

        {!loading && tournaments.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8 text-center text-xs text-slate-400">
            No published tournament categories found.
          </div>
        )}

        {selectedTournament && (
          <TournamentFlow tournamentId={selectedTournament.id} onSelectMatch={setRosterMatchId} />
        )}
      </section>

      {rosterMatchId && <MatchRosterDialog matchId={rosterMatchId} onClose={() => setRosterMatchId(null)} />}
    </div>
  );
}
