import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Shield, ArrowRight, Flag, ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/input";
import { TeamAvatar } from "@/components/ui/team-badge";
import { Tabs } from "@/components/ui/tabs";

interface Team {
  id: number;
  name: string;
  school?: string;
  school_code?: string;
  affiliation_number?: string | null;
  region?: string;
  country?: string;
  member_count?: number;
  photos: { thumbnail: string; view: string }[];
}

function TeamCardPhoto({ team }: { team: Team }) {
  const [failed, setFailed] = useState(false);
  const photo = team.photos[0];

  // Fixed height regardless of whether there's a real photo, so the grid
  // stays uniform — a card never grows/shrinks depending on photo presence.
  return (
    <div className="h-32 w-full shrink-0 overflow-hidden bg-obsidian-950">
      {photo && !failed ? (
        <img
          src={photo.thumbnail}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
          <ImageIcon className="h-6 w-6 text-slate-600" />
        </div>
      )}
    </div>
  );
}

export default function PublicTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  useEffect(() => {
    api
      .get<Team[]>("/public/teams")
      .then((r) => setTeams(r.data))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const total = teams.length;
    const india = teams.filter((t) => (t.country || "").toLowerCase() === "india").length;
    const intl = teams.filter((t) => (t.country || "").toLowerCase() !== "india" && t.country).length;
    return { total, india, intl };
  }, [teams]);

  const filterTabs = [
    { id: "all", label: "All Teams", count: counts.total },
    { id: "india", label: "India", count: counts.india },
    { id: "intl", label: "International (KSA)", count: counts.intl },
  ];

  const filtered = useMemo(() => {
    let result = teams;

    // Filter by country tab
    if (countryFilter === "india") {
      result = result.filter((t) => (t.country || "").toLowerCase() === "india");
    } else if (countryFilter === "intl") {
      result = result.filter((t) => (t.country || "").toLowerCase() !== "india" && t.country);
    }

    // Filter by search query
    const s = q.toLowerCase().trim();
    if (!s) return result;

    return result.filter((t) =>
      [t.name, t.school, t.school_code, t.affiliation_number, t.region, t.country]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(s)),
    );
  }, [teams, q, countryFilter]);

  return (
    <div
      className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-12 md:py-16 text-slate-100 min-h-screen"
      data-testid="public-teams"
    >
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-8">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              OFFICIAL SQUADS & DELEGATIONS
            </span>
            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-400">
              NATIONALS 2026–27
            </span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            Participating Teams
          </h1>
          <p className="max-w-2xl text-sm sm:text-base text-slate-400 font-body leading-relaxed">
            State qualifying schools and international guest contingents competing in the CBSE National Kabaddi Championship.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-obsidian-900 px-3.5 py-2">
            <Users className="h-4 w-4 text-gold" />
            <span className="text-xs font-bold text-white font-heading">
              {teams.length} Registered Teams
            </span>
          </div>
        </div>
      </div>

      {/* CONTROLS: SEARCH & TABS */}
      <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="w-full max-w-md">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ("")}
            placeholder="Search by team, school, school code or region…"
            data-testid="team-search-input"
          />
        </div>

        <Tabs
          items={filterTabs}
          activeTab={countryFilter}
          onChange={(tabId) => setCountryFilter(tabId)}
          variant="boxed"
        />
      </div>

      {/* TEAM GRID */}
      {loading ? (
        <div className="py-20">
          <Spinner label="Loading participating squads…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No teams found"
            hint="Try a different search term or change the country filter tab."
          />
        </div>
      ) : (
        <div
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="team-grid"
        >
          {filtered.map((t) => {
            const isIndia = (t.country || "").toLowerCase() === "india";
            return (
              <Link
                key={t.id}
                to={`/teams/${t.id}`}
                data-testid={`team-card-${t.id}`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-obsidian-900/90 transition-all duration-200 hover:-translate-y-1 hover:border-gold/50 hover:bg-obsidian-800 shadow-sm"
              >
                <TeamCardPhoto team={t} />

                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <TeamAvatar
                          name={t.name}
                          size="md"
                          tone={isIndia ? "gold" : "coral"}
                        />
                        <div className="min-w-0">
                          <h3 className="font-heading text-base font-bold text-white group-hover:text-gold transition-colors truncate">
                            {t.name}
                          </h3>
                          {t.school && (
                            <p className="text-xs text-slate-400 font-body truncate">
                              {t.school}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge tone={isIndia ? "gold" : "coral"}>
                        {t.country || "General"}
                      </Badge>
                    </div>

                    {(t.region || t.school_code) && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-body">
                        {t.region && (
                          <span className="flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-slate-500" /> {t.region}
                          </span>
                        )}
                        {t.school_code && (
                          <span className="font-mono text-[11px] text-slate-500">#{t.school_code}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                    <span className="font-body text-slate-400 flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-slate-500" /> Squad Members:
                    </span>
                    <span className="font-heading font-black text-white tabular-nums">
                      {t.member_count ?? "—"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
