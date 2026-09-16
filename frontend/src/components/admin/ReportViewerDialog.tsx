import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  Download,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  X,
} from "lucide-react";
import { api, BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export type ReportSection =
  | "attendance"
  | "arrival"
  | "billing"
  | "duty"
  | "matches"
  | "accommodation"
  | "accounts";

export const REPORT_TITLES: Record<ReportSection, string> = {
  attendance: "Attendance Report",
  arrival: "Arrival Report",
  billing: "Payments & Billing Ledger",
  duty: "Staff Duty Report",
  matches: "Match Progress & Scores",
  accommodation: "Room Map / Accommodation Report",
  accounts: "Organizer Accounts & Permissions",
};

interface DetailData {
  columns: string[];
  rows: (string | number)[][];
  row_flags?: boolean[];
}

interface ReportViewerDialogProps {
  open: boolean;
  onClose: () => void;
  section: ReportSection | null;
  downloadHref?: string;
  fileLabel?: string;
}

export function ReportViewerDialog({
  open,
  onClose,
  section,
  downloadHref,
  fileLabel = "Download .xlsx",
}: ReportViewerDialogProps) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchReport = (sec: ReportSection) => {
    setLoading(true);
    setData(null);
    setSearch("");
    api
      .get<DetailData>(`/export/live-detail/${sec}`)
      .then((res) => {
        setData(res.data);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        console.error("Failed to load report detail:", err);
        setData({ columns: [], rows: [] });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && section) {
      fetchReport(section);
    } else {
      setData(null);
      setSearch("");
    }
  }, [open, section]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const paired = data.rows.map((row, i) => ({
      row,
      flagged: data.row_flags?.[i] ?? false,
    }));
    const q = search.trim().toLowerCase();
    if (!q) return paired;
    return paired.filter(({ row }) =>
      row.some((cell) => String(cell).toLowerCase().includes(q))
    );
  }, [data, search]);

  if (!open || !section) return null;

  const title = REPORT_TITLES[section] || "Live Report";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-3 sm:p-6 backdrop-blur-md transition-opacity"
      onClick={onClose}
      data-testid="report-viewer-dialog-overlay"
    >
      <div
        className="mt-6 sm:mt-10 w-full max-w-6xl rounded-2xl border border-white/15 bg-obsidian-950 text-slate-100 shadow-2xl transition-all overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        data-testid="report-viewer-dialog"
      >
        {/* HEADER WITH BACK NAVIGATION & ACTIONS */}
        <div className="border-b border-white/10 bg-obsidian-900/90 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 text-xs font-heading font-extrabold text-gold hover:text-white bg-gold/10 hover:bg-gold/20 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
              data-testid="report-viewer-back-btn"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Reports</span>
            </button>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-black tracking-tight text-white truncate">
                {title}
              </h2>
              {lastUpdated && (
                <p className="text-[11px] text-slate-400 font-mono">
                  Live data as of {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {downloadHref && (
              <a
                href={downloadHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-heading font-black text-obsidian hover:bg-emerald-400 transition-colors shadow-sm"
                data-testid="report-viewer-download-btn"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{fileLabel}</span>
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchReport(section)}
              disabled={loading}
              title="Refresh live report data"
              className="h-8 text-xs font-bold"
              data-testid="report-viewer-refresh-btn"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 text-gold", loading && "animate-spin")} />
              <span className="hidden sm:inline ml-1">Refresh</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* SEARCH & COUNTER TOOLBAR */}
        <div className="border-b border-white/5 bg-obsidian-900/40 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              placeholder="Search in this report…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch("")}
              className="h-9 text-xs"
              data-testid="report-viewer-search-input"
            />
          </div>
          {data && (
            <div className="text-xs font-mono text-slate-400">
              Showing <strong className="text-white">{filteredRows.length}</strong> of{" "}
              <strong>{data.rows.length}</strong> records
              {search && (
                <span className="text-gold ml-1.5 font-sans">(filtered)</span>
              )}
            </div>
          )}
        </div>

        {/* TABLE CONTENT AREA */}
        <div className="flex-1 overflow-auto p-4 sm:p-5">
          {loading ? (
            <div className="py-20">
              <Spinner label={`Loading ${title}…`} />
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="py-16">
              <EmptyState
                title="No Data Available"
                hint="This report currently has no entries or registrations to show."
              />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden bg-obsidian-900">
              <Table>
                <THead>
                  <TR className="bg-white/5">
                    {data.columns.map((col, idx) => (
                      <TH key={idx} className="whitespace-nowrap font-heading text-xs font-bold text-slate-300">
                        {col}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {filteredRows.length === 0 ? (
                    <TR>
                      <TD colSpan={data.columns.length} className="text-center py-8 text-slate-500 italic">
                        No records match your search filter "{search}".
                      </TD>
                    </TR>
                  ) : (
                    filteredRows.map(({ row, flagged }, i) => (
                      <TR
                        key={i}
                        className={cn(
                          "transition-colors hover:bg-white/[0.02]",
                          flagged && "bg-amber-500/15 hover:bg-amber-500/20 border-l-2 border-l-amber-400"
                        )}
                      >
                        {row.map((cell, j) => (
                          <TD key={j} className="whitespace-nowrap text-xs text-slate-200">
                            {cell === "Present" ? (
                              <span className="inline-flex items-center rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                Present
                              </span>
                            ) : cell === "Absent" ? (
                              <span className="inline-flex items-center rounded bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-300">
                                Absent
                              </span>
                            ) : cell === "Arrived" ? (
                              <span className="inline-flex items-center rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                Arrived
                              </span>
                            ) : cell === "Not Arrived" ? (
                              <span className="inline-flex items-center rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                Not Arrived
                              </span>
                            ) : (
                              String(cell ?? "—")
                            )}
                          </TD>
                        ))}
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-white/10 bg-obsidian-900/80 px-5 py-3 flex items-center justify-between text-xs text-slate-400">
          <span>Official Event Record</span>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-7 text-xs font-bold"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
