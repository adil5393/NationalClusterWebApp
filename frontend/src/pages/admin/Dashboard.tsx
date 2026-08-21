import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, UserSquare2, BedDouble, Bus, ShoppingCart, CheckSquare, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { StatCard } from "@/components/admin/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/feedback";
import { knowledgeStatusTone, priorityTone, formatDate } from "@/lib/meta";

interface Stats {
  participants: { total: number; expected: number; member_sum: number };
  teams: { total: number };
  rooms: { total: number; occupied: number; available: number; capacity: number };
  transport: { vehicles: number; assignments: number };
  procurement: { open: number };
  tasks: { pending: number; completed: number };
  decisions: { id: number; title: string; category: string; status: string; updated_at?: string }[];
  announcements: { id: number; title: string; priority: string; published_at?: string }[];
}

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>("/dashboard/stats").then((r) => setS(r.data));
  }, []);

  if (!s) return <Spinner label="Loading dashboard…" />;

  return (
    <div data-testid="admin-dashboard">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Cluster Nationals 2026–27 · single source of truth</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Teams" value={s.teams.total} sub="Registered" testId="stat-teams" />
        <StatCard
          icon={UserSquare2}
          label="Participants"
          value={s.participants.member_sum || s.participants.total}
          sub={`Target ~${s.participants.expected}`}
          accent
          testId="stat-participants"
        />
        <StatCard icon={BedDouble} label="Rooms" value={`${s.rooms.occupied}/${s.rooms.total}`} sub="Occupied / Total" testId="stat-rooms" />
        <StatCard icon={Bus} label="Transport" value={s.transport.vehicles} sub={`${s.transport.assignments} assignments`} testId="stat-transport" />
        <StatCard icon={ShoppingCart} label="Procurement" value={s.procurement.open} sub="Open items" testId="stat-procurement" />
        <StatCard icon={CheckSquare} label="Tasks" value={`${s.tasks.pending}`} sub={`${s.tasks.completed} completed`} testId="stat-tasks" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent Decisions</CardTitle>
            <Link to="/admin/knowledge" className="inline-flex items-center gap-1 text-sm font-bold text-coral-600">
              Knowledge Base <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.decisions.length === 0 && <p className="text-sm text-slate-500">No decisions yet.</p>}
            {s.decisions.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{d.title}</p>
                  <p className="text-xs text-slate-500">{d.category} · {formatDate(d.updated_at)}</p>
                </div>
                <Badge tone={knowledgeStatusTone(d.status)}>{d.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent Announcements</CardTitle>
            <Link to="/admin/announcements" className="inline-flex items-center gap-1 text-sm font-bold text-coral-600">
              All <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.announcements.length === 0 && <p className="text-sm text-slate-500">No announcements yet.</p>}
            {s.announcements.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(a.published_at)}</p>
                </div>
                <Badge tone={priorityTone(a.priority)}>{a.priority.toUpperCase()}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Figures are computed live from the database. Current records are clearly-labelled DEVELOPMENT data.
      </p>
    </div>
  );
}
