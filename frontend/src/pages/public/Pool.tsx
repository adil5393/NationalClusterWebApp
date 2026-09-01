import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trophy, Shield, Calendar, Users, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { connectLive, tournamentChannel } from "@/lib/live";
import { BracketMatchCard, MatchRosterDialog, MatchT } from "./Live";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface PoolDetail {
  id: number;
  name: string;
  status: "draft" | "finalized";
  tournament_id: number;
  round_id: number;
  team_count: number;
  match_count: number;
  teams: { id: number; name: string }[];
  matches: MatchT[];
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

export default function Pool() {
  const { poolId } = useParams<{ poolId: string }>();
  const [pool, setPool] = useState<PoolDetail | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterMatchId, setRosterMatchId] = useState<number | null>(null);

  const load = () => {
    Promise.all([
      api.get<PoolDetail>(`/public/pools/${poolId}`),
      api.get<StandingRow[]>(`/public/pools/${poolId}/standings`),
    ])
      .then(([p, s]) => {
        setPool(p.data);
        setStandings(s.data);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pool) return;
    const stop = connectLive(tournamentChannel(pool.tournament_id), () => load());
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.tournament_id]);

  const hasResults = standings.some((s) => s.played > 0);
  const pendingCount =
    pool?.matches.filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED").length ?? 0;
  const isDone = !!pool && pool.status === "finalized" && pool.matches.length > 0 && pendingCount === 0;

  const liveMatches = pool?.matches.filter((m) => m.status === "ONGOING" || m.status === "PAUSED") ?? [];
  const pendingMatches = pool?.matches.filter((m) => m.status === "SCHEDULED" || m.status === "POSTPONED") ?? [];
  const completedMatches = pool?.matches.filter((m) => m.status === "COMPLETED") ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <Link
        to="/live"
        className="inline-flex items-center gap-1.5 text-xs font-heading font-bold text-slate-400 hover:text-gold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Live &amp; Fixtures Center
      </Link>

      {loading || !pool ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16 text-center text-xs text-slate-400 font-mono">
          Loading pool fixtures &amp; standings…
        </div>
      ) : (
        <>
          {/* POOL HEADER */}
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-5 sm:p-6 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-gold">
                  POOL STAGE COMPETITION
                </span>
                <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {pool.name}
                </h1>
                <p className="mt-0.5 text-xs text-slate-400 font-body">
                  {pool.team_count} teams enrolled · {pool.match_count} round-robin fixtures
                </p>
              </div>

              <div className="shrink-0">
                <Badge
                  tone={pool.status !== "finalized" ? "neutral" : isDone ? "green" : "amber"}
                  size="md"
                >
                  {pool.status !== "finalized" ? "Draft Setup" : isDone ? "Pool Complete" : "Fixtures Active"}
                </Badge>
              </div>
            </div>

            {/* TEAMS PILLS */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-heading font-bold text-slate-400">Squads:</span>
              {pool.teams.map((t) => (
                <span
                  key={t.id}
                  className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200"
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>

          {/* STANDINGS TABLE */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-gold" />
                <h2 className="font-heading text-sm font-black uppercase tracking-widest text-white">
                  Group Standings Table
                </h2>
              </div>
              {hasResults && standings[0] && (
                <span className="inline-flex items-center gap-1 text-xs font-heading font-bold text-gold">
                  <Trophy className="h-3.5 w-3.5" /> {standings[0].team_name} currently leads
                </span>
              )}
            </div>

            {!hasResults ? (
              <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6 text-center text-xs text-slate-400">
                No completed matches in this pool yet. Standings will populate automatically as results conclude.
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-obsidian-900 shadow-md overflow-hidden">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-12">#</TH>
                      <TH>Delegation Team</TH>
                      <TH className="text-right">Played</TH>
                      <TH className="text-right">Won</TH>
                      <TH className="text-right">Lost</TH>
                      <TH className="text-right">Drawn</TH>
                      <TH className="text-right">Pts For</TH>
                      <TH className="text-right">Pts Agst</TH>
                      <TH className="text-right">Total Pts</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {standings.map((s) => {
                      const isLeader = s.position === 1;
                      return (
                        <TR
                          key={s.team_id}
                          className={cn(isLeader && "bg-gold/10 hover:bg-gold/15")}
                        >
                          <TD className="font-mono font-bold text-xs text-slate-400">
                            {s.position}
                          </TD>
                          <TD>
                            <span
                              className={cn(
                                "flex items-center gap-1.5 font-heading text-sm truncate",
                                isLeader ? "font-black text-white" : "font-bold text-slate-200",
                              )}
                              title={s.team_name}
                            >
                              {isLeader && <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" />}
                              <span className="truncate">{s.team_name}</span>
                            </span>
                          </TD>
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
                          <TD
                            className={cn(
                              "text-right font-heading text-base font-black tabular-nums",
                              isLeader ? "text-gold" : "text-white",
                            )}
                          >
                            {s.points}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>
            )}
          </section>

          {/* FIXTURES SECTION */}
          <section className="space-y-6 pt-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gold" />
                <h2 className="font-heading text-sm font-black uppercase tracking-widest text-white">
                  Pool Fixtures &amp; Scorecards ({pool.matches.length})
                </h2>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                {liveMatches.length > 0
                  ? `${liveMatches.length} Live Now`
                  : pendingMatches.length > 0
                  ? `${pendingMatches.length} Upcoming`
                  : "All Fixtures Concluded"}
              </span>
            </div>

            {pool.matches.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6 text-center text-xs text-slate-400">
                Fixtures have not been finalized for this pool yet.
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. LIVE MATCHES */}
                {liveMatches.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <h3 className="font-heading text-xs font-black uppercase tracking-wider text-emerald-400">
                        Live Now ({liveMatches.length})
                      </h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {liveMatches.map((m) => (
                        <BracketMatchCard key={m.id} m={m} autoHeight onSelect={setRosterMatchId} />
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. UPCOMING / PENDING MATCHES */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-gold" />
                      <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-200">
                        Upcoming Fixtures ({pendingMatches.length})
                      </h3>
                    </div>
                  </div>

                  {pendingMatches.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-obsidian-900/40 p-4 text-center text-xs text-slate-400">
                      No upcoming matches remaining in this pool.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {pendingMatches.map((m) => (
                        <BracketMatchCard key={m.id} m={m} autoHeight onSelect={setRosterMatchId} />
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. COMPLETED RESULTS */}
                {completedMatches.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-3.5 w-3.5 text-slate-400" />
                      <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-400">
                        Completed Results ({completedMatches.length})
                      </h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {completedMatches.map((m) => (
                        <BracketMatchCard key={m.id} m={m} autoHeight onSelect={setRosterMatchId} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {rosterMatchId && <MatchRosterDialog matchId={rosterMatchId} onClose={() => setRosterMatchId(null)} />}
    </div>
  );
}
