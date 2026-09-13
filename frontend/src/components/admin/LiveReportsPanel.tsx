import { useEffect, useMemo, useState } from "react";
import { Activity, Bus, Wallet, ShieldCheck, UserCog, Trophy, RefreshCw, Maximize2, BedDouble } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/meta";
import { cn } from "@/lib/utils";

type Section = "attendance" | "arrival" | "billing" | "duty" | "matches" | "accommodation" | "accounts";
const SECTION_TITLE: Record<Section, string> = {
  attendance: "Attendance",
  arrival: "Arrival",
  billing: "Billing",
  duty: "Duty Coverage",
  matches: "Match Progress",
  accommodation: "Room Map / Accommodation",
  accounts: "Organizer Accounts",
};
interface DetailData {
  columns: string[];
  rows: (string | number)[][];
  // Parallel to rows — true flags a row for visual emphasis (currently just
  // the Arrival report's "registered > billed" rows). Absent/undefined for
  // sections that don't flag anything.
  row_flags?: boolean[];
}

interface PendingTeam {
  team_id: number;
  name: string;
  pending: string[];
}
interface TournamentSummary {
  id: number;
  name: string;
  age_group: string | null;
  matches_total: number;
  matches_completed: number;
  matches_live: number;
  matches_scheduled: number;
}
interface LiveSummary {
  attendance?: {
    participants_total: number;
    participants_present: number;
    coaches_total: number;
    coaches_present: number;
  };
  arrival?: { teams_total: number; arrived: number; not_arrived: number; pending_teams: PendingTeam[] };
  billing?: { total_billed: number; total_paid: number; total_refunded: number; balance_due: number; net_collected: number };
  duty?: { staff_total: number; staff_with_duty: number; staff_without_duty: number; duty_assignments_total: number };
  accommodation?: { rooms_total: number; total_capacity: number; beds_occupied: number; assignments_total: number };
  tournaments?: TournamentSummary[];
  accounts?: { total: number; active: number; admins: number };
}

const POLL_MS = 20_000;

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function ProgressBar({ value, tone = "gold" }: { value: number; tone?: "gold" | "emerald" | "coral" }) {
  const fill = tone === "emerald" ? "bg-emerald-500" : tone === "coral" ? "bg-coral" : "bg-gold";
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  onOpen,
  children,
}: {
  icon: React.ElementType;
  title: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-3 text-left w-full hover:border-gold/30 hover:bg-white/[0.02] transition-colors group"
      data-testid={`live-report-card-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
    >
      <h3 className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wider text-slate-300">
          <Icon className="h-4 w-4 text-gold" /> {title}
        </span>
        <Maximize2 className="h-3.5 w-3.5 text-slate-600 group-hover:text-gold transition-colors shrink-0" />
      </h3>
      {children}
    </button>
  );
}

export function LiveReportsPanel() {
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .get<LiveSummary>("/export/live-summary")
        .then((r) => {
          if (cancelled) return;
          setSummary(r.data);
          setLastUpdated(new Date());
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const openDetail = (section: Section) => {
    setOpenSection(section);
    setDetail(null);
    setDetailSearch("");
    setDetailLoading(true);
    api
      .get<DetailData>(`/export/live-detail/${section}`)
      .then((r) => setDetail(r.data))
      .catch(() => setDetail({ columns: [], rows: [] }))
      .finally(() => setDetailLoading(false));
  };
  const closeDetail = () => setOpenSection(null);

  const filteredRows = useMemo(() => {
    if (!detail) return [];
    // Pair each row with its flag (if any) BEFORE filtering, so a flagged
    // row's highlight survives the search filter shifting row indices.
    const paired = detail.rows.map((row, i) => ({ row, flagged: detail.row_flags?.[i] ?? false }));
    const q = detailSearch.trim().toLowerCase();
    if (!q) return paired;
    return paired.filter(({ row }) => row.some((cell) => String(cell).toLowerCase().includes(q)));
  }, [detail, detailSearch]);

  if (!summary || Object.keys(summary).length === 0) return null;

  const { attendance, arrival, billing, duty, tournaments, accommodation, accounts } = summary;

  return (
    <div className="space-y-3" data-testid="live-reports-panel">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wider text-slate-400">
          <Activity className="h-3.5 w-3.5 text-emerald-400" /> Live Reports
        </h2>
        {lastUpdated && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
            <RefreshCw className="h-3 w-3" /> Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {attendance && (
          <StatCard icon={ShieldCheck} title="Attendance" onOpen={() => openDetail("attendance")}>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Participants</span>
                <span className="font-mono font-bold text-white">
                  {attendance.participants_present}/{attendance.participants_total}
                </span>
              </div>
              <ProgressBar value={pct(attendance.participants_present, attendance.participants_total)} tone="emerald" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Coaches / Managers</span>
                <span className="font-mono font-bold text-white">
                  {attendance.coaches_present}/{attendance.coaches_total}
                </span>
              </div>
              <ProgressBar value={pct(attendance.coaches_present, attendance.coaches_total)} tone="emerald" />
            </div>
          </StatCard>
        )}

        {arrival && (
          <StatCard icon={Bus} title="Arrival" onOpen={() => openDetail("arrival")}>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Delegations Arrived</span>
                <span className="font-mono font-bold text-white">
                  {arrival.arrived}/{arrival.teams_total}
                </span>
              </div>
              <ProgressBar value={pct(arrival.arrived, arrival.teams_total)} />
            </div>
            {arrival.pending_teams.length > 0 ? (
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {arrival.pending_teams.slice(0, 6).map((pt) => (
                  <div key={pt.team_id} className="text-[11px] text-slate-400">
                    <span className="text-slate-200 font-semibold">{pt.name}</span>: {pt.pending.join(", ")}
                  </div>
                ))}
                {arrival.pending_teams.length > 6 && (
                  <p className="text-[10px] text-slate-500">+{arrival.pending_teams.length - 6} more</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-400">All arrived teams are fully processed.</p>
            )}
          </StatCard>
        )}

        {billing && (
          <StatCard icon={Wallet} title="Billing" onOpen={() => openDetail("billing")}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <span className="text-slate-400">Billed</span>
              <span className="text-right font-mono font-bold text-white">{formatMoney(billing.total_billed)}</span>
              <span className="text-slate-400">Paid</span>
              <span className="text-right font-mono font-bold text-emerald-400">{formatMoney(billing.total_paid)}</span>
              <span className="text-slate-400">Refunded</span>
              <span className="text-right font-mono font-bold text-coral">{formatMoney(billing.total_refunded)}</span>
              <span className="text-slate-400">Balance Due</span>
              <span className="text-right font-mono font-bold text-gold">{formatMoney(billing.balance_due)}</span>
            </div>
          </StatCard>
        )}

        {duty && (
          <StatCard icon={ShieldCheck} title="Duty Coverage" onOpen={() => openDetail("duty")}>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Staff With a Duty</span>
                <span className="font-mono font-bold text-white">
                  {duty.staff_with_duty}/{duty.staff_total}
                </span>
              </div>
              <ProgressBar value={pct(duty.staff_with_duty, duty.staff_total)} tone="emerald" />
            </div>
            <p className="text-[11px] text-slate-400">{duty.duty_assignments_total} total duty assignments</p>
          </StatCard>
        )}

        {accommodation && (
          <StatCard icon={BedDouble} title="Room Map / Accommodation" onOpen={() => openDetail("accommodation")}>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Beds Occupied</span>
                <span className="font-mono font-bold text-white">
                  {accommodation.beds_occupied}/{accommodation.total_capacity}
                </span>
              </div>
              <ProgressBar value={pct(accommodation.beds_occupied, accommodation.total_capacity)} tone="emerald" />
            </div>
            <p className="text-[11px] text-slate-400">
              {accommodation.rooms_total} rooms · {accommodation.assignments_total} allocations recorded
            </p>
          </StatCard>
        )}

        {tournaments && tournaments.length > 0 && (
          <StatCard icon={Trophy} title="Match Progress" onOpen={() => openDetail("matches")}>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
              {tournaments.map((t) => (
                <div key={t.id} className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span className="truncate">
                      {t.name}
                      {t.matches_live > 0 && (
                        <Badge tone="live" size="sm" className="ml-1.5">
                          {t.matches_live} LIVE
                        </Badge>
                      )}
                    </span>
                    <span className="font-mono font-bold text-white shrink-0">
                      {t.matches_completed}/{t.matches_total}
                    </span>
                  </div>
                  <ProgressBar value={pct(t.matches_completed, t.matches_total)} />
                </div>
              ))}
            </div>
          </StatCard>
        )}

        {accounts && (
          <StatCard icon={UserCog} title="Organizer Accounts" onOpen={() => openDetail("accounts")}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-mono text-lg font-black text-white">{accounts.total}</p>
                <p className="text-[10px] text-slate-500 uppercase">Total</p>
              </div>
              <div>
                <p className="font-mono text-lg font-black text-emerald-400">{accounts.active}</p>
                <p className="text-[10px] text-slate-500 uppercase">Active</p>
              </div>
              <div>
                <p className="font-mono text-lg font-black text-gold">{accounts.admins}</p>
                <p className="text-[10px] text-slate-500 uppercase">Admins</p>
              </div>
            </div>
          </StatCard>
        )}
      </div>

      <Dialog
        open={openSection !== null}
        onClose={closeDetail}
        title={openSection ? `${SECTION_TITLE[openSection]} — Full Report` : "Full Report"}
        testId="live-report-detail-dialog"
        className="max-w-4xl"
      >
        <div className="space-y-3">
          {detailLoading ? (
            <div className="py-10">
              <Spinner label="Loading report…" />
            </div>
          ) : !detail || detail.rows.length === 0 ? (
            <EmptyState title="No data yet" hint="This report has nothing to show yet." />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <SearchInput
                  placeholder="Search this report…"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  onClear={() => setDetailSearch("")}
                  className="max-w-xs"
                  data-testid="live-report-detail-search"
                />
                <span className="text-xs text-slate-500 shrink-0">
                  {filteredRows.length} of {detail.rows.length} rows
                </span>
              </div>
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-white/10">
                <Table>
                  <THead>
                    <TR>
                      {detail.columns.map((col) => (
                        <TH key={col} className="whitespace-nowrap">
                          {col}
                        </TH>
                      ))}
                    </TR>
                  </THead>
                  <TBody>
                    {filteredRows.map(({ row, flagged }, i) => (
                      <TR key={i} className={flagged ? "bg-amber-500/20 hover:bg-amber-500/25" : undefined}>
                        {row.map((cell, j) => (
                          <TD key={j} className="whitespace-nowrap">
                            {cell}
                          </TD>
                        ))}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
