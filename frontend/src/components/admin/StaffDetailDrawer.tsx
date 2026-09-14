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
  Plus,
  Square,
  Check,
  User,
  ShieldAlert,
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

export interface StaffDutyItem {
  id: number;
  staff_id: number;
  staff_name?: string;
  room_id: number;
  room_name?: string;
  floor_name?: string;
  building_name?: string;
  duty_type: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
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
  due_date?: string | null;
}

interface StaffDetailDrawerProps {
  staff: StaffDetailMember | null;
  duties: StaffDutyItem[];
  tasks: StaffTaskItem[];
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onEditStaff: (staff: StaffDetailMember) => void;
  onDeleteStaff: (id: number) => void;
  onCreateCredential: (staff: StaffDetailMember) => void;
  onDeleteDuty?: (id: number) => void;
  onToggleTask?: (task: StaffTaskItem) => void;
  creatingCredential?: boolean;
}

export function StaffDetailDrawer({
  staff,
  duties,
  tasks,
  open,
  onClose,
  canEdit,
  onEditStaff,
  onDeleteStaff,
  onCreateCredential,
  onDeleteDuty,
  onToggleTask,
  creatingCredential = false,
}: StaffDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "duties" | "tasks" | "login">("overview");

  if (!open || !staff) return null;

  const staffDuties = duties.filter((d) => d.staff_id === staff.id);
  const staffTasks = tasks.filter((t) => t.assigned_staff_id === staff.id);
  const pendingTasks = staffTasks.filter((t) => t.status !== "completed");

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

            {/* TAB NAVIGATION */}
            <div className="mt-4 flex gap-1 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-heading font-bold transition-colors",
                  activeTab === "overview"
                    ? "bg-gold text-obsidian font-black shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("duties")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-heading font-bold transition-colors flex items-center justify-center gap-1",
                  activeTab === "duties"
                    ? "bg-gold text-obsidian font-black shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <span>Duties</span>
                <span className={cn("rounded-full px-1.5 py-0.2 text-[10px] font-mono", activeTab === "duties" ? "bg-obsidian/20 text-obsidian font-black" : "bg-white/10 text-slate-300")}>
                  {staffDuties.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tasks")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-heading font-bold transition-colors flex items-center justify-center gap-1",
                  activeTab === "tasks"
                    ? "bg-gold text-obsidian font-black shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <span>Tasks</span>
                <span className={cn("rounded-full px-1.5 py-0.2 text-[10px] font-mono", activeTab === "tasks" ? "bg-obsidian/20 text-obsidian font-black" : "bg-white/10 text-slate-300")}>
                  {staffTasks.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("login")}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-heading font-bold transition-colors flex items-center justify-center gap-1",
                  activeTab === "login"
                    ? "bg-gold text-obsidian font-black shadow-sm"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <KeyRound className="h-3 w-3" />
                <span>Login</span>
              </button>
            </div>
          </div>

          {/* TAB CONTENT BODY */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* METRICS ROW */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-white/10 bg-obsidian-900 p-2.5">
                    <p className="text-[10px] font-heading font-extrabold uppercase text-slate-400">Duties</p>
                    <p className="font-heading text-lg font-black text-white mt-0.5">{staffDuties.length}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-obsidian-900 p-2.5">
                    <p className="text-[10px] font-heading font-extrabold uppercase text-slate-400">Open Tasks</p>
                    <p className="font-heading text-lg font-black text-gold mt-0.5">{pendingTasks.length}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-obsidian-900 p-2.5">
                    <p className="text-[10px] font-heading font-extrabold uppercase text-slate-400">Login</p>
                    <p className="font-heading text-xs font-black text-emerald-400 mt-1 truncate">
                      {staff.login_username ? "ACTIVE" : "NONE"}
                    </p>
                  </div>
                </div>

                {/* NOTES */}
                <div className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
                  <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                    Operational Notes
                  </p>
                  <p className="text-xs text-slate-200 font-body leading-relaxed">
                    {staff.notes || "No additional notes provided for this staff member."}
                  </p>
                </div>

                {/* QUICK SUMMARY OF DUTIES */}
                <div className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <HardHat className="h-3 w-3 text-gold" /> Active Duty Allotments
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("duties")}
                      className="text-[11px] font-bold text-gold hover:underline"
                    >
                      View All ({staffDuties.length})
                    </button>
                  </div>
                  {staffDuties.length === 0 ? (
                    <p className="text-xs text-slate-500 py-1">No duties allotted yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {staffDuties.slice(0, 3).map((d) => (
                        <div key={d.id} className="rounded bg-white/5 p-2 text-xs flex items-center justify-between">
                          <div>
                            <span className="font-heading font-bold text-white">{d.duty_type}</span>
                            <span className="text-slate-400 block text-[11px]">
                              {d.room_name || "Room"} {d.building_name ? `· ${d.building_name}` : ""}
                            </span>
                          </div>
                          {d.start_time && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatDate(d.start_time)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* QUICK SUMMARY OF TASKS */}
                <div className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <CheckSquare className="h-3 w-3 text-gold" /> Assigned Tasks
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("tasks")}
                      className="text-[11px] font-bold text-gold hover:underline"
                    >
                      View All ({staffTasks.length})
                    </button>
                  </div>
                  {staffTasks.length === 0 ? (
                    <p className="text-xs text-slate-500 py-1">No tasks assigned to this person.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {staffTasks.slice(0, 3).map((t) => (
                        <div key={t.id} className="rounded bg-white/5 p-2 text-xs flex items-center justify-between">
                          <span className={cn("font-medium", t.status === "completed" ? "line-through text-slate-500" : "text-white")}>
                            {t.title}
                          </span>
                          <Badge tone={t.status === "completed" ? "green" : "neutral"} size="sm">
                            {t.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DUTIES TAB */}
            {activeTab === "duties" && (
              <div className="space-y-3">
                {staffDuties.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-8 text-center space-y-2">
                    <HardHat className="h-8 w-8 text-slate-500 mx-auto" />
                    <p className="font-heading text-sm font-bold text-white">No Duty Assignments</p>
                    <p className="text-xs text-slate-400 font-body">
                      Assign this staff member to rooms or tournament posts from the Staff Duties page.
                    </p>
                  </div>
                ) : (
                  staffDuties.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-white/10 bg-obsidian-900 p-3.5 space-y-2"
                      data-testid={`drawer-duty-${d.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-heading font-bold text-white text-sm">
                              {d.duty_type}
                            </span>
                            <Badge tone="gold" size="sm">
                              {d.room_name || "Assigned Area"}
                            </Badge>
                          </div>
                          {(d.building_name || d.floor_name) && (
                            <p className="text-xs text-slate-400 font-body mt-0.5 flex items-center gap-1">
                              <Building className="h-3 w-3 text-slate-500" />
                              {d.building_name} {d.floor_name ? `· ${d.floor_name}` : ""}
                            </p>
                          )}
                        </div>
                        {canEdit && onDeleteDuty && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDeleteDuty(d.id)}
                            title="Remove Duty"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        )}
                      </div>

                      <div className="border-t border-white/5 pt-2 text-[11px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-500" />
                        {d.start_time ? formatDate(d.start_time) : "No start time"}
                        {d.end_time ? ` → ${formatDate(d.end_time)}` : ""}
                      </div>

                      {d.notes && (
                        <p className="text-xs text-slate-300 font-body border-t border-white/5 pt-1.5 italic">
                          "{d.notes}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TASKS TAB */}
            {activeTab === "tasks" && (
              <div className="space-y-3">
                {staffTasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-8 text-center space-y-2">
                    <CheckSquare className="h-8 w-8 text-slate-500 mx-auto" />
                    <p className="font-heading text-sm font-bold text-white">No Tasks Assigned</p>
                    <p className="text-xs text-slate-400 font-body">
                      Assign operational tasks to {staff.full_name} from the Tasks page.
                    </p>
                  </div>
                ) : (
                  staffTasks.map((t) => {
                    const done = t.status === "completed";
                    return (
                      <div
                        key={t.id}
                        className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-obsidian-900 p-3.5"
                        data-testid={`drawer-task-${t.id}`}
                      >
                        {onToggleTask && (
                          <button
                            type="button"
                            onClick={() => onToggleTask(t)}
                            className="mt-0.5 shrink-0 text-gold hover:text-gold-400"
                            title={done ? "Mark pending" : "Mark done"}
                          >
                            {done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-slate-500" />}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-xs font-body font-bold", done ? "text-slate-500 line-through" : "text-white")}>
                            {t.title}
                          </p>
                          {t.description && (
                            <p className="text-[11px] text-slate-400 font-body mt-0.5">{t.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-medium text-slate-300">
                              {t.category}
                            </span>
                            {t.priority && (
                              <Badge tone={t.priority === "high" ? "coral" : "neutral"} size="sm">
                                {t.priority.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* LOGIN TAB */}
            {activeTab === "login" && (
              <div className="space-y-4">
                {staff.login_username ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-emerald-400" />
                      <h3 className="font-heading text-sm font-bold text-white">Organizer Portal Account Active</h3>
                    </div>
                    <div className="rounded bg-obsidian-950 p-3 border border-white/10">
                      <p className="text-[10px] font-heading font-bold uppercase text-slate-500">Username</p>
                      <p className="font-mono text-sm font-bold text-emerald-400 mt-0.5">
                        {staff.login_username}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 font-body">
                      This staff member can sign into the Organizer Portal on web or the Android app. Permissions and password resets can be managed in the Accounts module.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-obsidian-900 p-5 text-center space-y-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold mx-auto">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-heading text-sm font-bold text-white">No Login Credential Yet</h3>
                      <p className="text-xs text-slate-400 font-body mt-1">
                        Create a one-click Organizer Portal login so {staff.full_name} can view duty rosters and log live operations on their mobile phone.
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
                        <KeyRound className="h-3.5 w-3.5" />
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
                <Pencil className="h-3.5 w-3.5" /> Edit Staff Info
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDeleteStaff(staff.id)}
                className="text-xs"
                data-testid="drawer-delete-staff-btn"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
