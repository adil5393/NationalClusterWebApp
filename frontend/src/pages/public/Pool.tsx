import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { connectLive, tournamentChannel } from "@/lib/live";
import { BracketMatchCard, MatchRosterDialog, MatchT } from "./Live";

interface PoolDetail {
  id: number; name: string; status: "draft" | "finalized"; tournament_id: number; round_id: number;
  team_count: number; match_count: number; teams: { id: number; name: string }[]; matches: MatchT[];
}
interface StandingRow {
  team_id: number; team_name: string; played: number; won: number; lost: number; drawn: number;
  points_for: number; points_against: number; points: number; position: number;
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
    ]).then(([p, s]) => { setPool(p.data); setStandings(s.data); }).finally(() => setLoading(false));
  };
  useEffect(load, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pool) return;
    const stop = connectLive(tournamentChannel(pool.tournament_id), () => load());
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.tournament_id]);

  const hasResults = standings.some((s) => s.played > 0);
  // A cancelled match needs no result to count as resolved — a pool with one
  // cancelled match and the rest completed is done, not stuck "in progress".
  const pendingCount = pool?.matches.filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED").length ?? 0;
  const isDone = !!pool && pool.status === "finalized" && pool.matches.length > 0 && pendingCount === 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 text-slate-100">
      <Link to="/live" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-coral">
        <ArrowLeft className="h-4 w-4" /> Back to Live &amp; Fixtures
      </Link>

      {loading || !pool ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <h1 className="font-heading text-2xl font-black tracking-tight text-white">{pool.name}</h1>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${pool.status !== "finalized" ? "bg-white/5 border border-white/10 text-slate-400" : isDone ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400" : "bg-amber-500/15 border border-amber-500/30 text-amber-400"}`}>
              {pool.status !== "finalized" ? "Draft" : isDone ? "Done" : "Fixtures Ready"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{pool.team_count} teams · {pool.match_count} matches</p>

          <section className="mt-8">
            <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-400">Fixtures</h2>
            {pool.matches.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">Not generated yet.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pool.matches.map((m) => <BracketMatchCard key={m.id} m={m} autoHeight onSelect={setRosterMatchId} />)}
              </div>
            )}
          </section>

          <section className="mt-10">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-400">Standings</h2>
              {hasResults && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-bold text-amber-400">
                  <Trophy className="h-3 w-3" /> {standings[0].team_name} leads
                </span>
              )}
            </div>
            {!hasResults ? (
              <p className="mt-2 text-sm text-slate-400">No completed matches yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Team</th>
                      <th className="px-3 py-2.5 text-right">P</th>
                      <th className="px-3 py-2.5 text-right">W</th>
                      <th className="px-3 py-2.5 text-right">L</th>
                      <th className="px-3 py-2.5 text-right">D</th>
                      <th className="px-3 py-2.5 text-right">PF</th>
                      <th className="px-3 py-2.5 text-right">PA</th>
                      <th className="px-3 py-2.5 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s) => {
                      const isLeader = s.position === 1;
                      return (
                        <tr key={s.team_id} className={`border-t border-white/5 ${isLeader ? "bg-amber-500/10" : ""}`}>
                          <td className="px-3 py-2.5 font-bold text-slate-400">{s.position}</td>
                          <td className="px-3 py-2.5">
                            <span className={`flex items-center gap-1.5 ${isLeader ? "font-bold text-white" : "font-semibold text-slate-200"}`}>
                              {isLeader && <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                              {s.team_name}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{s.played}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{s.won}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{s.lost}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{s.drawn}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{s.points_for}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{s.points_against}</td>
                          <td className={`px-3 py-2.5 text-right font-heading text-base font-black tabular-nums ${isLeader ? "text-amber-400" : "text-white"}`}>{s.points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {rosterMatchId && <MatchRosterDialog matchId={rosterMatchId} onClose={() => setRosterMatchId(null)} />}
    </div>
  );
}
