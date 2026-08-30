import { useEffect, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Trash2, Layers, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { useModuleAccess } from "@/lib/permissions";
import { formatDate } from "@/lib/meta";
import { cn } from "@/lib/utils";

const BACKEND = import.meta.env.REACT_APP_BACKEND_URL ?? "";

interface RoundT {
  id: number;
  name: string;
  sequence: number;
  format?: "KNOCKOUT" | "LEAGUE" | null;
  matches: { id: number; match_type?: string | null }[];
}
interface TournamentT {
  id: number;
  name: string;
  age_group?: string | null;
  match_count: number;
  rounds?: RoundT[];
}
interface ReportT {
  id: number;
  tournament_id: number;
  round_id: number | null;
  round_name: string;
  round_sequence: number;
  format: string;
  generated_at: string;
}

// Same fallback as Matches.tsx's roundFormat
function roundFormat(r: RoundT): "KNOCKOUT" | "LEAGUE" | null {
  if (r.format) return r.format;
  return (r.matches[0]?.match_type as "KNOCKOUT" | "LEAGUE" | undefined) ?? null;
}

export default function Reports() {
  const { canEdit } = useModuleAccess("matches");
  const [tournaments, setTournaments] = useState<TournamentT[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TournamentT | null>(null);
  const [reports, setReports] = useState<ReportT[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingRoundId, setGeneratingRoundId] = useState<number | null>(null);

  const loadBase = () => {
    setLoading(true);
    api
      .get<TournamentT[]>("/tournaments")
      .then((r) => {
        setTournaments(r.data);
        if (!selectedId && r.data.length > 0) setSelectedId(r.data[0].id);
      })
      .finally(() => setLoading(false));
  };
  useEffect(loadBase, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = (id: number) => {
    api.get<TournamentT>(`/tournaments/${id}`).then((r) => setDetail(r.data));
  };
  const loadReports = (id: number) => {
    api.get<ReportT[]>(`/tournaments/${id}/reports`).then((r) => setReports(r.data));
  };
  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
      loadReports(selectedId);
    } else {
      setDetail(null);
      setReports([]);
    }
  }, [selectedId]);

  const generateReport = async (roundId: number) => {
    if (!selectedId) return;
    setGeneratingRoundId(roundId);
    try {
      await api.post(`/tournaments/${selectedId}/rounds/${roundId}/reports`);
      toast.success("Snapshot report generated");
      loadReports(selectedId);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not generate report");
    } finally {
      setGeneratingRoundId(null);
    }
  };

  const deleteReport = async (id: number) => {
    if (!confirm("Delete this generated report snapshot?")) return;
    await api.delete(`/reports/${id}`);
    toast.success("Report deleted");
    if (selectedId) loadReports(selectedId);
  };

  const rounds = [...(detail?.rounds ?? [])].sort((a, b) => a.sequence - b.sequence);

  return (
    <div data-testid="admin-reports" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="border-b border-white/10 pb-5">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          OFFICIAL MATCH RECORDS & EXCEL EXPORTS
        </span>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
          Tournament Reports & Snapshots
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
          Generate official Excel scorecards and standings per round, or download complete multi-sheet tournament workbooks.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
          <Spinner label="Loading tournaments & report repositories…" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState title="No tournaments created" hint="Create tournament categories under Match Desk first." />
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 shadow-sm overflow-hidden">
          {/* TOURNAMENT TAB SWITCHER */}
          <div
            className="flex gap-2 overflow-x-auto border-b border-white/10 bg-obsidian-950 p-2 sm:px-4"
            data-testid="report-tournament-tabs"
          >
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                data-testid={`report-tournament-tab-${t.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-heading font-bold transition-all shrink-0",
                  selectedId === t.id
                    ? "bg-gold text-obsidian shadow-sm font-black"
                    : "text-slate-400 hover:text-white hover:bg-white/5",
                )}
              >
                <span>{t.name}</span>
                {t.age_group && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-mono",
                      selectedId === t.id ? "bg-obsidian/20 text-obsidian font-bold" : "bg-white/10 text-slate-300",
                    )}
                  >
                    {t.age_group}
                  </span>
                )}
              </button>
            ))}
          </div>

          {detail && (
            <div className="p-4 sm:p-6 space-y-6">
              {/* ACTION BAR */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h2 className="font-heading text-lg font-bold text-white tracking-tight">
                    {detail.name} Match Rounds
                  </h2>
                  <p className="text-xs text-slate-400 font-body mt-0.5">
                    {rounds.length} competition rounds configured
                  </p>
                </div>
                <a
                  href={`${BACKEND}/api/reports/tournaments/${detail.id}/full.xlsx`}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-heading font-black text-obsidian hover:bg-emerald-400 transition-colors shadow-sm shrink-0"
                  data-testid="download-full-report-btn"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Download Complete Excel Workbook (.xlsx)
                </a>
              </div>

              {/* ROUNDS TABLE */}
              <div>
                {rounds.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3">No rounds created for this tournament yet.</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-12">#</TH>
                        <TH>Competition Round</TH>
                        <TH>Format</TH>
                        <TH className="text-right">Match Count</TH>
                        <TH className="text-right">Report Action</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rounds.map((r, i) => {
                        const fmt = roundFormat(r);
                        return (
                          <TR key={r.id} data-testid={`report-round-row-${r.id}`}>
                            <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                            <TD className="font-heading font-bold text-white text-sm">{r.name}</TD>
                            <TD>
                              {fmt ? (
                                <Badge tone={fmt === "LEAGUE" ? "blue" : "gold"} size="sm">
                                  {fmt === "LEAGUE" ? "League / Pool" : "Knockout Bracket"}
                                </Badge>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </TD>
                            <TD className="text-right font-mono text-xs font-bold text-white">
                              {r.matches.length} Matches
                            </TD>
                            <TD className="text-right">
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => generateReport(r.id)}
                                  disabled={generatingRoundId === r.id}
                                  data-testid={`generate-report-${r.id}`}
                                  className="text-xs font-bold"
                                >
                                  {generatingRoundId === r.id ? (
                                    "Generating…"
                                  ) : (
                                    <>
                                      <RefreshCw className="h-3 w-3 text-gold" /> Generate Snapshot
                                    </>
                                  )}
                                </Button>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </div>

              {/* GENERATED REPORTS REPOSITORY */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-slate-400">
                    Generated Snapshots ({reports.length})
                  </h3>
                </div>

                {reports.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 italic">
                    No snapshot reports generated yet. Click "Generate Snapshot" above to create official records.
                  </p>
                ) : (
                  <div className="grid gap-2.5">
                    {reports.map((rep) => {
                      const deleted = rep.round_id == null;
                      return (
                        <div
                          key={rep.id}
                          data-testid={`report-row-${rep.id}`}
                          className={cn(
                            "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 shadow-sm transition-colors",
                            deleted
                              ? "border-amber-500/30 bg-amber-500/10"
                              : "border-white/10 bg-obsidian-950 hover:border-white/20",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-heading font-bold text-white text-sm">
                                {rep.round_name}
                              </span>
                              <Badge tone={rep.format === "LEAGUE" ? "blue" : "gold"} size="sm">
                                {rep.format === "LEAGUE" ? "League" : "Knockout"}
                              </Badge>
                              {deleted && (
                                <span
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400"
                                  data-testid={`report-deleted-badge-${rep.id}`}
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" /> Archived Round Snapshot
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400 font-mono">
                              Generated {formatDate(rep.generated_at)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={`${BACKEND}/api/reports/${rep.id}/download`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-heading font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
                              data-testid={`download-report-${rep.id}`}
                            >
                              <Download className="h-3.5 w-3.5 text-gold" /> Download XLSX
                            </a>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => deleteReport(rep.id)}
                                data-testid={`delete-report-${rep.id}`}
                                title="Delete Snapshot"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
