import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  Printer,
  RefreshCw,
  Users,
  Calendar,
  Layers,
  ShieldCheck,
  ClipboardList,
  CheckSquare2,
  UserCheck,
  AlertOctagon,
  Search,
  Filter,
  CheckSquare,
  Clock,
  MapPin,
  Phone,
  Mail,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api, BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

const BACKEND = BASE_URL;

export type StaffReportKey =
  | "staff-master"
  | "shift-roster"
  | "operational-areas"
  | "incharges"
  | "duties"
  | "tasks"
  | "individual"
  | "operational-issues";

interface MetaOption {
  id: number;
  name?: string;
  full_name?: string;
  code?: string;
  category?: string;
  phone?: string;
  date?: string;
  location_type?: string;
}

interface MetaData {
  shift_blocks: MetaOption[];
  staff_members: MetaOption[];
  staff_categories: string[];
  operational_areas: MetaOption[];
  locations: MetaOption[];
  task_categories: string[];
  task_statuses: string[];
  task_priorities: string[];
  issue_types: string[];
}

export function StaffOperationsReportsPanel() {
  const [activeReport, setActiveReport] = useState<StaffReportKey>("operational-issues");
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Filter States
  const [category, setCategory] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [shiftBlockId, setShiftBlockId] = useState<string>("");
  const [operationalAreaId, setOperationalAreaId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [targetDate, setTargetDate] = useState<string>("");
  const [dutyType, setDutyType] = useState<string>("");
  const [taskStatus, setTaskStatus] = useState<string>("");
  const [taskPriority, setTaskPriority] = useState<string>("");
  const [taskCategory, setTaskCategory] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [issueType, setIssueType] = useState<string>("");

  // Report Data
  const [reportData, setReportData] = useState<any>(null);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Load Meta Options
  useEffect(() => {
    api
      .get<MetaData>("/staff-reports/meta")
      .then((res) => setMeta(res.data))
      .catch((err) => {
        console.error("Failed to load staff reports metadata", err);
      })
      .finally(() => setLoadingMeta(false));
  }, []);

  // Build Query String
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (category) params.append("category", category);
    if (staffId) params.append("staff_id", staffId);
    if (shiftBlockId) params.append("shift_block_id", shiftBlockId);
    if (operationalAreaId) params.append("operational_area_id", operationalAreaId);
    if (dateFrom) params.append("date_from", dateFrom);
    if (dateTo) params.append("date_to", dateTo);
    if (targetDate) params.append("date", targetDate);
    if (dutyType) params.append("duty_type", dutyType);
    if (taskStatus) params.append("status", taskStatus);
    if (taskPriority) params.append("priority", taskPriority);
    if (taskCategory) params.append("category", taskCategory);
    if (overdueOnly) params.append("overdue_only", "true");
    if (issueType) params.append("issue_type", issueType);
    return params;
  };

  // Fetch Report Data
  const fetchReport = () => {
    if (activeReport === "individual" && !staffId) {
      if (meta?.staff_members && meta.staff_members.length > 0) {
        setStaffId(String(meta.staff_members[0].id));
      } else {
        return;
      }
    }

    setLoadingData(true);
    const params = buildQueryParams();
    // Default staffId for individual report if not in params
    if (activeReport === "individual" && !params.get("staff_id") && meta?.staff_members?.[0]) {
      params.set("staff_id", String(meta.staff_members[0].id));
    }

    api
      .get(`/staff-reports/${activeReport}?${params.toString()}`)
      .then((res) => {
        setReportData(res.data);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load report data");
      })
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    fetchReport();
  }, [activeReport]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetFilters = () => {
    setCategory("");
    if (activeReport !== "individual") {
      setStaffId("");
    }
    setShiftBlockId("");
    setOperationalAreaId("");
    setDateFrom("");
    setDateTo("");
    setTargetDate("");
    setDutyType("");
    setTaskStatus("");
    setTaskPriority("");
    setTaskCategory("");
    setOverdueOnly(false);
    setIssueType("");
  };

  const getExportUrl = () => {
    const params = buildQueryParams();
    if (activeReport === "individual" && !params.get("staff_id") && meta?.staff_members?.[0]) {
      params.set("staff_id", String(meta.staff_members[0].id));
    }
    return `${BACKEND}/api/staff-reports/${activeReport}.xlsx?${params.toString()}`;
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pt-4" data-testid="staff-operations-reports-section">
      {/* SECTION TITLE */}
      <div className="border-t border-white/10 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
                WORKFORCE & DEPLOYMENT INTELLIGENCE
              </span>
              <Badge tone="blue" size="sm">
                Organizer Operations
              </Badge>
            </div>
            <h2 className="mt-1 font-heading text-xl sm:text-2xl font-black tracking-tight text-white">
              Staff Operations Reports
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-400 font-body">
              Official shift rosters, operational team allocations, leadership logs, diagnostic problem audits & executive Excel exports.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(activeReport === "shift-roster" || activeReport === "operational-areas" || activeReport === "individual") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBrowserPrint}
                className="gap-1.5 text-xs font-heading font-bold"
                data-testid="print-report-btn"
              >
                <Printer className="h-3.5 w-3.5 text-slate-400" /> Print
              </Button>
            )}
            <a
              href={getExportUrl()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gold hover:bg-gold-light text-obsidian-950 font-heading font-extrabold text-xs px-3.5 py-2 transition-colors shadow-sm"
              data-testid="export-staff-report-btn"
            >
              <Download className="h-3.5 w-3.5" /> Export Excel (.xlsx)
            </a>
          </div>
        </div>
      </div>

      {/* REPORT SELECTOR TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-white/10 no-scrollbar">
        {[
          { key: "operational-issues", label: "Operational Issues", icon: AlertOctagon, badge: "Diagnostic" },
          { key: "shift-roster", label: "Shift Roster", icon: Calendar },
          { key: "operational-areas", label: "Operational Areas", icon: Layers },
          { key: "incharges", label: "In-Charges", icon: ShieldCheck },
          { key: "duties", label: "Duty Assignments", icon: ClipboardList },
          { key: "tasks", label: "Task Audit", icon: CheckSquare2 },
          { key: "individual", label: "Individual Staff Plan", icon: UserCheck },
          { key: "staff-master", label: "Staff Master", icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeReport === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveReport(tab.key as StaffReportKey)}
              data-testid={`staff-report-tab-${tab.key}`}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-heading font-bold transition-all shrink-0",
                isActive
                  ? "bg-gold text-obsidian-950 shadow-sm"
                  : "bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/5"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-obsidian-950" : "text-gold")} />
              {tab.label}
              {tab.badge && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold",
                    isActive ? "bg-obsidian-950 text-gold" : "bg-red-500/20 text-red-400"
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* DYNAMIC FILTER BAR */}
      <div className="rounded-xl border border-white/10 bg-obsidian-950/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
          <span className="text-xs font-heading font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-gold" /> Filter Parameters
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs text-slate-400 hover:text-white h-7 px-2"
            >
              Reset Filters
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReport}
              disabled={loadingData}
              className="text-xs font-bold gap-1.5 h-7 px-3 border-gold/30 text-gold hover:bg-gold/10"
              data-testid="apply-staff-report-filters-btn"
            >
              <RefreshCw className={cn("h-3 w-3", loadingData && "animate-spin")} /> Apply Filters
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
          {/* Staff Member (Available in almost all reports; mandatory for Individual) */}
          {(activeReport === "staff-master" ||
            activeReport === "shift-roster" ||
            activeReport === "operational-areas" ||
            activeReport === "incharges" ||
            activeReport === "duties" ||
            activeReport === "tasks" ||
            activeReport === "individual" ||
            activeReport === "operational-issues") && (
            <div>
              <Label className="text-[11px] text-slate-400 font-heading">
                Staff Member {activeReport === "individual" && <span className="text-gold">*</span>}
              </Label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                data-testid="filter-staff-member"
              >
                {activeReport !== "individual" && <option value="">All Staff Members</option>}
                {meta?.staff_members?.map((sm) => (
                  <option key={sm.id} value={sm.id}>
                    {sm.full_name} ({sm.category || "General"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Shift Block */}
          {(activeReport === "shift-roster" ||
            activeReport === "operational-areas" ||
            activeReport === "incharges" ||
            activeReport === "duties" ||
            activeReport === "tasks" ||
            activeReport === "operational-issues") && (
            <div>
              <Label className="text-[11px] text-slate-400 font-heading">Shift Block</Label>
              <select
                value={shiftBlockId}
                onChange={(e) => setShiftBlockId(e.target.value)}
                className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                data-testid="filter-shift-block"
              >
                <option value="">All Shift Blocks</option>
                {meta?.shift_blocks?.map((sb) => (
                  <option key={sb.id} value={sb.id}>
                    {sb.name} ({sb.date})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Operational Area */}
          {(activeReport === "shift-roster" ||
            activeReport === "operational-areas" ||
            activeReport === "incharges" ||
            activeReport === "duties" ||
            activeReport === "operational-issues") && (
            <div>
              <Label className="text-[11px] text-slate-400 font-heading">Operational Area</Label>
              <select
                value={operationalAreaId}
                onChange={(e) => setOperationalAreaId(e.target.value)}
                className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                data-testid="filter-operational-area"
              >
                <option value="">All Operational Areas</option>
                {meta?.operational_areas?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Staff Category */}
          {(activeReport === "staff-master" ||
            activeReport === "shift-roster" ||
            activeReport === "duties") && (
            <div>
              <Label className="text-[11px] text-slate-400 font-heading">Staff Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                data-testid="filter-staff-category"
              >
                <option value="">All Categories</option>
                {meta?.staff_categories?.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date range for Shift Roster */}
          {activeReport === "shift-roster" && (
            <>
              <div>
                <Label className="text-[11px] text-slate-400 font-heading">From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 h-8 text-xs bg-obsidian-900"
                />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400 font-heading">To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 h-8 text-xs bg-obsidian-900"
                />
              </div>
            </>
          )}

          {/* Target Date for Operational Area, Duties, Operational Issues */}
          {(activeReport === "operational-areas" ||
            activeReport === "duties" ||
            activeReport === "operational-issues") && (
            <div>
              <Label className="text-[11px] text-slate-400 font-heading">Specific Date</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 h-8 text-xs bg-obsidian-900"
              />
            </div>
          )}

          {/* Specific Duty search for Duty Assignments */}
          {activeReport === "duties" && (
            <div>
              <Label className="text-[11px] text-slate-400 font-heading">Duty Type</Label>
              <Input
                placeholder="e.g. Match Control"
                value={dutyType}
                onChange={(e) => setDutyType(e.target.value)}
                className="mt-1 h-8 text-xs bg-obsidian-900"
              />
            </div>
          )}

          {/* Task Filters */}
          {activeReport === "tasks" && (
            <>
              <div>
                <Label className="text-[11px] text-slate-400 font-heading">Task Status</Label>
                <select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  {meta?.task_statuses?.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400 font-heading">Priority</Label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                >
                  <option value="">All Priorities</option>
                  {meta?.task_priorities?.map((p) => (
                    <option key={p} value={p}>
                      {p.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400 font-heading">Task Category</Label>
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                >
                  <option value="">All Task Categories</option>
                  {meta?.task_categories?.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="overdueOnly"
                  checked={overdueOnly}
                  onChange={(e) => setOverdueOnly(e.target.checked)}
                  className="rounded border-white/20 bg-obsidian-900 text-gold focus:ring-0"
                />
                <label htmlFor="overdueOnly" className="text-xs text-slate-300 font-heading cursor-pointer">
                  Overdue Tasks Only
                </label>
              </div>
            </>
          )}

          {/* Issue Type filter for Operational Issues */}
          {activeReport === "operational-issues" && (
            <div>
              <Label className="text-[11px] text-slate-400 font-heading">Issue Category</Label>
              <select
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                className="w-full mt-1 rounded-lg border border-white/10 bg-obsidian-900 px-2.5 py-1.5 text-xs text-white focus:border-gold/50 focus:outline-none"
                data-testid="filter-issue-type"
              >
                <option value="">All Issue Categories</option>
                {meta?.issue_types?.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* REPORT CONTENT AREA */}
      {loadingData ? (
        <div className="py-16 text-center">
          <Spinner className="h-8 w-8 text-gold mx-auto" />
          <p className="mt-3 text-xs text-slate-400 font-mono">Generating report preview…</p>
        </div>
      ) : !reportData ? (
        <EmptyState title="No Report Data" hint="Select a report and click Apply Filters to view records." />
      ) : (
        <div className="space-y-4">
          {/* 1. OPERATIONAL ISSUES REPORT */}
          {activeReport === "operational-issues" && (
            <div className="space-y-4">
              {/* COMPACT SUMMARY COUNTER CARDS */}
              {reportData.counters && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="issues-summary-cards">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3">
                    <p className="text-[11px] font-heading font-bold text-amber-400 uppercase tracking-wider">
                      Staff Without Duties
                    </p>
                    <p className="mt-1 text-2xl font-black font-heading text-white">
                      {reportData.counters.staff_without_duties}
                    </p>
                    <p className="text-[10px] text-slate-500">Scheduled on shift, no work</p>
                  </div>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3">
                    <p className="text-[11px] font-heading font-bold text-red-400 uppercase tracking-wider">
                      Areas Without Lead
                    </p>
                    <p className="mt-1 text-2xl font-black font-heading text-white">
                      {reportData.counters.areas_without_incharge}
                    </p>
                    <p className="text-[10px] text-slate-500">Active team, no in-charge</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3">
                    <p className="text-[11px] font-heading font-bold text-amber-400 uppercase tracking-wider">
                      Duties Missing Location
                    </p>
                    <p className="mt-1 text-2xl font-black font-heading text-white">
                      {reportData.counters.duties_without_location}
                    </p>
                    <p className="text-[10px] text-slate-500">Unassigned venue spot</p>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-3">
                    <p className="text-[11px] font-heading font-bold text-blue-400 uppercase tracking-wider">
                      Outside-Shift Duties
                    </p>
                    <p className="mt-1 text-2xl font-black font-heading text-white">
                      {reportData.counters.outside_shift_duties}
                    </p>
                    <p className="text-[10px] text-slate-500">Extended duty timings</p>
                  </div>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3">
                    <p className="text-[11px] font-heading font-bold text-red-400 uppercase tracking-wider">
                      Overdue Tasks
                    </p>
                    <p className="mt-1 text-2xl font-black font-heading text-white">
                      {reportData.counters.overdue_tasks}
                    </p>
                    <p className="text-[10px] text-slate-500">Deadline past & incomplete</p>
                  </div>
                </div>
              )}

              {/* DETAILED ISSUES TABLE */}
              <div className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden">
                <div className="p-3 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs font-heading font-bold text-white uppercase tracking-wider">
                    Diagnostic Exceptions ({reportData.total_issues})
                  </span>
                  <Badge tone={reportData.total_issues === 0 ? "green" : "red"} size="sm">
                    {reportData.total_issues === 0 ? "All Operational Checks Passed" : "Exceptions Detected"}
                  </Badge>
                </div>

                {reportData.issues?.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No operational exceptions detected for the selected filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH className="w-24">Severity</TH>
                          <TH>Issue Type</TH>
                          <TH>Date & Shift</TH>
                          <TH>Staff / Area</TH>
                          <TH>Related Item</TH>
                          <TH className="min-w-[280px]">Diagnostic Description</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {reportData.issues?.map((iss: any, idx: number) => (
                          <TR key={idx} data-testid={`issue-row-${idx}`}>
                            <TD>
                              <Badge
                                tone={
                                  iss.severity === "CRITICAL"
                                    ? "red"
                                    : iss.severity === "WARNING"
                                    ? "amber"
                                    : "blue"
                                }
                                size="sm"
                              >
                                {iss.severity}
                              </Badge>
                            </TD>
                            <TD className="font-heading font-bold text-white text-xs">
                              {iss.issue_type?.replace(/_/g, " ")}
                            </TD>
                            <TD className="text-xs text-slate-300">
                              <div>{iss.date}</div>
                              <div className="text-[11px] text-slate-500">{iss.shift_name}</div>
                            </TD>
                            <TD className="text-xs">
                              <div className="text-white font-medium">{iss.staff_name}</div>
                              <div className="text-[11px] text-slate-400">{iss.operational_area}</div>
                            </TD>
                            <TD className="text-xs text-gold font-mono">{iss.related_entity}</TD>
                            <TD className="text-xs text-slate-300 font-body">{iss.description}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. SHIFT ROSTER REPORT */}
          {activeReport === "shift-roster" && (
            <div className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-heading font-bold text-white uppercase tracking-wider">
                  Shift Deployment Roster ({reportData.total} Records)
                </span>
              </div>
              {reportData.rows?.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">No roster records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Date & Shift</TH>
                        <TH>Staff Member</TH>
                        <TH>Operational Area</TH>
                        <TH>Specific Duty</TH>
                        <TH>Duty Timings</TH>
                        <TH>Location</TH>
                        <TH>In-Charge(s)</TH>
                        <TH>Status / Warning</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {reportData.rows?.map((r: any, idx: number) => (
                        <TR
                          key={idx}
                          className={cn(!r.has_duty && "bg-amber-500/[0.04]")}
                          data-testid={`shift-roster-row-${idx}`}
                        >
                          <TD className="text-xs">
                            <div className="font-heading font-bold text-white">{r.shift_name}</div>
                            <div className="text-slate-400 text-[11px]">
                              {r.date} ({r.shift_time_span})
                            </div>
                          </TD>
                          <TD className="text-xs">
                            <div className="font-heading font-bold text-white">{r.staff_name}</div>
                            <div className="text-slate-400 text-[11px]">
                              {r.category} • {r.phone}
                            </div>
                          </TD>
                          <TD className="text-xs text-slate-300 font-medium">{r.operational_area}</TD>
                          <TD className="text-xs">
                            <span className={cn(r.has_duty ? "text-white font-medium" : "text-amber-400 italic font-bold")}>
                              {r.specific_duty}
                            </span>
                          </TD>
                          <TD className="text-xs text-slate-400 font-mono">{r.duty_time_span}</TD>
                          <TD className="text-xs text-slate-300">{r.location}</TD>
                          <TD className="text-xs text-slate-300">{r.incharges}</TD>
                          <TD className="text-xs">
                            {!r.has_duty ? (
                              <Badge tone="amber" size="sm">
                                Not Assigned
                              </Badge>
                            ) : r.overflow_minutes ? (
                              <Badge tone="red" size="sm">
                                +{r.overflow_minutes}m Outside Shift
                              </Badge>
                            ) : (
                              <Badge tone="green" size="sm">
                                Scheduled
                              </Badge>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* 3. OPERATIONAL AREA REPORT */}
          {activeReport === "operational-areas" && (
            <div className="space-y-4">
              {reportData.shifts?.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-obsidian-950 p-12 text-center text-slate-400 text-xs">
                  No operational team records found.
                </div>
              ) : (
                reportData.shifts?.map((sb: any) => (
                  <div
                    key={sb.shift_block_id}
                    className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden"
                  >
                    <div className="bg-white/[0.02] p-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-heading font-bold text-white text-sm">
                          {sb.shift_name} ({sb.date})
                        </span>
                        <span className="ml-2 text-xs text-slate-400 font-mono">Window: {sb.time_span}</span>
                      </div>
                      <Badge tone="blue" size="sm">
                        {sb.areas?.length || 0} Operational Teams Active
                      </Badge>
                    </div>

                    <div className="divide-y divide-white/5">
                      {sb.areas?.map((area: any) => (
                        <div key={area.operational_area_name} className="p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <h3 className="font-heading font-extrabold text-sm text-gold">
                                {area.operational_area_name}
                              </h3>
                              <Badge tone="slate" size="sm">
                                {area.distinct_staff_count} Staff Deployed ({area.total_duties_count} Duties)
                              </Badge>
                            </div>
                            <div className="text-xs text-slate-400">
                              <span className="font-heading font-bold text-slate-300">In-Charge(s): </span>
                              {area.incharges?.length > 0
                                ? area.incharges.map((inc: string, i: number) => (
                                    <span key={i} className="text-white font-medium">
                                      {inc}
                                      {area.incharges_phones?.[i] ? ` (${area.incharges_phones[i]})` : ""}
                                      {i < area.incharges.length - 1 ? ", " : ""}
                                    </span>
                                  ))
                                : <span className="text-amber-400 italic">None Assigned</span>}
                            </div>
                          </div>

                          <Table>
                            <THead>
                              <TR>
                                <TH>Staff Name</TH>
                                <TH>Category</TH>
                                <TH>Phone</TH>
                                <TH>Specific Duty</TH>
                                <TH>Timings</TH>
                                <TH>Location</TH>
                              </TR>
                            </THead>
                            <TBody>
                              {area.duties?.map((d: any) => (
                                <TR key={d.duty_id}>
                                  <TD className="text-xs font-heading font-bold text-white">{d.staff_name}</TD>
                                  <TD className="text-xs text-slate-400">{d.category}</TD>
                                  <TD className="text-xs text-slate-300 font-mono">{d.staff_phone}</TD>
                                  <TD className="text-xs text-white font-medium">{d.specific_duty}</TD>
                                  <TD className="text-xs text-slate-400 font-mono">{d.duty_time_span}</TD>
                                  <TD className="text-xs text-slate-300">{d.location}</TD>
                                </TR>
                              ))}
                            </TBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 4. IN-CHARGE REPORT */}
          {activeReport === "incharges" && (
            <div className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-heading font-bold text-white uppercase tracking-wider">
                  Operational Leadership & In-Charges ({reportData.total} Slots)
                </span>
              </div>
              {reportData.rows?.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">No in-charge assignments found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Lead / In-Charge</TH>
                        <TH>Phone</TH>
                        <TH>Date & Shift</TH>
                        <TH>Operational Area</TH>
                        <TH className="text-center">Staff Reporting</TH>
                        <TH className="min-w-[240px]">Supervised Staff Personnel</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {reportData.rows?.map((r: any, idx: number) => (
                        <TR key={idx} data-testid={`incharge-row-${idx}`}>
                          <TD className="text-xs font-heading font-bold text-white">
                            <div>{r.staff_name}</div>
                            <div className="text-slate-500 text-[11px] font-normal">{r.category}</div>
                          </TD>
                          <TD className="text-xs text-slate-300 font-mono">{r.phone}</TD>
                          <TD className="text-xs text-slate-300">
                            <div>{r.shift_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {r.date} ({r.shift_time_span})
                            </div>
                          </TD>
                          <TD className="text-xs font-heading font-bold text-gold">{r.operational_area}</TD>
                          <TD className="text-xs text-center font-bold text-white">
                            <Badge tone="blue" size="sm">
                              {r.distinct_staff_count} Staff
                            </Badge>
                          </TD>
                          <TD className="text-xs text-slate-300 font-body">{r.reporting_staff_names}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* 5. DUTY ASSIGNMENTS REPORT */}
          {activeReport === "duties" && (
            <div className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-heading font-bold text-white uppercase tracking-wider">
                  Duty Assignments Register ({reportData.total} Assignments)
                </span>
              </div>
              {reportData.rows?.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">No duty assignment records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Staff Name</TH>
                        <TH>Date & Shift</TH>
                        <TH>Operational Area</TH>
                        <TH>Specific Duty</TH>
                        <TH>Location</TH>
                        <TH>Time & Duration</TH>
                        <TH>In-Charge(s)</TH>
                        <TH>Shift Compliance</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {reportData.rows?.map((r: any) => (
                        <TR key={r.id} data-testid={`duty-row-${r.id}`}>
                          <TD className="text-xs">
                            <div className="font-heading font-bold text-white">{r.staff_name}</div>
                            <div className="text-slate-500 text-[11px]">{r.category}</div>
                          </TD>
                          <TD className="text-xs text-slate-300">
                            <div>{r.shift_name}</div>
                            <div className="text-[11px] text-slate-500">{r.date}</div>
                          </TD>
                          <TD className="text-xs text-slate-300 font-medium">{r.operational_area}</TD>
                          <TD className="text-xs text-white font-medium">{r.specific_duty}</TD>
                          <TD className="text-xs text-slate-300">
                            <div className="font-medium text-white">{r.location}</div>
                            {((r.building && r.building !== "—") || (r.room && r.room !== "—")) && (
                              <div className="text-[11px] text-slate-400">
                                {[
                                  r.building && r.building !== "—" ? `Bldg: ${r.building}` : null,
                                  r.room && r.room !== "—" ? `Room: ${r.room}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </TD>
                          <TD className="text-xs font-mono text-slate-300">
                            <div>{r.duty_time_span}</div>
                            <div className="text-[10px] text-slate-500">{r.duration}</div>
                          </TD>
                          <TD className="text-xs text-slate-300">{r.incharges}</TD>
                          <TD className="text-xs">
                            {r.outside_shift ? (
                              <Badge tone="red" size="sm">
                                +{r.overflow_minutes}m Outside Shift
                              </Badge>
                            ) : (
                              <Badge tone="green" size="sm">
                                Within Shift
                              </Badge>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* 6. TASK REPORT */}
          {activeReport === "tasks" && (
            <div className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-heading font-bold text-white uppercase tracking-wider">
                  Operational Tasks Log ({reportData.total} Tasks)
                </span>
              </div>
              {reportData.rows?.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">No task records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Task Title</TH>
                        <TH>Assigned Staff</TH>
                        <TH>Shift Link</TH>
                        <TH>Category</TH>
                        <TH>Priority</TH>
                        <TH>Status</TH>
                        <TH>Due Date</TH>
                        <TH>Overdue</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {reportData.rows?.map((r: any) => (
                        <TR key={r.id} data-testid={`task-row-${r.id}`}>
                          <TD className="text-xs font-heading font-bold text-white">{r.title}</TD>
                          <TD className="text-xs">
                            <span className={cn(r.assigned_staff === "Unassigned" ? "text-amber-400 italic" : "text-white")}>
                              {r.assigned_staff}
                            </span>
                          </TD>
                          <TD className="text-xs text-slate-400">{r.shift_name}</TD>
                          <TD className="text-xs text-slate-300">{r.category}</TD>
                          <TD className="text-xs">
                            <Badge
                              tone={
                                r.priority === "urgent"
                                  ? "red"
                                  : r.priority === "high"
                                  ? "amber"
                                  : "slate"
                              }
                              size="sm"
                            >
                              {r.priority?.toUpperCase()}
                            </Badge>
                          </TD>
                          <TD className="text-xs">
                            <Badge tone={r.status === "completed" ? "green" : "blue"} size="sm">
                              {r.status?.toUpperCase()}
                            </Badge>
                          </TD>
                          <TD className="text-xs text-slate-300 font-mono">{r.due_date_display}</TD>
                          <TD className="text-xs">
                            {r.is_overdue ? (
                              <Badge tone="red" size="sm">
                                OVERDUE
                              </Badge>
                            ) : (
                              <Badge tone="green" size="sm">
                                OK
                              </Badge>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* 7. INDIVIDUAL STAFF REPORT (Print Friendly) */}
          {activeReport === "individual" && reportData.staff && (
            <div className="space-y-6" data-testid="individual-staff-report-view">
              {/* HEADER WORK PLAN CARD */}
              <div className="rounded-xl border border-white/10 bg-obsidian-950 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[11px] font-heading font-bold text-gold uppercase tracking-widest">
                      INDIVIDUAL TOURNAMENT WORK PLAN
                    </span>
                    <h3 className="mt-1 font-heading text-2xl font-black text-white">
                      {reportData.staff.full_name}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-gold" /> {reportData.staff.category}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-gold" /> {reportData.staff.phone}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-gold" /> {reportData.staff.email}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBrowserPrint}
                      className="gap-1.5 text-xs font-heading font-bold"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print Work Plan
                    </Button>
                  </div>
                </div>

                {/* SHIFTS & DUTIES */}
                <div className="mt-5 space-y-4">
                  <h4 className="font-heading text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gold" /> Shift & Duty Schedule
                  </h4>

                  {reportData.shifts?.length === 0 && reportData.shiftless_duties?.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 italic">No shifts or duties assigned yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {reportData.shifts?.map((s: any) => (
                        <div key={s.shift_block_id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                            <div>
                              <span className="font-heading font-bold text-white text-sm">{s.shift_name}</span>
                              <span className="ml-2 text-xs text-slate-400 font-mono">
                                {s.date} • {s.time_span}
                              </span>
                            </div>
                            <Badge tone="blue" size="sm">
                              {s.status}
                            </Badge>
                          </div>

                          <div className="mt-2.5">
                            {s.duties?.length === 0 ? (
                              <p className="text-xs text-amber-400 italic">Duty: Not Assigned</p>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {s.duties.map((d: any) => (
                                  <div
                                    key={d.duty_id}
                                    className="rounded border border-white/5 bg-obsidian-900/60 p-2.5 text-xs space-y-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-heading font-bold text-white">{d.duty_type}</span>
                                      <span className="text-slate-400 font-mono text-[11px]">{d.time_span}</span>
                                    </div>
                                    <div className="text-gold font-medium">{d.operational_area}</div>
                                    <div className="text-slate-400 flex items-center gap-1">
                                      <MapPin className="h-3 w-3" /> {d.location}
                                    </div>
                                    {d.incharges?.length > 0 && (
                                      <div className="text-slate-300 pt-1 text-[11px] border-t border-white/5">
                                        <span className="text-slate-500 font-bold">Report to: </span>
                                        {d.incharges.map((inc: any, i: number) => (
                                          <span key={i}>
                                            {inc.full_name} ({inc.phone})
                                            {i < d.incharges.length - 1 ? ", " : ""}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* IN-CHARGE RESPONSIBILITIES */}
                {reportData.incharge_responsibilities?.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
                    <h4 className="font-heading text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-gold" /> Leadership & In-Charge Roles
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {reportData.incharge_responsibilities.map((inc: any, i: number) => (
                        <div key={i} className="rounded-lg border border-gold/20 bg-gold/[0.03] p-3 text-xs space-y-1">
                          <div className="font-heading font-bold text-white text-sm">{inc.operational_area}</div>
                          <div className="text-slate-400">
                            {inc.shift_name} ({inc.date} • {inc.time_span})
                          </div>
                          <div className="text-gold font-bold pt-1">
                            {inc.distinct_staff_reporting} Staff Personnel Reporting Under You
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TASKS */}
                <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
                  <h4 className="font-heading text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-gold" /> Assigned Tasks
                  </h4>

                  {reportData.tasks?.open?.length === 0 && reportData.tasks?.completed?.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No tasks assigned to this staff member.</p>
                  ) : (
                    <div className="space-y-2">
                      {reportData.tasks?.open?.map((t: any) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2.5 rounded border border-white/5 bg-white/[0.01] text-xs"
                        >
                          <div>
                            <span className="font-heading font-bold text-white">{t.title}</span>
                            <span className="ml-2 text-slate-500 font-mono">Due: {t.due_date}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {t.is_overdue && (
                              <Badge tone="red" size="sm">
                                Overdue
                              </Badge>
                            )}
                            <Badge tone="blue" size="sm">
                              {t.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {reportData.tasks?.completed?.map((t: any) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2.5 rounded border border-white/5 bg-white/[0.01] text-xs opacity-60"
                        >
                          <span className="line-through text-slate-400">{t.title}</span>
                          <Badge tone="green" size="sm">
                            Completed
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 8. STAFF MASTER REPORT */}
          {activeReport === "staff-master" && (
            <div className="rounded-xl border border-white/10 bg-obsidian-950 overflow-hidden">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-xs font-heading font-bold text-white uppercase tracking-wider">
                  Staff Personnel Directory ({reportData.total} Records)
                </span>
              </div>
              {reportData.rows?.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">No staff personnel records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Staff Name</TH>
                        <TH>Category</TH>
                        <TH>Phone</TH>
                        <TH>Email</TH>
                        <TH className="text-center">Login Linked</TH>
                        <TH>Portal Username</TH>
                        <TH className="text-center">Account Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {reportData.rows?.map((r: any) => (
                        <TR key={r.id} data-testid={`staff-master-row-${r.id}`}>
                          <TD className="text-xs font-heading font-bold text-white">{r.full_name}</TD>
                          <TD className="text-xs text-slate-300">{r.category}</TD>
                          <TD className="text-xs text-slate-300 font-mono">{r.phone}</TD>
                          <TD className="text-xs text-slate-400">{r.email}</TD>
                          <TD className="text-xs text-center">
                            {r.login_linked ? (
                              <Badge tone="green" size="sm">
                                YES
                              </Badge>
                            ) : (
                              <Badge tone="slate" size="sm">
                                NO
                              </Badge>
                            )}
                          </TD>
                          <TD className="text-xs font-mono text-slate-300">{r.username}</TD>
                          <TD className="text-xs text-center">
                            {r.is_active === true ? (
                              <Badge tone="green" size="sm">
                                ACTIVE
                              </Badge>
                            ) : r.is_active === false ? (
                              <Badge tone="red" size="sm">
                                INACTIVE
                              </Badge>
                            ) : (
                              <span className="text-slate-500 text-xs">—</span>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
