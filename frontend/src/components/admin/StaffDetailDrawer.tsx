import { useState } from "react";
import {
  X,
  Phone,
  Mail,
  HardHat,
  Calendar,
  CheckSquare,
  KeyRound,
  Pencil,
  Trash2,
  Clock,
  Building,
  User,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { cn } from "@/lib/utils";

export interface StaffDetailMember {
  id: number;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
  notes?: string | null;
  login_username?: string | null;
}

export interface StaffShiftItem {
  id: number;
  shift_block_id?: number;
  shift_name?: string;
  staff_id: number;
  staff_name?: string;
  staff_category?: string;
  staff_phone?: string;
  start_time: string;
  end_time: string;
  status: string;
  derived_status: string;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  duty_count?: number;
  task_count?: number;
}

export interface StaffDutyItem {
  id: number;
  staff_id: number;
  shift_id?: number | null;
  shift_name?: string | null;
  staff_name?: string;
  room_id?: number | null;
  room_name?: string;
  location_id?: number | null;
  location_name?: string | null;
  location_type?: string | null;
  floor_name?: string;
  building_name?: string;
  duty_type: string;
  operational_area_id?: number | null;
  operational_area_name?: string | null;
  start_time?: string;
  end_time?: string;
  notes?: string;
  warning?: string | null;
  outside_shift_minutes?: number | null;
  location_source?: string | null;
  location_source_id?: number | null;
}

export interface StaffTaskItem {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority?: string;
  category: string;
  owner?: string | null;
  assigned_staff_id?: number | null;
  shift_id?: number | null;
  due_date?: string | null;
}

interface StaffDetailDrawerProps {
  staff: StaffDetailMember | null;
  shifts?: StaffShiftItem[];
  duties?: StaffDutyItem[];
  tasks?: StaffTaskItem[];
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onEditStaff: (staff: StaffDetailMember) => void;
  onDeleteStaff: (id: number) => void;
  onCreateCredential: (staff: StaffDetailMember) => void;
  onDeleteDuty?: (id: number) => void;
  onDeleteShift?: (id: number) => void;
  onToggleTask?: (task: StaffTaskItem) => void;
  creatingCredential?: boolean;
}

export function StaffDetailDrawer({
  staff,
  shifts = [],
  duties = [],
  tasks = [],
  open,
  onClose,
  canEdit,
  onEditStaff,
  onDeleteStaff,
  onCreateCredential,
  creatingCredential = false,
}: StaffDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "shifts" | "login">("overview");

  if (!open || !staff) return null;

  const staffShifts = shifts.filter((s) => s.staff_id === staff.id);
  const staffDuties = duties.filter((d) => d.staff_id === staff.id);
  const staffTasks = tasks.filter((t) => t.assigned_staff_id === staff.id);

  const pad = (n: number) => String(n).padStart(2, "0");
  const formatTime = (iso?: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" data-testid="staff-detail-drawer">
      {/* BACKDROP */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        data-testid="staff-drawer-backdrop"
      />

      {/* DRAWER PANEL */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-obsidian-950 border-l border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
          {/* HEADER */}
          <div className="border-b border-white/10 bg-obsidian-900/90 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/15 text-gold font-heading font-black text-lg shadow-sm">
                  {staff.full_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="font-heading text-lg font-black tracking-tight text-white truncate">
                      {staff.full_name}
                    </h2>
                    {staff.category && (
                      <span className="rounded bg-gold/20 border border-gold/40 px-2 py-0.5 text-[10px] font-heading font-bold text-gold uppercase tracking-wider">
                        {staff.category}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300 font-body">
                    {staff.phone && (
                      <a
                        href={`tel:${staff.phone}`}
                        className="flex items-center gap-1 hover:text-gold transition-colors font-mono"
                      >
                        <Phone className="h-3 w-3 text-gold" /> {staff.phone}
                      </a>
                    )}
                    {staff.email && (
                      <a
                        href={`mailto:${staff.email}`}
                        className="flex items-center gap-1 hover:text-gold transition-colors"
                      >
                        <Mail className="h-3 w-3 text-slate-400" /> {staff.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                data-testid="close-staff-drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* TAB NAVIGATION: Simplified to 3 focused tabs */}
            <div className="mt-4 flex gap-1 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-heading font-bold transition-colors",
                  activeTab === "overview"
                    ? "bg-gold text-obsidian font-black shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                Profile Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("shifts")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-heading font-bold transition-colors flex items-center justify-center gap-1",
                  activeTab === "shifts"
                    ? "bg-gold text-obsidian font-black shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <span>Working Shifts</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                    activeTab === "shifts"
                      ? "bg-obsidian/20 text-obsidian font-black"
                      : "bg-white/10 text-slate-300"
                  )}
                >
                  {staffShifts.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("login")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-heading font-bold transition-colors flex items-center justify-center gap-1",
                  activeTab === "login"
                    ? "bg-gold text-obsidian font-black shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <KeyRound className="h-3 w-3" />
                <span>Portal Account</span>
              </button>
            </div>
          </div>

          {/* TAB CONTENT BODY */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* 1. OVERVIEW TAB ("Who is this person?") */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* PERSONNEL DETAILS CARD */}
                <div className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-3">
                  <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                    Personnel Information
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 font-mono text-[10px] block">Full Name</span>
                      <span className="font-heading font-bold text-white">{staff.full_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-mono text-[10px] block">Role / Category</span>
                      <span className="text-gold font-bold">{staff.category || "General"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-mono text-[10px] block">Phone</span>
                      <span className="font-mono text-slate-200">{staff.phone || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-mono text-[10px] block">Email</span>
                      <span className="text-slate-200 truncate block">{staff.email || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* OPERATIONAL NOTES */}
                <div className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
                  <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                    Operational Notes
                  </p>
                  <p className="text-xs text-slate-200 font-body leading-relaxed">
                    {staff.notes || "No additional notes recorded for this staff member."}
                  </p>
                </div>

                {/* READ-ONLY CURRENT ASSIGNMENTS SUMMARY */}
                <div className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-2">
                  <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <HardHat className="h-3 w-3 text-gold" /> Current Duties ({staffDuties.length})
                  </p>
                  {staffDuties.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-1">No active duty allotments.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {staffDuties.map((d) => (
                        <div
                          key={d.id}
                          className="rounded bg-white/5 p-2 text-xs flex items-center justify-between"
                        >
                          <div>
                            <span className="font-heading font-bold text-white block">
                              {d.duty_type}
                            </span>
                            <span className="text-slate-400 text-[11px] font-mono flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5 text-emerald-400" />
                              {d.location_name || d.room_name || "Operational Venue"}
                            </span>
                          </div>
                          {d.shift_name && (
                            <span className="text-[10px] font-mono text-gold bg-gold/10 px-2 py-0.5 rounded">
                              {d.shift_name}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* READ-ONLY TASKS SUMMARY */}
                <div className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-2">
                  <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <CheckSquare className="h-3 w-3 text-cyan-400" /> Action Tasks ({staffTasks.length})
                  </p>
                  {staffTasks.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-1">No action tasks assigned.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {staffTasks.map((t) => (
                        <div
                          key={t.id}
                          className="rounded bg-white/5 p-2 text-xs flex items-center justify-between"
                        >
                          <span
                            className={cn(
                              "font-medium truncate",
                              t.status === "completed" ? "line-through text-slate-500" : "text-white"
                            )}
                          >
                            {t.title}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-slate-400">
                            [{t.status}]
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. SHIFTS TAB (Read-only context on when this person works) */}
            {activeTab === "shifts" && (
              <div className="space-y-3">
                {staffShifts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-8 text-center space-y-2">
                    <Clock className="h-8 w-8 text-slate-500 mx-auto" />
                    <p className="font-heading text-sm font-bold text-white">No Shifts Scheduled</p>
                    <p className="text-xs text-slate-400 font-body">
                      This staff member has not been added to any shift blocks yet.
                    </p>
                  </div>
                ) : (
                  staffShifts.map((s) => {
                    const timeStr = `${formatTime(s.start_time)} – ${formatTime(s.end_time)}`;
                    return (
                      <div
                        key={s.id}
                        className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-2"
                        data-testid={`drawer-shift-${s.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-heading font-bold text-white text-sm block">
                              {s.shift_name || "Shift"}
                            </span>
                            <span className="text-xs text-slate-300 font-mono mt-0.5 flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              {formatDate(s.start_time)}
                            </span>
                            <span className="text-xs text-gold font-mono flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {timeStr}
                            </span>
                          </div>

                          <span
                            className={cn(
                              "text-[10px] font-heading font-extrabold px-2 py-0.5 rounded uppercase tracking-wider",
                              s.is_active
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : s.derived_status === "COMPLETED"
                                ? "bg-white/10 text-slate-400"
                                : "bg-gold/15 text-gold border border-gold/30"
                            )}
                          >
                            {s.is_active ? "● ON SHIFT NOW" : s.derived_status}
                          </span>
                        </div>

                        {s.notes && (
                          <p className="text-xs text-slate-400 font-body bg-white/5 rounded p-2 italic">
                            "{s.notes}"
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 3. LOGIN TAB (Mobile portal access) */}
            {activeTab === "login" && (
              <div className="space-y-4">
                {staff.login_username ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-emerald-400" />
                      <h3 className="font-heading text-sm font-bold text-white">
                        Organizer Portal Account Active
                      </h3>
                    </div>
                    <div className="rounded bg-obsidian-950 p-3 border border-white/10">
                      <p className="text-[10px] font-heading font-bold uppercase text-slate-500">
                        Username
                      </p>
                      <p className="font-mono text-sm font-bold text-emerald-400 mt-0.5">
                        {staff.login_username}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 font-body">
                      This staff member can sign into the Organizer Portal on web or the mobile app to view their roster.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-obsidian-900 p-5 text-center space-y-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold mx-auto">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-heading text-sm font-bold text-white">
                        No Login Credential Yet
                      </h3>
                      <p className="text-xs text-slate-400 font-body mt-1">
                        Provision an Organizer Portal credential so {staff.full_name} can log in from their mobile device.
                      </p>
                    </div>
                    {canEdit && (
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => onCreateCredential(staff)}
                        disabled={creatingCredential}
                        className="w-full text-xs font-bold"
                        data-testid="drawer-create-credential-btn"
                      >
                        <KeyRound className="h-3.5 w-3.5 mr-1" />
                        {creatingCredential ? "Provisioning Login…" : "Create Portal Credential"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FOOTER ACTIONS */}
          {canEdit && (
            <div className="border-t border-white/10 bg-obsidian-900/90 p-3.5 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditStaff(staff)}
                className="flex-1 text-xs"
                data-testid="drawer-edit-staff-btn"
              >
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Staff Info
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDeleteStaff(staff.id)}
                className="text-xs"
                data-testid="drawer-delete-staff-btn"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
