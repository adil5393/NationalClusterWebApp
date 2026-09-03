import { useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { useModuleAccess } from "@/lib/permissions";

interface MatT {
  id: number;
  name: string;
}

interface MatchT {
  id: number;
  tournament_name?: string | null;
  round_name?: string | null;
  pool_name?: string | null;
  team_a_id?: number | null;
  team_a_name?: string | null;
  team_b_id?: number | null;
  team_b_name?: string | null;
  status: string;
  mat_id?: number | null;
  mat_name?: string | null;
  venue_name?: string | null;
}

const STATUS_TONE: Record<string, "green" | "amber" | "blue"> = {
  ONGOING: "green",
  PAUSED: "amber",
  SCHEDULED: "blue",
};

export default function MatGroundAssignment() {
  const { canEdit } = useModuleAccess("matches");
  const [mats, setMats] = useState<MatT[]>([]);
  const [matches, setMatches] = useState<MatchT[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMatName, setNewMatName] = useState("");
  const [creatingMat, setCreatingMat] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<MatT[]>("/mats"),
      api.get<MatchT[]>("/matches", { params: { status: "SCHEDULED,ONGOING,PAUSED" } }),
    ])
      .then(([matsRes, matchesRes]) => {
        setMats(matsRes.data);
        setMatches(matchesRes.data.filter((m) => m.status !== "SCHEDULED" || (m.team_a_id && m.team_b_id)));
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
      const r = await api.put<MatchT>(`/matches/${matchId}/mat`, { mat_id: matId ? Number(matId) : null });
      setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, mat_id: r.data.mat_id, mat_name: r.data.mat_name } : m)));
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update mat/ground");
    } finally {
      setAssigningId(null);
    }
  };

  // tournament_name -> round_name (+ pool_name inline) -> matches[]
  const grouped = new Map<string, Map<string, MatchT[]>>();
  for (const m of matches) {
    const tKey = m.tournament_name ?? "Unassigned Tournament";
    const rKey = m.pool_name ? `${m.round_name ?? "Round"} · ${m.pool_name}` : m.round_name ?? "Round";
    if (!grouped.has(tKey)) grouped.set(tKey, new Map());
    const roundMap = grouped.get(tKey)!;
    if (!roundMap.has(rKey)) roundMap.set(rKey, []);
    roundMap.get(rKey)!.push(m);
  }

  return (
    <div data-testid="admin-mat-ground" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            COURT LOGISTICS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Mat / Ground Assignment
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Register every mat/ground once, then assign it to any scheduled, ongoing, or paused match across every
            tournament.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="text-xs font-bold">
          <RefreshCw className="h-3.5 w-3.5 text-gold" /> Refresh
        </Button>
      </div>

      {/* MAT / GROUND REGISTRY */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 shadow-sm p-4 space-y-3" data-testid="mat-registry">
        <h2 className="font-heading text-sm font-black uppercase tracking-wider text-white">Mats & Grounds</h2>
        {canEdit && (
          <div className="flex gap-2 max-w-sm">
            <Input
              value={newMatName}
              onChange={(e) => setNewMatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createMat()}
              placeholder="e.g. Mat 1, Ground A"
              className="h-9 text-sm"
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
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}
        {mats.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No mats/grounds registered yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mats.map((mat) => (
              <span
                key={mat.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-obsidian-950 px-2.5 py-1 text-xs font-semibold text-white"
              >
                {mat.name}
                {canEdit && (
                  <button
                    onClick={() => deleteMat(mat)}
                    className="text-slate-400 hover:text-red-400"
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

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
          <Spinner label="Loading live match schedule…" />
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState
            title="No scheduled, ongoing, or paused matches right now"
            hint="Once fixtures are ready to play, they'll show up here for mat/ground assignment."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([tournamentName, rounds]) => (
            <div
              key={tournamentName}
              className="rounded-xl border border-white/10 bg-obsidian-900 shadow-sm overflow-hidden"
            >
              <div className="border-b border-white/10 bg-obsidian-950 px-4 py-2.5">
                <h2 className="font-heading text-sm font-black uppercase tracking-wider text-white">
                  {tournamentName}
                </h2>
              </div>
              <div className="p-4 space-y-4">
                {Array.from(rounds.entries()).map(([roundName, roundMatches]) => (
                  <div key={roundName} className="space-y-2">
                    <h3 className="text-xs font-heading font-bold uppercase tracking-wider text-gold">
                      {roundName}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {roundMatches.map((m) => (
                        <div
                          key={m.id}
                          data-testid={`mat-ground-match-${m.id}`}
                          className="rounded-lg border border-white/10 bg-obsidian-950 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge tone={STATUS_TONE[m.status] ?? "blue"} size="sm">
                              {m.status}
                            </Badge>
                            {m.venue_name && (
                              <span className="truncate text-[11px] text-slate-500 font-mono" title={m.venue_name}>
                                {m.venue_name}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-heading font-bold text-white truncate">
                            {m.team_a_name ?? "TBD"} <span className="text-slate-500">vs</span>{" "}
                            {m.team_b_name ?? "TBD"}
                          </p>
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
                            <p className="text-xs text-slate-300 font-mono">{m.mat_name || "Not yet assigned"}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
