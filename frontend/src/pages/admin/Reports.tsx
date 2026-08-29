import { useEffect, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { useModuleAccess } from "@/lib/permissions";
import { formatDate } from "@/lib/meta";

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

// Same fallback as Matches.tsx's roundFormat — a round created before format was
// tracked explicitly infers it from its own matches' match_type.
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
    api.get<TournamentT[]>("/tournaments").then((r) => {
      setTournaments(r.data);
      if (!selectedId && r.data.length > 0) setSelectedId(r.data[0].id);
    }).finally(() => setLoading(false));
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
      toast.success("Report generated");
      loadReports(selectedId);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not generate report");
    } finally {
      setGeneratingRoundId(null);
    }
  };

  const deleteReport = async (id: number) => {
    if (!confirm("Delete this report?")) return;
    await api.delete(`/reports/${id}`);
    toast.success("Report deleted");
    if (selectedId) loadReports(selectedId);
  };

  const rounds = [...(detail?.rounds ?? [])].sort((a, b) => a.sequence - b.sequence);

  return (
    <div data-testid="admin-reports">
      <h1 className="font-heading text-2xl font-black tracking-tight text-white">Reports</h1>
      <p className="mt-1 text-sm text-slate-400">
        Generate a snapshot report for one round — fixtures, byes, and scores — or download the whole
        tournament as one workbook with a sheet per round.
      </p>

      {loading ? (
        <div className="mt-6"><Spinner /></div>
      ) : tournaments.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-6">
          <EmptyState title="No tournaments yet" hint="Create one under Matches & Fixtures first." />
        </div>
      ) : (
        <div className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-2 pt-2" data-testid="report-tournament-tabs">
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                data-testid={`report-tournament-tab-${t.id}`}
                className={`shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selectedId === t.id
                    ? "border-coral text-coral"
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:text-white"
                }`}
              >
                {t.name}
                {t.age_group && <span className="ml-1.5 text-xs font-normal text-slate-400">· {t.age_group}</span>}
              </button>
            ))}
          </div>

          {detail && (
            <div className="p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-slate-400">Rounds</h2>
                <a
                  href={`${BACKEND}/api/reports/tournaments/${detail.id}/full.xlsx`}
                  className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                  data-testid="download-full-report-btn"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Download Full Tournament Report
                </a>
              </div>

              {rounds.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No rounds yet for this tournament.</p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Round</TH>
                        <TH>Format</TH>
                        <TH className="text-right">Matches</TH>
                        <TH className="text-right">Actions</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {rounds.map((r) => {
                        const fmt = roundFormat(r);
                        return (
                          <TR key={r.id} data-testid={`report-round-row-${r.id}`}>
                            <TD className="font-bold text-white">{r.name}</TD>
                            <TD>{fmt && <Badge tone={fmt === "LEAGUE" ? "blue" : "neutral"}>{fmt === "LEAGUE" ? "League" : "Knockout"}</Badge>}</TD>
                            <TD className="text-right text-slate-300">{r.matches.length}</TD>
                            <TD className="text-right">
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => generateReport(r.id)}
                                  disabled={generatingRoundId === r.id}
                                  data-testid={`generate-report-${r.id}`}
                                >
                                  {generatingRoundId === r.id ? "Generating…" : "Generate Report"}
                                </Button>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}

              <h2 className="mt-6 font-heading text-sm font-bold uppercase tracking-widest text-slate-400">Generated Reports</h2>
              {reports.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No reports generated yet — use "Generate Report" above.</p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {reports.map((rep) => {
                    const deleted = rep.round_id == null;
                    return (
                      <div
                        key={rep.id}
                        data-testid={`report-row-${rep.id}`}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${
                          deleted ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-white/5"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white">{rep.round_name}</span>
                            <Badge tone={rep.format === "LEAGUE" ? "blue" : "neutral"}>{rep.format === "LEAGUE" ? "League" : "Knockout"}</Badge>
                            {deleted && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400" data-testid={`report-deleted-badge-${rep.id}`}>
                                <AlertTriangle className="h-3.5 w-3.5" /> This round has been deleted — showing data as of generation
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">Generated {formatDate(rep.generated_at)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <a
                            href={`${BACKEND}/api/reports/${rep.id}/download`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                            data-testid={`download-report-${rep.id}`}
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => deleteReport(rep.id)} data-testid={`delete-report-${rep.id}`}>
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
