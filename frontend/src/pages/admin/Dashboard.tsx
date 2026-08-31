import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  UserSquare2,
  BedDouble,
  Bus,
  ShoppingCart,
  CheckSquare,
  ArrowRight,
  AlertTriangle,
  Radio,
  Trophy,
  Calendar,
  Shield,
  Activity,
  FileSpreadsheet,
} from "lucide-react";
import { api } from "@/lib/api";
import { StatCard } from "@/components/admin/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/feedback";
import { knowledgeStatusTone, priorityTone, formatDate } from "@/lib/meta";
import { useMe } from "@/lib/permissions";
import { ClipboardList } from "lucide-react";

interface MyDuty {
  id: number;
  room_name?: string;
  building_name?: string;
  floor_name?: string;
  duty_type: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
}

function MyDutiesPanel({ staffId, staffName }: { staffId: number; staffName: string }) {
  const [duties, setDuties] = useState<MyDuty[] | null>(null);

  useEffect(() => {
    api.get<MyDuty[]>("/staff/duties", { params: { staff_id: staffId } }).then((r) => setDuties(r.data));
  }, [staffId]);

  return (
    <Card className="border-white/10 bg-obsidian-900 shadow-sm" data-testid="my-duties-panel">
      <CardHeader className="border-white/10 pb-3.5">
        <CardTitle className="flex items-center gap-2 text-base text-white font-heading">
          <ClipboardList className="h-4 w-4 text-gold" /> My Duties
        </CardTitle>
        <p className="text-xs text-slate-400 font-body">Rooms and shifts assigned to {staffName}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {!duties ? (
          <Spinner label="Loading your duty assignments…" />
        ) : duties.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No duties assigned to you yet.</p>
        ) : (
          duties.map((d) => (
            <div
              key={d.id}
              data-testid={`my-duty-${d.id}`}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading font-bold text-white text-sm">{d.room_name || "—"}</p>
                <Badge tone="gold" size="sm">
                  {d.duty_type}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 font-body mt-1">
                {d.building_name} · {d.floor_name}
              </p>
              {(d.start_time || d.end_time) && (
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  {d.start_time ? formatDate(d.start_time) : "—"}
                  {d.end_time ? ` → ${formatDate(d.end_time)}` : ""}
                </p>
              )}
              {d.notes && <p className="text-[11px] text-slate-300 font-body mt-1">{d.notes}</p>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface Stats {
  participants: { total: number; expected: number; member_sum: number };
  teams: { total: number };
  rooms: { total: number; occupied: number; available: number; capacity: number; over_capacity: number };
  transport: { vehicles: number; assignments: number };
  procurement: { open: number };
  tasks: { pending: number; completed: number };
  decisions: { id: number; title: string; category: string; status: string; updated_at?: string }[];
  announcements: { id: number; title: string; priority: string; published_at?: string }[];
}

export default function Dashboard() {
  const me = useMe();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>("/dashboard/stats").then((r) => setS(r.data));
  }, []);

  if (!s) {
    return (
      <div className="py-20">
        <Spinner label="Loading Tournament Operations Center metrics…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-dashboard" className="space-y-6">
      {/* COMMAND CENTER HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              COMMAND & CONTROL
            </span>
            <LiveBadge label="OPERATIONS ACTIVE" />
          </div>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Tournament Operations Center
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            CBSE National Kabaddi Championship 2026–27 · Central real-time telemetry & operational status
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/matches"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-heading font-extrabold text-obsidian hover:bg-emerald-400 transition-colors shadow-sm"
          >
            <Radio className="h-4 w-4" /> Match Desk & Fixtures
          </Link>
          <Link
            to="/admin/reports"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-heading font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4 text-gold" /> Export Reports
          </Link>
        </div>
      </div>

      {/* MY DUTIES — only shown to accounts linked to a staff member */}
      {me?.staff_member && <MyDutiesPanel staffId={me.staff_member.id} staffName={me.staff_member.full_name} />}

      {/* METRICS STRIP (6 STAT CARDS) */}
      <div className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Users}
          label="Teams"
          value={s.teams.total}
          sub="Registered Squads"
          testId="stat-teams"
        />
        <StatCard
          icon={UserSquare2}
          label="Participants"
          value={s.participants.total}
          sub={`Target ~${s.participants.expected}`}
          accent
          testId="stat-participants"
        />
        <StatCard
          icon={BedDouble}
          label="Rooms"
          value={`${s.rooms.occupied}/${s.rooms.total}`}
          sub={`${s.rooms.available} Available`}
          testId="stat-rooms"
        />
        <StatCard
          icon={Bus}
          label="Transport"
          value={s.transport.vehicles}
          sub={`${s.transport.assignments} Dispatches`}
          testId="stat-transport"
        />
        <StatCard
          icon={ShoppingCart}
          label="Procurement"
          value={s.procurement.open}
          sub="Open Requisitions"
          testId="stat-procurement"
        />
        <StatCard
          icon={CheckSquare}
          label="Tasks"
          value={`${s.tasks.pending}`}
          sub={`${s.tasks.completed} Completed`}
          testId="stat-tasks"
        />
      </div>

      {/* OVER CAPACITY CRITICAL ALERT (if any) */}
      {s.rooms.over_capacity > 0 && (
        <Link
          to="/admin/accommodation"
          className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-gradient-to-r from-red-500/20 via-obsidian-900 to-obsidian-900 px-4 py-3.5 text-xs sm:text-sm font-semibold text-red-300 hover:border-red-500 hover:bg-red-500/25 transition-all shadow-sm"
          data-testid="over-capacity-warning"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-500 text-obsidian shrink-0 font-bold">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <strong className="font-heading font-black text-white text-sm">
              Capacity Warning: {s.rooms.over_capacity} room{s.rooms.over_capacity > 1 ? "s are" : " is"} over capacity
            </strong>
            <p className="text-red-300 text-xs font-body mt-0.5">
              Review room allocations in the Accommodation module to ensure compliance with student safety standards.
            </p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-red-400" />
        </Link>
      )}

      {/* RECENT DECISIONS & ANNOUNCEMENTS PANELS */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* RECENT DECISIONS */}
        <Card className="border-white/10 bg-obsidian-900 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-white/10 pb-3.5">
            <div>
              <CardTitle className="text-base text-white font-heading">
                Recent Organizing Decisions
              </CardTitle>
              <p className="text-xs text-slate-400 font-body">Cluster Knowledge Base & official rulings</p>
            </div>
            <Link
              to="/admin/knowledge"
              className="inline-flex items-center gap-1 text-xs font-heading font-extrabold text-gold hover:underline"
            >
              Knowledge Base <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {s.decisions.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No decisions recorded yet.</p>
            ) : (
              s.decisions.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading font-bold text-white text-sm">{d.title}</p>
                    <p className="text-[11px] text-slate-400 font-body mt-0.5">
                      {d.category} · Updated {formatDate(d.updated_at)}
                    </p>
                  </div>
                  <Badge tone={knowledgeStatusTone(d.status)} size="sm">
                    {d.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* RECENT ANNOUNCEMENTS */}
        <Card className="border-white/10 bg-obsidian-900 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-white/10 pb-3.5">
            <div>
              <CardTitle className="text-base text-white font-heading">
                Recent Broadcast Notices
              </CardTitle>
              <p className="text-xs text-slate-400 font-body">Public and coach bulletined updates</p>
            </div>
            <Link
              to="/admin/announcements"
              className="inline-flex items-center gap-1 text-xs font-heading font-extrabold text-gold hover:underline"
            >
              All Notices <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {s.announcements.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No broadcast notices published yet.</p>
            ) : (
              s.announcements.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading font-bold text-white text-sm">{a.title}</p>
                    <p className="text-[11px] text-slate-400 font-body mt-0.5">
                      Published {formatDate(a.published_at)}
                    </p>
                  </div>
                  <Badge tone={priorityTone(a.priority)} size="sm">
                    {a.priority.toUpperCase()}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/10 text-[11px] text-slate-500 font-mono">
        <span>Live Telemetry Connected · Single Source of Truth</span>
        <span>CBSE National Kabaddi 2026–27 Operations</span>
      </div>
    </div>
  );
}
