import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Share2, BedDouble, Bus, CalendarDays, UserCog, Users, QrCode } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { QRDialog } from "@/components/admin/QRDialog";
import { formatDate } from "@/lib/meta";

interface TeamDetail {
  id: number; name: string; school?: string; region?: string; country?: string; member_count?: number;
  coaches: { full_name: string; email?: string; phone?: string }[];
  participants: { full_name: string; role?: string; age_group?: string }[];
  accommodation: { room?: string; floor?: string; building?: string; notes?: string }[];
  transport: { vehicle?: string; pickup_location?: string; drop_location?: string; pickup_time?: string; route?: string }[];
  schedule: { title: string; venue?: string; start_time?: string; end_time?: string }[];
}

function ageGroupRank(g: string) {
  const m = g.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function groupByAge(participants: TeamDetail["participants"]) {
  const groups = new Map<string, TeamDetail["participants"]>();
  for (const p of participants) {
    const key = p.age_group || "Age group not specified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => ageGroupRank(a) - ageGroupRank(b) || a.localeCompare(b));
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-900 text-white"><Icon className="h-4 w-4" /></span>
        <h2 className="font-heading text-lg font-bold text-slate-950">{title}</h2>
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
    api.get<TeamDetail>(`/public/teams/${id}`)
      .then((r) => setTeam(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Team page link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (loading) return <div className="mx-auto max-w-5xl px-5 md:px-8 py-20"><Spinner /></div>;
  if (notFound || !team)
    return (
      <div className="mx-auto max-w-5xl px-5 md:px-8 py-20" data-testid="team-portal-notfound">
        <EmptyState title="Team not found" hint="This team page does not exist." />
        <Link to="/teams" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-coral-600"><ArrowLeft className="h-4 w-4" /> Back to teams</Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl px-5 md:px-8 py-14 md:py-16" data-testid="team-portal">
      <Link to="/teams" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-coral-600">
        <ArrowLeft className="h-4 w-4" /> All Teams
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{team.name}</h1>
            <Badge tone={team.country === "India" ? "coral" : "blue"}>{team.country}</Badge>
          </div>
          <p className="mt-2 text-base text-slate-600">{[team.school, team.region].filter(Boolean).join(" · ") || "—"} · {team.member_count ?? 0} members</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setQrOpen(true)} data-testid="team-qr-btn"><QrCode className="h-4 w-4" /> QR</Button>
          <Button variant="outline" onClick={share} data-testid="share-team-btn"><Share2 className="h-4 w-4" /> Share</Button>
        </div>
      </div>

      <QRDialog open={qrOpen} onClose={() => setQrOpen(false)} url={typeof window !== "undefined" ? window.location.href : ""} title={team.name} />

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Section icon={UserCog} title="Coach">
          {team.coaches.length === 0 ? <p className="text-sm text-slate-500">No coach assigned yet.</p> : (
            <ul className="space-y-2">
              {team.coaches.map((c, i) => (
                <li key={i} className="text-sm"><span className="font-bold text-slate-900">{c.full_name}</span>{c.phone && <span className="text-slate-500"> · {c.phone}</span>}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={BedDouble} title="Accommodation">
          {team.accommodation.length === 0 ? <p className="text-sm text-slate-500">Not assigned yet.</p> : (
            <ul className="space-y-2">
              {team.accommodation.map((a, i) => (
                <li key={i} className="text-sm text-slate-800">
                  <span className="font-bold">Room {a.room}</span> · {a.building} · {a.floor}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={Bus} title="Transport">
          {team.transport.length === 0 ? <p className="text-sm text-slate-500">No transport assigned yet.</p> : (
            <ul className="space-y-3">
              {team.transport.map((t, i) => (
                <li key={i} className="text-sm text-slate-800">
                  <span className="font-bold">{t.vehicle}</span>
                  {t.pickup_location && <div className="text-slate-500">Pickup: {t.pickup_location}{t.pickup_time ? ` · ${formatDate(t.pickup_time)}` : ""}</div>}
                  {t.route && <div className="text-slate-500">Route: {t.route}</div>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={CalendarDays} title="Schedule">
          {team.schedule.length === 0 ? <p className="text-sm text-slate-500">No scheduled events yet.</p> : (
            <ul className="space-y-3">
              {team.schedule.map((s, i) => (
                <li key={i} className="text-sm text-slate-800">
                  <span className="font-bold">{s.title}</span>
                  <div className="text-slate-500">{[s.venue, s.start_time ? formatDate(s.start_time) : null].filter(Boolean).join(" · ")}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-5">
        <Section icon={Users} title="Team Members">
          {team.participants.length === 0 ? <p className="text-sm text-slate-500">Roster not published yet.</p> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupByAge(team.participants).map(([group, members]) => (
                <div key={group} className="rounded-md border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                    <h3 className="text-sm font-bold text-slate-900">{group}</h3>
                    <Badge tone="neutral">{members.length}</Badge>
                  </div>
                  <ol className="divide-y divide-slate-200/70">
                    {[...members].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="text-slate-800"><span className="text-slate-400">{i + 1}.</span> {p.full_name}</span>
                        {p.role && <span className="shrink-0 text-xs font-semibold text-slate-500">{p.role}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
