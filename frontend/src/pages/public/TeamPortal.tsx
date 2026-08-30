import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Share2,
  BedDouble,
  Bus,
  CalendarDays,
  UserCog,
  Users,
  QrCode,
  MapPin,
  Clock,
  Phone,
  Shield,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { QRDialog } from "@/components/admin/QRDialog";
import { formatDate } from "@/lib/meta";
import { TeamAvatar } from "@/components/ui/team-badge";

interface TeamDetail {
  id: number;
  name: string;
  school?: string;
  region?: string;
  country?: string;
  member_count?: number;
  coaches: { full_name: string; email?: string; phone?: string }[];
  participants: { full_name: string; role?: string; age_group?: string }[];
  accommodation: { room?: string; floor?: string; building?: string; notes?: string }[];
  transport: {
    vehicle?: string;
    pickup_location?: string;
    drop_location?: string;
    pickup_time?: string;
    route?: string;
  }[];
  schedule: { title: string; venue?: string; start_time?: string; end_time?: string }[];
}

function ageGroupRank(g: string) {
  const m = g.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function groupByAge(participants: TeamDetail["participants"]) {
  const groups = new Map<string, TeamDetail["participants"]>();
  for (const p of participants) {
    const key = p.age_group || "General Roster";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return Array.from(groups.entries()).sort(
    ([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b),
  );
}

function SectionCard({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: React.ElementType;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-obsidian-900/90 p-5 sm:p-6 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base font-bold text-white tracking-tight">{title}</h2>
        </div>
        {badge && (
          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-300">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function TeamPortal() {
  const { id } = useParams();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<TeamDetail>(`/public/teams/${id}`)
      .then((r) => setTeam(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Team portal link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 md:px-8 py-20 bg-kabaddi-court min-h-screen">
        <Spinner label="Loading team portal & schedule…" />
      </div>
    );
  }

  if (notFound || !team) {
    return (
      <div
        className="mx-auto max-w-5xl px-4 sm:px-6 md:px-8 py-20 bg-kabaddi-court min-h-screen text-slate-100"
        data-testid="team-portal-notfound"
      >
        <EmptyState title="Team not found" hint="This team portal does not exist in the tournament records." />
        <div className="mt-6 text-center">
          <Link
            to="/teams"
            className="inline-flex items-center gap-2 text-sm font-bold text-gold hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to all participating teams
          </Link>
        </div>
      </div>
    );
  }

  const isIndia = (team.country || "").toLowerCase() === "india";

  return (
    <div
      className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8 py-10 md:py-14 text-slate-100 bg-kabaddi-court min-h-screen"
      data-testid="team-portal"
    >
      {/* BACK LINK */}
      <Link
        to="/teams"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-heading font-bold text-slate-400 hover:text-gold transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All Participating Teams
      </Link>

      {/* TEAM PROFILE HERO BANNER */}
      <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-obsidian-900 via-obsidian-900 to-obsidian-950 p-6 sm:p-8 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <TeamAvatar
              name={team.name}
              size="lg"
              tone={isIndia ? "gold" : "coral"}
              className="h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-heading text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white">
                  {team.name}
                </h1>
                <Badge tone={isIndia ? "gold" : "coral"}>
                  {team.country || "General"}
                </Badge>
              </div>
              <p className="text-sm sm:text-base text-slate-300 font-body">
                {team.school || "School Delegation"}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400 font-body">
                {team.region && (
                  <span className="flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-gold" /> {team.region}
                  </span>
                )}
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <strong className="text-white font-bold">{team.member_count ?? 0}</strong> Registered Members
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQrOpen(true)}
              data-testid="team-qr-btn"
              className="text-xs"
            >
              <QrCode className="h-4 w-4 text-gold" /> Team QR
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={share}
              data-testid="share-team-btn"
              className="text-xs"
            >
              <Share2 className="h-4 w-4 text-slate-300" /> Share
            </Button>
          </div>
        </div>
      </div>

      <QRDialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        url={typeof window !== "undefined" ? window.location.href : ""}
        title={`${team.name} - Official QR`}
      />

      {/* 4 OPERATIONAL CARDS */}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {/* COACHES */}
        <SectionCard icon={UserCog} title="Coaching & Delegation Staff" badge={`${team.coaches.length} Staff`}>
          {team.coaches.length === 0 ? (
            <p className="text-xs text-slate-400">No coach assigned in records yet.</p>
          ) : (
            <ul className="space-y-3">
              {team.coaches.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
                  <div>
                    <p className="font-heading font-bold text-white text-sm">{c.full_name}</p>
                    {c.email && <p className="text-slate-400 font-body mt-0.5">{c.email}</p>}
                  </div>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1 rounded bg-gold/15 px-2.5 py-1 font-mono text-xs font-bold text-gold hover:bg-gold/25"
                    >
                      <Phone className="h-3 w-3" /> {c.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* ACCOMMODATION */}
        <SectionCard icon={BedDouble} title="Hostel & Room Allocation" badge={`${team.accommodation.length} Rooms`}>
          {team.accommodation.length === 0 ? (
            <p className="text-xs text-slate-400">Room assignments are currently being processed by organizing committee.</p>
          ) : (
            <ul className="space-y-2.5">
              {team.accommodation.map((a, i) => (
                <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-black text-sm text-gold">
                      Room {a.room}
                    </span>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300 font-mono">
                      {a.building || "Hostel Block"}
                    </span>
                  </div>
                  {a.floor && <p className="text-slate-400 mt-1 font-body">Floor: {a.floor}</p>}
                  {a.notes && <p className="text-slate-400 mt-1 font-body italic">{a.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* TRANSPORT */}
        <SectionCard icon={Bus} title="Transit & Vehicle Assignments" badge={`${team.transport.length} Routes`}>
          {team.transport.length === 0 ? (
            <p className="text-xs text-slate-400">No transit vehicle assigned yet. Check transport desk at reception.</p>
          ) : (
            <ul className="space-y-3">
              {team.transport.map((t, i) => (
                <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs space-y-1">
                  <p className="font-heading font-bold text-white text-sm">{t.vehicle}</p>
                  {t.pickup_location && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <MapPin className="h-3 w-3 text-gold shrink-0" />
                      <span>Pickup: <strong className="text-slate-200">{t.pickup_location}</strong></span>
                      {t.pickup_time && <span>· {formatDate(t.pickup_time)}</span>}
                    </div>
                  )}
                  {t.route && (
                    <div className="text-slate-400 text-[11px]">
                      Route: <span className="text-slate-300">{t.route}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* SCHEDULE */}
        <SectionCard icon={CalendarDays} title="Scheduled Match Fixtures & Ceremonies" badge={`${team.schedule.length} Events`}>
          {team.schedule.length === 0 ? (
            <p className="text-xs text-slate-400">Official match schedule will populate as fixture draws are finalized.</p>
          ) : (
            <ul className="space-y-2.5">
              {team.schedule.map((s, i) => (
                <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs space-y-1">
                  <p className="font-heading font-bold text-white text-sm">{s.title}</p>
                  <div className="flex flex-wrap items-center gap-2 text-slate-400 text-[11px]">
                    {s.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-gold" /> {s.venue}
                      </span>
                    )}
                    {s.start_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" /> {formatDate(s.start_time)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* REGISTERED SQUAD ROSTER */}
      <div className="mt-8">
        <SectionCard icon={Users} title="Official Squad Roster" badge={`${team.participants.length} Athletes`}>
          {team.participants.length === 0 ? (
            <p className="text-xs text-slate-400">Athlete roster verification in progress.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupByAge(team.participants).map(([group, members]) => (
                <div key={group} className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3">
                    <h3 className="font-heading text-xs font-bold text-gold uppercase tracking-wider">
                      {group}
                    </h3>
                    <Badge tone="neutral" size="sm">
                      {members.length}
                    </Badge>
                  </div>
                  <ol className="divide-y divide-white/5">
                    {[...members]
                      .sort((a, b) => a.full_name.localeCompare(b.full_name))
                      .map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                          <span className="font-body text-slate-200">
                            <span className="font-mono text-slate-500 mr-1.5">{i + 1}.</span>{" "}
                            <span className="font-semibold text-white">{p.full_name}</span>
                          </span>
                          {p.role && (
                            <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-400">
                              {p.role}
                            </span>
                          )}
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
