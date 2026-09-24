import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Users,
  Flag,
  ImageIcon,
  Search,
  X,
  SlidersHorizontal,
  RotateCcw,
  MapPin,
  CheckCircle2,
  Trophy,
  ArrowUpDown,
  Hash,
  BedDouble,
} from "lucide-react";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { TeamAvatar } from "@/components/ui/team-badge";
import { cn } from "@/lib/utils";

interface Team {
  id: number;
  name: string;
  school?: string;
  school_code?: string;
  affiliation_number?: string | null;
  region?: string;
  country?: string;
  member_count?: number;
  active_participant_count?: number;
  photos: { thumbnail: string; view: string }[];
  cluster?: string | null;
  is_active?: boolean;
  has_arrived?: boolean;
  age_groups?: string[];
  age_group_counts?: Record<string, number>;
  gender?: string | null;
  genders?: string[];
  inactive_age_groups?: string[];
  is_accommodation_set?: boolean;
  accommodation_status?: string;
}

const ALL_CLUSTERS = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
];

const STANDARD_AGE_GROUPS = ["U-14", "U-17", "U-19"];

function romanToInt(roman: string): number {
  if (!roman) return 999;
  const clean = roman.toUpperCase().replace(/^CLUSTER\s*/i, "").trim();
  const num = parseInt(clean, 10);
  if (!isNaN(num) && num > 0) return num;

  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = values[clean[i]] ?? 0;
    const next = values[clean[i + 1]] ?? 0;
    total += next > v ? -v : v;
  }
  return total || 999;
}

function intToRoman(num: number): string {
  const map: [number, string][] = [
    [20, "XX"], [19, "XIX"], [18, "XVIII"], [17, "XVII"], [16, "XVI"],
    [15, "XV"], [14, "XIV"], [13, "XIII"], [12, "XII"], [11, "XI"],
    [10, "X"], [9, "IX"], [8, "VIII"], [7, "VII"], [6, "VI"],
    [5, "V"], [4, "IV"], [3, "III"], [2, "II"], [1, "I"],
  ];
  for (const [val, rom] of map) {
    if (num === val) return rom;
  }
  return String(num);
}

function normalizeCluster(val: string): string {
  if (!val || val === "all") return "all";
  const trimmed = val.trim();
  const parsedInt = parseInt(trimmed, 10);
  if (!isNaN(parsedInt) && parsedInt >= 1 && parsedInt <= 20) {
    return intToRoman(parsedInt);
  }
  return trimmed.replace(/^CLUSTER\s*/i, "").toUpperCase();
}

function normalizeAgeGroup(ag: string): string {
  if (!ag) return "";
  const s = ag.trim();
  const m = s.match(/under\s*(\d+)/i) || s.match(/u[-]?(\d+)/i);
  return m ? `U-${m[1]}` : s;
}

function getTeamAgeGroups(team: Team): string[] {
  const groups = new Set<string>();

  if (team.age_groups && Array.isArray(team.age_groups)) {
    team.age_groups.forEach((g) => {
      const norm = normalizeAgeGroup(g);
      if (norm) groups.add(norm);
    });
  }

  if (team.age_group_counts) {
    Object.keys(team.age_group_counts).forEach((g) => {
      const norm = normalizeAgeGroup(g);
      if (norm) groups.add(norm);
    });
  }

  if (team.inactive_age_groups && Array.isArray(team.inactive_age_groups)) {
    team.inactive_age_groups.forEach((g) => {
      const norm = normalizeAgeGroup(g);
      if (norm) groups.add(norm);
    });
  }

  if (groups.size === 0) {
    const raw = `${team.name} ${team.school || ""}`;
    const matches = raw.match(/\bU-?(14|17|19)\b/gi);
    if (matches) {
      matches.forEach((m) => groups.add(normalizeAgeGroup(m)));
    }
  }

  return Array.from(groups).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb;
  });
}

function getTeamGender(team: Team): string {
  if (team.gender) {
    const g = team.gender.toLowerCase();
    if (g.includes("girl") || g.includes("female")) return "Girls";
    if (g.includes("boy") || g.includes("male")) return "Boys";
    return team.gender;
  }
  if (team.genders && team.genders.length > 0) {
    const hasGirls = team.genders.some((g) => /girl|female/i.test(g));
    const hasBoys = team.genders.some((g) => /boy|male/i.test(g));
    if (hasGirls && hasBoys) return "Boys & Girls";
    if (hasGirls) return "Girls";
    return "Boys";
  }
  return "Boys";
}

function TeamCardPhoto({ team }: { team: Team }) {
  const [failed, setFailed] = useState(false);
  const photo = team.photos && team.photos[0];

  return (
    <div className="h-32 w-full shrink-0 overflow-hidden bg-obsidian-950 relative">
      {photo && !failed ? (
        <img
          src={photo.thumbnail}
          alt={team.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
          <ImageIcon className="h-7 w-7 text-slate-600/70" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-obsidian-900/90 via-transparent to-transparent pointer-events-none" />
    </div>
  );
}

function getTeamActiveParticipantsCount(t: Team): number {
  if (t.is_active === false) return 0;
  if (typeof t.active_participant_count === "number") {
    return t.active_participant_count;
  }
  const inactiveSet = new Set((t.inactive_age_groups ?? []).map(normalizeAgeGroup));
  if (t.age_group_counts && Object.keys(t.age_group_counts).length > 0) {
    let sum = 0;
    for (const [ag, count] of Object.entries(t.age_group_counts)) {
      if (!inactiveSet.has(normalizeAgeGroup(ag))) {
        sum += count;
      }
    }
    return sum;
  }
  if (inactiveSet.size === 0) {
    return t.member_count ?? 0;
  }
  return 0;
}

function TeamCard({ team: t }: { team: Team }) {
  const isIndia = (t.country || "").toLowerCase() === "india";
  const isTeamInactive = t.is_active === false;
  const ageGroups = useMemo(() => getTeamAgeGroups(t), [t]);
  const gender = useMemo(() => getTeamGender(t), [t]);
  const clusterDisplay = t.cluster ? t.cluster.replace(/^CLUSTER\s*/i, "").trim() : null;

  const inactiveGroupsSet = useMemo(
    () => new Set((t.inactive_age_groups ?? []).map(normalizeAgeGroup)),
    [t.inactive_age_groups],
  );

  const activeAgeGroups = useMemo(
    () => ageGroups.filter((ag) => !isTeamInactive && !inactiveGroupsSet.has(ag)),
    [ageGroups, isTeamInactive, inactiveGroupsSet],
  );

  const inactiveAgeGroups = useMemo(
    () => ageGroups.filter((ag) => isTeamInactive || inactiveGroupsSet.has(ag)),
    [ageGroups, isTeamInactive, inactiveGroupsSet],
  );

  const activeParticipantsCount = useMemo(() => getTeamActiveParticipantsCount(t), [t]);

  return (
    <Link
      to={`/teams/${t.id}`}
      data-testid={`team-card-${t.id}`}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-obsidian-900/95 transition-all duration-200 hover:-translate-y-1 hover:border-gold/50 hover:bg-obsidian-850 hover:shadow-lg hover:shadow-gold/5 focus:outline-none focus:ring-2 focus:ring-gold/50",
        isTeamInactive && "border-red-500/20 bg-obsidian-900/70 hover:border-red-500/40",
      )}
    >
      <TeamCardPhoto team={t} />

      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div>
          {/* HEADER: AVATAR, NAME & STATUS BADGES */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <TeamAvatar name={t.name} size="md" tone={isTeamInactive ? "neutral" : isIndia ? "gold" : "coral"} />
              <div className="min-w-0">
                <h3
                  className="font-heading text-base font-extrabold text-white group-hover:text-gold transition-colors leading-snug line-clamp-2"
                  title={t.name}
                >
                  {t.name}
                </h3>
                {t.school && t.school.toLowerCase() !== t.name.toLowerCase() && (
                  <p className="text-xs text-slate-400 font-body truncate mt-0.5" title={t.school}>
                    {t.school}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              {isTeamInactive ? (
                <span className="inline-flex items-center rounded border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-mono font-extrabold uppercase tracking-wide text-red-400">
                  INACTIVE
                </span>
              ) : (
                <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono font-extrabold uppercase tracking-wide text-emerald-400">
                  ACTIVE
                </span>
              )}

              {t.has_arrived && (
                <span
                  title="Delegation has physically arrived at the tournament venue"
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  ARRIVED
                </span>
              )}
            </div>
          </div>

          {/* KEY BADGES: ACTIVE & INACTIVE AGE GROUPS, CLUSTER, GENDER */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {/* Active Age Group(s) */}
            {activeAgeGroups.map((ag) => {
              const count = t.age_group_counts?.[ag] ?? t.age_group_counts?.[`Under ${ag.replace("U-", "")}`];
              return (
                <span
                  key={`active-${ag}`}
                  title={`${ag}: Active competing squad${count ? ` (${count} active players)` : ""}`}
                  className="inline-flex items-center gap-1 rounded border border-gold/45 bg-gold/15 px-2 py-0.5 text-[11px] font-heading font-black text-gold tracking-wide shadow-sm shadow-gold/5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {ag}
                  {count !== undefined && count > 0 && (
                    <span className="text-[10px] font-mono text-gold-300 ml-0.5 opacity-85">
                      ({count})
                    </span>
                  )}
                </span>
              );
            })}

            {/* Inactive Age Group(s) */}
            {inactiveAgeGroups.map((ag) => (
              <span
                key={`inactive-${ag}`}
                title={`${ag}: Inactive / Benched squad`}
                className="inline-flex items-center gap-1 rounded border border-red-500/35 bg-red-500/10 px-2 py-0.5 text-[11px] font-heading font-semibold text-red-300/90"
              >
                <span className="line-through text-slate-400">{ag}</span>
                <span className="text-[9px] font-mono uppercase font-bold text-red-400 bg-red-500/20 px-1 rounded">
                  Inactive
                </span>
              </span>
            ))}

            {activeAgeGroups.length === 0 && inactiveAgeGroups.length === 0 && (
              <span className="inline-flex items-center rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-heading font-semibold text-slate-400">
                Squad
              </span>
            )}

            {clusterDisplay && (
              <span className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-heading font-bold text-slate-200">
                <Flag className="h-3 w-3 text-gold" />
                Cluster {clusterDisplay}
              </span>
            )}

            {gender && (
              <span className="inline-flex items-center rounded border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[11px] font-heading font-semibold text-blue-300">
                {gender}
              </span>
            )}

            {!isIndia && t.country && (
              <span className="inline-flex items-center rounded border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[11px] font-heading font-semibold text-purple-300">
                {t.country}
              </span>
            )}

            {/* Accommodation status badge */}
            <span
              title={
                t.is_accommodation_set || t.accommodation_status === "Accomodation-Set"
                  ? "Accommodation has been set for this team"
                  : "Accommodation is not set"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-mono font-bold",
                t.is_accommodation_set || t.accommodation_status === "Accomodation-Set"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              )}
            >
              <BedDouble className={cn("h-3 w-3", t.is_accommodation_set || t.accommodation_status === "Accomodation-Set" ? "text-emerald-400" : "text-slate-500")} />
              {t.is_accommodation_set || t.accommodation_status === "Accomodation-Set" ? "Accomodation-Set" : "Not Set"}
            </span>
          </div>

          {/* SECONDARY INFO: STATE/REGION & SCHOOL CODE */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-slate-400 font-body">
            {t.region ? (
              <span className="flex items-center gap-1 text-slate-300 truncate font-medium">
                <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{t.region}</span>
              </span>
            ) : (
              <span className="text-slate-500 text-xs italic">National Qualified</span>
            )}

            {(t.school_code || t.affiliation_number) && (
              <span
                title={t.school_code ? `School Code: ${t.school_code}` : `Affiliation No: ${t.affiliation_number}`}
                className="font-mono text-[11px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 whitespace-nowrap"
              >
                Code:{" "}
                <span className="text-white font-semibold">
                  {t.school_code || t.affiliation_number}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* FOOTER: SQUAD HEADCOUNT (ACTIVE PARTICIPANTS IN ACTIVE AGE GROUPS) */}
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs">
          <span className="font-body text-slate-400 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-slate-500" /> Active Participants:
          </span>
          <span className="font-heading font-black text-white tabular-nums">
            {activeParticipantsCount}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function PublicTeams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Read initial state from URL query parameters (Active filter is ON by default)
  const qParam = searchParams.get("search") || searchParams.get("q") || "";
  const clusterParam = searchParams.get("cluster") || "all";
  const ageGroupParam = searchParams.get("age_group") || searchParams.get("age") || "all";
  const statusParam = searchParams.get("status") || "active";
  const genderParam = searchParams.get("gender") || "all";
  const sortParam = searchParams.get("sort") || "name_asc";

  const [q, setQ] = useState(qParam);
  const [clusterFilter, setClusterFilter] = useState<string>(clusterParam);
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>(ageGroupParam);
  const [statusFilter, setStatusFilter] = useState<string>(statusParam);
  const [genderFilter, setGenderFilter] = useState<string>(genderParam);
  const [sortBy, setSortBy] = useState<string>(sortParam);

  // Sync state if user navigates back/forward with browser history
  useEffect(() => {
    setQ(qParam);
    setClusterFilter(clusterParam);
    setAgeGroupFilter(ageGroupParam);
    setStatusFilter(statusParam);
    setGenderFilter(genderParam);
    setSortBy(sortParam);
  }, [qParam, clusterParam, ageGroupParam, statusParam, genderParam, sortParam]);

  // Update URL search parameters when filters change
  const updateUrlParams = useCallback(
    (updates: {
      search?: string;
      cluster?: string;
      age_group?: string;
      status?: string;
      gender?: string;
      sort?: string;
    }) => {
      const nextParams = new URLSearchParams(searchParams);

      const targetSearch = updates.search !== undefined ? updates.search : q;
      const targetCluster = updates.cluster !== undefined ? updates.cluster : clusterFilter;
      const targetAgeGroup = updates.age_group !== undefined ? updates.age_group : ageGroupFilter;
      const targetStatus = updates.status !== undefined ? updates.status : statusFilter;
      const targetGender = updates.gender !== undefined ? updates.gender : genderFilter;
      const targetSort = updates.sort !== undefined ? updates.sort : sortBy;

      if (targetSearch.trim()) {
        nextParams.set("search", targetSearch.trim());
      } else {
        nextParams.delete("search");
        nextParams.delete("q");
      }

      if (targetCluster && targetCluster !== "all") {
        nextParams.set("cluster", targetCluster);
      } else {
        nextParams.delete("cluster");
      }

      if (targetAgeGroup && targetAgeGroup !== "all") {
        nextParams.set("age_group", targetAgeGroup);
      } else {
        nextParams.delete("age_group");
        nextParams.delete("age");
      }

      if (targetStatus && targetStatus !== "active") {
        nextParams.set("status", targetStatus);
      } else {
        nextParams.delete("status");
      }

      if (targetGender && targetGender !== "all") {
        nextParams.set("gender", targetGender);
      } else {
        nextParams.delete("gender");
      }

      if (targetSort && targetSort !== "name_asc") {
        nextParams.set("sort", targetSort);
      } else {
        nextParams.delete("sort");
      }

      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams, q, clusterFilter, ageGroupFilter, statusFilter, genderFilter, sortBy],
  );

  const handleSearchChange = (val: string) => {
    setQ(val);
    updateUrlParams({ search: val });
  };

  const handleClusterChange = (val: string) => {
    setClusterFilter(val);
    updateUrlParams({ cluster: val });
  };

  const handleAgeGroupChange = (val: string) => {
    setAgeGroupFilter(val);
    updateUrlParams({ age_group: val });
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    updateUrlParams({ status: val });
  };

  const handleGenderChange = (val: string) => {
    setGenderFilter(val);
    updateUrlParams({ gender: val });
  };

  const handleSortChange = (val: string) => {
    setSortBy(val);
    updateUrlParams({ sort: val });
  };

  const clearAllFilters = () => {
    setQ("");
    setClusterFilter("all");
    setAgeGroupFilter("all");
    setStatusFilter("active");
    setGenderFilter("all");
    setSortBy("name_asc");
    setSearchParams({}, { replace: true });
  };

  // Fetch all public teams once
  useEffect(() => {
    api
      .get<Team[]>("/public/teams")
      .then((r) => setTeams(r.data))
      .finally(() => setLoading(false));
  }, []);

  // Compute available clusters from loaded data + standard roman list
  const clusterOptions = useMemo(() => {
    const fromData = new Set<string>();
    teams.forEach((t) => {
      if (t.cluster) {
        const norm = normalizeCluster(t.cluster);
        if (norm && norm !== "all") fromData.add(norm);
      }
    });

    const combined = Array.from(new Set([...ALL_CLUSTERS, ...fromData]));
    return combined.sort((a, b) => romanToInt(a) - romanToInt(b) || a.localeCompare(b));
  }, [teams]);

  // Compute available age groups from loaded data + standard U-14/17/19
  const ageGroupOptions = useMemo(() => {
    const fromData = new Set<string>();
    teams.forEach((t) => {
      const groups = getTeamAgeGroups(t);
      groups.forEach((g) => fromData.add(g));
    });

    const combined = Array.from(new Set([...STANDARD_AGE_GROUPS, ...fromData]));
    return combined.sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return na - nb;
    });
  }, [teams]);

  // Check if gender data is supported or if girls exist
  const hasGenderData = useMemo(() => {
    return teams.some(
      (t) =>
        t.gender ||
        (t.genders && t.genders.length > 0) ||
        /girl|female/i.test(`${t.name} ${t.school || ""}`),
    );
  }, [teams]);

  // Quick summary metrics calculated directly from teams
  // Quick summary metrics calculated directly from teams
  const stats = useMemo(() => {
    const total = teams.length;
    const active = teams.filter((t) => t.is_active !== false).length;

    const isGroupActive = (t: Team, group: string) => {
      if (t.is_active === false) return false;
      const groups = getTeamAgeGroups(t);
      if (!groups.includes(group)) return false;
      const inactive = new Set((t.inactive_age_groups ?? []).map(normalizeAgeGroup));
      return !inactive.has(group);
    };

    const u14 = teams.filter((t) => isGroupActive(t, "U-14")).length;
    const u17 = teams.filter((t) => isGroupActive(t, "U-17")).length;
    const u19 = teams.filter((t) => isGroupActive(t, "U-19")).length;

    return { total, active, u14, u17, u19 };
  }, [teams]);

  // Combined instant filtering logic: Categories are AND-ed together
  const filtered = useMemo(() => {
    let result = teams;

    // 1. Cluster Filter
    if (clusterFilter !== "all") {
      const targetClusterNorm = normalizeCluster(clusterFilter);
      result = result.filter((t) => {
        if (!t.cluster) return false;
        return normalizeCluster(t.cluster) === targetClusterNorm;
      });
    }

    // 2. Age Group Filter
    if (ageGroupFilter !== "all") {
      const targetAgeNorm = normalizeAgeGroup(ageGroupFilter);
      result = result.filter((t) => {
        const groups = getTeamAgeGroups(t);
        if (!groups.includes(targetAgeNorm)) return false;

        const inactiveSet = new Set((t.inactive_age_groups ?? []).map(normalizeAgeGroup));
        const isGroupInactive = t.is_active === false || inactiveSet.has(targetAgeNorm);

        if (statusFilter === "active" && isGroupInactive) return false;
        if (statusFilter === "inactive" && !isGroupInactive) return false;

        return true;
      });
    }

    // 3. Status Filter (active vs inactive)
    if (statusFilter === "active") {
      result = result.filter((t) => t.is_active !== false);
    } else if (statusFilter === "inactive") {
      result = result.filter((t) => t.is_active === false);
    }

    // 4. Gender Filter
    if (genderFilter !== "all") {
      const target = genderFilter.toLowerCase();
      result = result.filter((t) => {
        const g = getTeamGender(t).toLowerCase();
        if (target === "boys") return g.includes("boy") || g.includes("male");
        if (target === "girls") return g.includes("girl") || g.includes("female");
        return true;
      });
    }

    // 5. Search Query Filter (Search by team name, school, code, affiliation, city/state/region)
    const s = q.toLowerCase().trim();
    if (s) {
      result = result.filter((t) => {
        const searchableStrings = [
          t.name,
          t.school,
          t.school_code,
          t.affiliation_number,
          t.region,
          t.country,
          t.cluster ? `Cluster ${t.cluster}` : "",
          t.cluster,
        ]
          .filter(Boolean)
          .map((v) => v!.toLowerCase());

        return searchableStrings.some((val) => val.includes(s));
      });
    }

    // 6. Sorting
    const sorted = [...result];
    if (sortBy === "name_asc") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "name_desc") {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === "cluster") {
      sorted.sort(
        (a, b) =>
          romanToInt(a.cluster || "") - romanToInt(b.cluster || "") ||
          a.name.localeCompare(b.name),
      );
    } else if (sortBy === "age_group") {
      sorted.sort((a, b) => {
        const agA = getTeamAgeGroups(a)[0] || "";
        const agB = getTeamAgeGroups(b)[0] || "";
        const na = parseInt(agA.replace(/\D/g, ""), 10) || 999;
        const nb = parseInt(agB.replace(/\D/g, ""), 10) || 999;
        return na - nb || a.name.localeCompare(b.name);
      });
    }

    return sorted;
  }, [teams, q, clusterFilter, ageGroupFilter, statusFilter, genderFilter, sortBy]);

  // Count active filters (for badge on mobile toggle & chip bar)
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (clusterFilter !== "all") count++;
    if (ageGroupFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (genderFilter !== "all") count++;
    if (q.trim()) count++;
    return count;
  }, [clusterFilter, ageGroupFilter, statusFilter, genderFilter, q]);

  const hasActiveFilters = activeFiltersCount > 0;

  return (
    <div
      className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-10 md:py-14 text-slate-100 min-h-screen"
      data-testid="public-teams"
    >
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 border-b border-white/10 pb-6">
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
            State qualifying schools and international guest contingents competing in the CBSE
            National Kabaddi Championship.
          </p>
        </div>

        {/* SUMMARY STATS BAR */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Total Teams Pill */}
          <button
            type="button"
            onClick={() => handleStatusChange(statusFilter === "all" ? "active" : "all")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-heading transition-all cursor-pointer",
              statusFilter === "all"
                ? "border-gold/50 bg-gold/20 text-gold shadow-sm shadow-gold/10 font-bold"
                : "border-white/10 bg-obsidian-900 text-slate-300 hover:border-white/20",
            )}
            title={statusFilter === "all" ? "Currently showing all teams — click for active only" : "Show all teams (including inactive)"}
          >
            <Users className="h-3.5 w-3.5 text-gold" />
            <span>Total</span>
            <span className="font-black tabular-nums">{stats.total}</span>
          </button>

          {/* Active Teams Pill */}
          <button
            type="button"
            onClick={() => handleStatusChange(statusFilter === "active" ? "all" : "active")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-heading transition-all cursor-pointer",
              statusFilter === "active"
                ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 font-bold shadow-sm shadow-emerald-500/10"
                : "border-white/10 bg-obsidian-900 text-slate-300 hover:border-white/20",
            )}
            title={statusFilter === "active" ? "Currently showing active teams — click for all" : "Filter by active competing teams"}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
            <span>Active</span>
            <span className="font-black tabular-nums">{stats.active}</span>
          </button>

          {/* U-14 Pill */}
          <button
            type="button"
            onClick={() => handleAgeGroupChange(ageGroupFilter === "U-14" ? "all" : "U-14")}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-heading transition-all",
              ageGroupFilter === "U-14"
                ? "border-gold/50 bg-gold/20 text-gold font-bold"
                : "border-white/10 bg-obsidian-900 text-slate-300 hover:border-white/20",
            )}
            title="Filter by U-14 squads"
          >
            <span>U-14:</span>
            <span className="font-black tabular-nums">{stats.u14}</span>
          </button>

          {/* U-17 Pill */}
          <button
            type="button"
            onClick={() => handleAgeGroupChange(ageGroupFilter === "U-17" ? "all" : "U-17")}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-heading transition-all",
              ageGroupFilter === "U-17"
                ? "border-gold/50 bg-gold/20 text-gold font-bold"
                : "border-white/10 bg-obsidian-900 text-slate-300 hover:border-white/20",
            )}
            title="Filter by U-17 squads"
          >
            <span>U-17:</span>
            <span className="font-black tabular-nums">{stats.u17}</span>
          </button>

          {/* U-19 Pill */}
          <button
            type="button"
            onClick={() => handleAgeGroupChange(ageGroupFilter === "U-19" ? "all" : "U-19")}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-heading transition-all",
              ageGroupFilter === "U-19"
                ? "border-gold/50 bg-gold/20 text-gold font-bold"
                : "border-white/10 bg-obsidian-900 text-slate-300 hover:border-white/20",
            )}
            title="Filter by U-19 squads"
          >
            <span>U-19:</span>
            <span className="font-black tabular-nums">{stats.u19}</span>
          </button>
        </div>
      </div>

      {/* COMPACT RESPONSIVE FILTER TOOLBAR */}
      <div className="mt-6 space-y-3">
        {/* TOP ROW: SEARCH INPUT + MOBILE FILTER BUTTON + DESKTOP CONTROLS */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* SEARCH FIELD FIRST */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by school, school code, city, state, cluster…"
              data-testid="team-search-input"
              className="h-10 w-full rounded-lg border border-white/15 bg-obsidian-900/90 pl-10 pr-9 text-sm font-body text-white placeholder:text-slate-500 transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
            {q && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white transition-colors"
                aria-label="Clear search query"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* MOBILE FILTERS TOGGLE BUTTON */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border px-3 text-xs font-heading font-semibold transition-colors",
                mobileFiltersOpen || hasActiveFilters
                  ? "border-gold/40 bg-gold/15 text-gold"
                  : "border-white/15 bg-obsidian-900 text-slate-300",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-obsidian text-[10px] font-black tabular-nums">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-10 px-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-semibold flex items-center gap-1.5"
                title="Reset all filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>

          {/* DESKTOP FILTER BAR: CLUSTER, AGE GROUP, STATUS, GENDER, SORT, CLEAR */}
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            {/* Cluster dropdown */}
            <select
              value={clusterFilter}
              onChange={(e) => handleClusterChange(e.target.value)}
              data-testid="cluster-select"
              aria-label="Filter by Cluster"
              className={cn(
                "h-10 rounded-lg border bg-obsidian-900 px-3 py-1.5 text-xs font-heading font-semibold text-white transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer",
                clusterFilter !== "all"
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-white/15 text-slate-200",
              )}
            >
              <option value="all" className="bg-obsidian-900 text-slate-200">
                All Clusters
              </option>
              {clusterOptions.map((c) => (
                <option key={c} value={c} className="bg-obsidian-900 text-slate-200">
                  Cluster {c}
                </option>
              ))}
            </select>

            {/* Age Group dropdown */}
            <select
              value={ageGroupFilter}
              onChange={(e) => handleAgeGroupChange(e.target.value)}
              data-testid="age-group-select"
              aria-label="Filter by Age Group"
              className={cn(
                "h-10 rounded-lg border bg-obsidian-900 px-3 py-1.5 text-xs font-heading font-semibold text-white transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer",
                ageGroupFilter !== "all"
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-white/15 text-slate-200",
              )}
            >
              <option value="all" className="bg-obsidian-900 text-slate-200">
                All Age Groups
              </option>
              {ageGroupOptions.map((ag) => (
                <option key={ag} value={ag} className="bg-obsidian-900 text-slate-200">
                  {ag}
                </option>
              ))}
            </select>

            {/* Status dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              data-testid="status-select"
              aria-label="Filter by Team Status"
              className={cn(
                "h-10 rounded-lg border bg-obsidian-900 px-3 py-1.5 text-xs font-heading font-semibold text-white transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer",
                statusFilter === "active"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : statusFilter === "inactive"
                    ? "border-red-500/50 bg-red-500/10 text-red-300"
                    : "border-white/15 text-slate-200",
              )}
            >
              <option value="active" className="bg-obsidian-900 text-emerald-300 font-bold">
                Active Teams
              </option>
              <option value="all" className="bg-obsidian-900 text-slate-200">
                All Statuses
              </option>
              <option value="inactive" className="bg-obsidian-900 text-red-300">
                Inactive Teams
              </option>
            </select>

            {/* Gender dropdown (shown if data supports it) */}
            {hasGenderData && (
              <select
                value={genderFilter}
                onChange={(e) => handleGenderChange(e.target.value)}
                data-testid="gender-select"
                aria-label="Filter by Gender"
                className={cn(
                  "h-10 rounded-lg border bg-obsidian-900 px-3 py-1.5 text-xs font-heading font-semibold text-white transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer",
                  genderFilter !== "all"
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-white/15 text-slate-200",
                )}
              >
                <option value="all" className="bg-obsidian-900 text-slate-200">
                  All Genders
                </option>
                <option value="boys" className="bg-obsidian-900 text-slate-200">
                  Boys
                </option>
                <option value="girls" className="bg-obsidian-900 text-slate-200">
                  Girls
                </option>
              </select>
            )}

            {/* Sort control */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                data-testid="sort-select"
                aria-label="Sort Teams"
                className="h-10 rounded-lg border border-white/15 bg-obsidian-900 pl-3 pr-8 py-1.5 text-xs font-heading font-semibold text-slate-300 transition-colors focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold cursor-pointer"
              >
                <option value="name_asc" className="bg-obsidian-900 text-slate-200">
                  Name (A–Z)
                </option>
                <option value="name_desc" className="bg-obsidian-900 text-slate-200">
                  Name (Z–A)
                </option>
                <option value="cluster" className="bg-obsidian-900 text-slate-200">
                  Cluster (I–XX)
                </option>
                <option value="age_group" className="bg-obsidian-900 text-slate-200">
                  Age Group (U-14 → U-19)
                </option>
              </select>
              <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                data-testid="clear-filters-btn"
                className="inline-flex items-center gap-1.5 h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-heading font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                title="Reset all filters"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* MOBILE FILTERS COLLAPSIBLE PANEL */}
        {mobileFiltersOpen && (
          <div className="sm:hidden rounded-xl border border-white/10 bg-obsidian-900/95 p-4 space-y-3.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-heading font-bold uppercase tracking-wider text-gold">
                Filter Directory
              </span>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Cluster Dropdown */}
              <div>
                <label className="block text-[11px] font-heading font-medium text-slate-400 mb-1">
                  Cluster
                </label>
                <select
                  value={clusterFilter}
                  onChange={(e) => handleClusterChange(e.target.value)}
                  className="w-full h-9 rounded-md border border-white/15 bg-obsidian-950 px-2.5 text-xs text-white"
                >
                  <option value="all">All Clusters</option>
                  {clusterOptions.map((c) => (
                    <option key={c} value={c}>
                      Cluster {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Age Group Dropdown */}
              <div>
                <label className="block text-[11px] font-heading font-medium text-slate-400 mb-1">
                  Age Group
                </label>
                <select
                  value={ageGroupFilter}
                  onChange={(e) => handleAgeGroupChange(e.target.value)}
                  className="w-full h-9 rounded-md border border-white/15 bg-obsidian-950 px-2.5 text-xs text-white"
                >
                  <option value="all">All Age Groups</option>
                  {ageGroupOptions.map((ag) => (
                    <option key={ag} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Dropdown */}
              <div>
                <label className="block text-[11px] font-heading font-medium text-slate-400 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full h-9 rounded-md border border-white/15 bg-obsidian-950 px-2.5 text-xs text-white"
                >
                  <option value="active">Active Teams</option>
                  <option value="all">All Statuses</option>
                  <option value="inactive">Inactive Teams</option>
                </select>
              </div>

              {/* Gender Dropdown */}
              {hasGenderData && (
                <div>
                  <label className="block text-[11px] font-heading font-medium text-slate-400 mb-1">
                    Gender
                  </label>
                  <select
                    value={genderFilter}
                    onChange={(e) => handleGenderChange(e.target.value)}
                    className="w-full h-9 rounded-md border border-white/15 bg-obsidian-950 px-2.5 text-xs text-white"
                  >
                    <option value="all">All</option>
                    <option value="boys">Boys</option>
                    <option value="girls">Girls</option>
                  </select>
                </div>
              )}

              {/* Sort Dropdown */}
              <div className={hasGenderData ? "col-span-2" : ""}>
                <label className="block text-[11px] font-heading font-medium text-slate-400 mb-1">
                  Sort Order
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="w-full h-9 rounded-md border border-white/15 bg-obsidian-950 px-2.5 text-xs text-white"
                >
                  <option value="name_asc">Team Name (A–Z)</option>
                  <option value="name_desc">Team Name (Z–A)</option>
                  <option value="cluster">Cluster (I–XX)</option>
                  <option value="age_group">Age Group (U-14 → U-19)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-xs text-slate-400 font-body">
                {filtered.length} {filtered.length === 1 ? "team matches" : "teams match"}
              </span>
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-red-400 hover:text-red-300 font-semibold"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE FILTER CHIPS & RESULTS COUNT */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* RESULTS COUNT */}
          <div className="flex items-center gap-2">
            <span
              className="font-heading text-sm font-extrabold text-white"
              data-testid="teams-count"
            >
              {filtered.length} {filtered.length === 1 ? "Team Found" : "Teams Found"}
            </span>
            {hasActiveFilters && (
              <span className="text-xs text-slate-400 font-body">
                (filtered from {teams.length})
              </span>
            )}
          </div>

          {/* ACTIVE FILTER CHIPS */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="filter-chips">
              {q.trim() && (
                <span className="inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-xs font-body text-gold">
                  <span>Search: &ldquo;{q.trim()}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => handleSearchChange("")}
                    className="hover:text-white ml-0.5"
                    aria-label="Remove search filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {clusterFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-body text-slate-200">
                  <Flag className="h-3 w-3 text-gold" />
                  <span>Cluster {clusterFilter}</span>
                  <button
                    type="button"
                    onClick={() => handleClusterChange("all")}
                    className="text-slate-400 hover:text-white ml-0.5"
                    aria-label="Remove cluster filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {ageGroupFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-xs font-heading font-bold text-gold">
                  <span>{ageGroupFilter}</span>
                  <button
                    type="button"
                    onClick={() => handleAgeGroupChange("all")}
                    className="hover:text-white ml-0.5"
                    aria-label="Remove age group filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {statusFilter === "active" ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-xs font-mono font-bold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>Status: Active</span>
                  <button
                    type="button"
                    onClick={() => handleStatusChange("all")}
                    className="text-emerald-400 hover:text-white ml-0.5"
                    aria-label="Show all teams including inactive"
                    title="Show all teams"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : statusFilter === "inactive" ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-xs font-mono font-bold text-red-400">
                  <span>Status: Inactive Only</span>
                  <button
                    type="button"
                    onClick={() => handleStatusChange("active")}
                    className="text-red-400 hover:text-white ml-0.5"
                    aria-label="Reset to active teams"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : null}

              {genderFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-body text-blue-300">
                  <span>{genderFilter === "boys" ? "Boys" : "Girls"}</span>
                  <button
                    type="button"
                    onClick={() => handleGenderChange("all")}
                    className="text-blue-400 hover:text-white ml-0.5"
                    aria-label="Remove gender filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-gold hover:text-gold-300 font-semibold underline underline-offset-2 ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TEAMS DIRECTORY GRID OR EMPTY STATE */}
      {loading ? (
        <div className="py-24 text-center">
          <Spinner label="Loading participating squads…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-obsidian-900/60 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-slate-400 mb-4">
            <Search className="h-6 w-6" />
          </div>
          <h2 className="font-heading text-lg sm:text-xl font-bold text-white">
            No teams match these filters
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-slate-400 font-body">
            No participating delegation satisfies your current combination of cluster, age group, status, or search query.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={clearAllFilters}
              data-testid="empty-clear-filters-btn"
              className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-xs font-heading font-extrabold text-obsidian shadow-sm hover:bg-gold-400 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear Filters
            </button>
            {q && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-heading font-semibold text-slate-200 hover:bg-white/10 transition-colors"
              >
                Clear Search Only
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="team-grid"
          >
            {filtered.map((t) => (
              <TeamCard key={t.id} team={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
