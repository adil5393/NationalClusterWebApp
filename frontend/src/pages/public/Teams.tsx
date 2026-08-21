import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Team {
  id: number;
  name: string;
  school?: string;
  region?: string;
  country?: string;
  member_count?: number;
}

export default function PublicTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get<Team[]>("/public/teams").then((r) => setTeams(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return teams;
    return teams.filter((t) =>
      [t.name, t.school, t.region, t.country].filter(Boolean).some((v) => v!.toLowerCase().includes(s)),
    );
  }, [teams, q]);

  return (
    <div className="mx-auto max-w-7xl px-5 md:px-8 py-16 md:py-20" data-testid="public-teams">
      <span className="text-xs font-bold uppercase tracking-widest text-coral-600">Participants</span>
      <h1 className="mt-3 font-heading text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Participating Teams</h1>
      <p className="mt-3 max-w-2xl text-base text-slate-600">
        Teams travelling from across India and international teams from Saudi Arabia.
      </p>

      <div className="mt-8 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by team, school or region…"
          className="pl-9"
          data-testid="team-search-input"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No teams found" hint="Try a different search, or check back later." />
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="team-grid">
          {filtered.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-5 transition-transform hover:-translate-y-1">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading text-lg font-bold leading-snug text-slate-950">{t.name}</h3>
                <Badge tone={t.country === "India" ? "coral" : "blue"}>{t.country}</Badge>
              </div>
              {t.region && <p className="mt-1 text-sm text-slate-500">{t.region}</p>}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Members</span>
                <span className="font-bold text-slate-900">{t.member_count ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
