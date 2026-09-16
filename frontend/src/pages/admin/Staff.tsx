import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Users,
  Clock,
  Briefcase,
  Shield,
  Plus,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { useModuleAccess } from "@/lib/permissions";

import {
  StaffMember,
  ShiftBlockItem,
  StaffShiftItem,
  StaffDutyItem,
  StaffTaskItem,
  OperationalAreaItem,
  AvailableLocationOption,
} from "./staff/types";
import { StaffDirectoryTab } from "./staff/StaffDirectoryTab";
import { StaffShiftsTab } from "./staff/StaffShiftsTab";
import { ShiftWorkspace } from "./staff/ShiftWorkspace";
import { StaffAssignmentsTab } from "./staff/StaffAssignmentsTab";
import { StaffInchargesTab } from "./staff/StaffInchargesTab";
import {
  MemberFormDialog,
  ShiftBlockDialog,
  ManageShiftStaffModal,
  DutyAssignmentModal,
  TaskAssignmentModal,
  ShiftInchargesModal,
  NewLoginDialog,
} from "./staff/StaffModals";
import { StaffDetailDrawer } from "@/components/admin/StaffDetailDrawer";

export type { ShiftBlockItem };

export default function Staff() {
  const { canEdit } = useModuleAccess("staff");
  const [searchParams, setSearchParams] = useSearchParams();

  // Data states
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shiftBlocks, setShiftBlocks] = useState<ShiftBlockItem[]>([]);
  const [shifts, setShifts] = useState<StaffShiftItem[]>([]);
  const [duties, setDuties] = useState<StaffDutyItem[]>([]);
  const [tasks, setTasks] = useState<StaffTaskItem[]>([]);
  const [dutyTypes, setDutyTypes] = useState<string[]>([]);
  const [staffCategories, setStaffCategories] = useState<string[]>([]);
  const [operationalAreas, setOperationalAreas] = useState<OperationalAreaItem[]>([]);
  const [availableLocations, setAvailableLocations] = useState<AvailableLocationOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Primary 4 tabs: directory | shifts | assignments | incharges
  const tabParam = searchParams.get("tab");
  const activeTab: "directory" | "shifts" | "assignments" | "incharges" =
    tabParam === "shifts" || tabParam === "assignments" || tabParam === "incharges"
      ? tabParam
      : "directory";

  // Active shift workspace
  const [activeShiftWorkspaceId, setActiveShiftWorkspaceId] = useState<number | null>(() => {
    const sId = searchParams.get("shiftId");
    return sId ? Number(sId) : null;
  });

  // Modals state
  const [openMemberModal, setOpenMemberModal] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);

  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [editingShiftBlock, setEditingShiftBlock] = useState<ShiftBlockItem | null>(null);

  const [openManageStaffModal, setOpenManageStaffModal] = useState(false);
  const [managingShiftBlock, setManagingShiftBlock] = useState<ShiftBlockItem | null>(null);

  const [openDutyModal, setOpenDutyModal] = useState(false);
  const [dutyModalStaffId, setDutyModalStaffId] = useState<number | null>(null);
  const [dutyModalShiftId, setDutyModalShiftId] = useState<number | null>(null);
  const [dutyToEdit, setDutyToEdit] = useState<any | null>(null);

  const [openTaskModal, setOpenTaskModal] = useState(false);
  const [taskModalStaffId, setTaskModalStaffId] = useState<number | null>(null);
  const [taskModalShiftId, setTaskModalShiftId] = useState<number | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<any | null>(null);

  const [openInchargesModal, setOpenInchargesModal] = useState(false);
  const [managingInchargesBlock, setManagingInchargesBlock] = useState<ShiftBlockItem | null>(null);

  const [newLogin, setNewLogin] = useState<{ full_name: string; username: string; password: string } | null>(null);
  const [creatingCredentialId, setCreatingCredentialId] = useState<number | null>(null);

  // Drawer state
  const [selectedStaffForDrawer, setSelectedStaffForDrawer] = useState<StaffMember | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Load all central roster and operational data
  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<StaffMember[]>("/staff"),
      api.get<ShiftBlockItem[]>("/staff/shift-blocks"),
      api.get<StaffShiftItem[]>("/staff/shifts"),
      api.get<StaffDutyItem[]>("/staff/duties"),
      api.get<StaffTaskItem[]>("/tasks"),
      api.get<{ duty_types: string[]; staff_categories: string[] }>("/staff/meta"),
      api.get<OperationalAreaItem[]>("/operational-areas"),
      api.get<AvailableLocationOption[]>("/event-locations/available"),
    ])
      .then(([s, sb, sh, d, t, m, oa, avail]) => {
        setStaff(s.data);
        setShiftBlocks(sb.data);
        setShifts(sh.data);
        setDuties(d.data);
        setTasks(t.data);
        setDutyTypes(m.data.duty_types);
        setStaffCategories(m.data.staff_categories);
        setOperationalAreas(oa.data);
        setAvailableLocations(avail.data);
      })
      .catch((err) => {
        console.error("Failed to load staff operations data:", err);
        toast.error(err?.response?.data?.detail ?? "Failed to load staff operations");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Update URL on tab change
  const setTab = (newTab: "directory" | "shifts" | "assignments" | "incharges") => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", newTab);
      if (newTab !== "shifts") {
        p.delete("shiftId");
        setActiveShiftWorkspaceId(null);
      }
      return p;
    });
  };

  // Open Shift Workspace
  const handleOpenShiftWorkspace = (block: ShiftBlockItem) => {
    setActiveShiftWorkspaceId(block.id);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", "shifts");
      p.set("shiftId", String(block.id));
      return p;
    });
  };

  // Close Shift Workspace and return to shifts grid
  const handleCloseShiftWorkspace = () => {
    setActiveShiftWorkspaceId(null);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", "shifts");
      p.delete("shiftId");
      return p;
    });
  };

  // Keep drawer staff in sync
  useEffect(() => {
    if (selectedStaffForDrawer) {
      const updated = staff.find((s) => s.id === selectedStaffForDrawer.id);
      if (updated) setSelectedStaffForDrawer(updated);
    }
  }, [staff]);

  // Active shift block for workspace
  const activeShiftBlock = useMemo(() => {
    if (!activeShiftWorkspaceId) return null;
    return shiftBlocks.find((b) => b.id === activeShiftWorkspaceId) || null;
  }, [shiftBlocks, activeShiftWorkspaceId]);

  // Active on shift count
  const activeNowCount = useMemo(() => {
    return shifts.filter((s) => s.is_active).length;
  }, [shifts]);

  // Delete staff member
  const handleDeleteStaff = async (id: number) => {
    if (!confirm("Delete this staff member? All related duties will be unassigned.")) return;
    try {
      await api.delete(`/staff/${id}`);
      if (selectedStaffForDrawer?.id === id) {
        setDrawerOpen(false);
        setSelectedStaffForDrawer(null);
      }
      toast.success("Staff member deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete staff member");
    }
  };

  // Create portal credential
  const handleCreateCredential = async (s: StaffMember) => {
    setCreatingCredentialId(s.id);
    try {
      const r = await api.post<{ login_username: string; login_password: string }>(
        `/staff/${s.id}/credential`
      );
      setNewLogin({
        full_name: s.full_name,
        username: r.data.login_username,
        password: r.data.login_password,
      });
      toast.success(`Login created for ${s.full_name}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create credential");
    } finally {
      setCreatingCredentialId(null);
    }
  };

  // Delete shift block
  const handleDeleteShiftBlock = async (id: number) => {
    if (!confirm("Delete this shift block? Assigned personnel will be unlinked.")) return;
    try {
      await api.delete(`/staff/shift-blocks/${id}`);
      if (activeShiftWorkspaceId === id) {
        handleCloseShiftWorkspace();
      }
      toast.success("Shift block deleted");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete shift block");
    }
  };

  // Delete duty
  const handleDeleteDuty = async (id: number) => {
    if (!confirm("Remove this duty assignment?")) return;
    try {
      await api.delete(`/staff/duties/${id}`);
      toast.success("Duty assignment removed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not remove duty");
    }
  };

  // Toggle task
  const handleToggleTask = async (task: StaffTaskItem) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );
    try {
      await api.put(`/tasks/${task.id}`, { status: nextStatus });
    } catch {
      toast.error("Could not update task status");
      load();
    }
  };

  // Delete task
  const handleDeleteTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    try {
      await api.delete(`/tasks/${id}`);
      toast.success("Task removed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete task");
    }
  };

  if (loading) {
    return (
      <div className="py-24">
        <Spinner label="Loading Staff Operations hub…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-staff-operations" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            OPERATIONS &amp; WORKFORCE
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Staff Operations
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Unified workforce operations: directory, shift scheduling, cross-shift duty &amp; task control, and leadership coverage.
          </p>
        </div>

        {/* TOP QUICK ACTION BUTTONS */}
        {canEdit && !activeShiftBlock && (
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === "directory" && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  setEditingMember(null);
                  setOpenMemberModal(true);
                }}
                data-testid="add-staff-header-btn"
                className="text-xs font-black shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Staff Member
              </Button>
            )}
            {activeTab === "shifts" && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  setEditingShiftBlock(null);
                  setOpenShiftModal(true);
                }}
                data-testid="schedule-shift-header-btn"
                className="text-xs font-black shrink-0"
              >
                <Clock className="h-3.5 w-3.5 mr-1" /> Schedule Shift
              </Button>
            )}
            {activeTab === "assignments" && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  setDutyModalStaffId(null);
                  setDutyModalShiftId(null);
                  setDutyToEdit(null);
                  setOpenDutyModal(true);
                }}
                data-testid="assign-duty-header-btn"
                className="text-xs font-black shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Assign Duty
              </Button>
            )}
          </div>
        )}
      </div>

      {/* PRIMARY 4 TABS: Directory | Shifts | Assignments | In-Charges */}
      {!activeShiftBlock && (
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
          {/* 1. DIRECTORY TAB */}
          <button
            type="button"
            onClick={() => setTab("directory")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-heading font-bold transition-colors shrink-0",
              activeTab === "directory"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-staff-directory"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Directory</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.2 text-[10px] font-mono",
                activeTab === "directory"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {staff.length}
            </span>
          </button>

          {/* 2. SHIFTS TAB */}
          <button
            type="button"
            onClick={() => setTab("shifts")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-heading font-bold transition-colors shrink-0",
              activeTab === "shifts"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-staff-shifts"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Shifts</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.2 text-[10px] font-mono",
                activeTab === "shifts"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {shiftBlocks.length}
            </span>
          </button>

          {/* 3. ASSIGNMENTS TAB */}
          <button
            type="button"
            onClick={() => setTab("assignments")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-heading font-bold transition-colors shrink-0",
              activeTab === "assignments"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-staff-assignments"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span>Assignments</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.2 text-[10px] font-mono",
                activeTab === "assignments"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {duties.length + tasks.length}
            </span>
          </button>

          {/* 4. IN-CHARGES TAB */}
          <button
            type="button"
            onClick={() => setTab("incharges")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-heading font-bold transition-colors shrink-0",
              activeTab === "incharges"
                ? "bg-gold text-obsidian font-black shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            data-testid="tab-staff-incharges"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>In-Charges</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.2 text-[10px] font-mono",
                activeTab === "incharges"
                  ? "bg-obsidian/20 text-obsidian font-black"
                  : "bg-white/10 text-slate-300"
              )}
            >
              {operationalAreas.filter((a) => a.is_active).length}
            </span>
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* VIEW RENDERERS                                                     */}
      {/* ------------------------------------------------------------------ */}

      {/* 1. DIRECTORY VIEW */}
      {activeTab === "directory" && !activeShiftBlock && (
        <StaffDirectoryTab
          staff={staff}
          staffCategories={staffCategories}
          activeNowCount={activeNowCount}
          canEdit={canEdit}
          onOpenAdd={() => {
            setEditingMember(null);
            setOpenMemberModal(true);
          }}
          onOpenEdit={(s) => {
            setEditingMember(s);
            setOpenMemberModal(true);
          }}
          onDelete={handleDeleteStaff}
          onOpenDrawer={(s) => {
            setSelectedStaffForDrawer(s);
            setDrawerOpen(true);
          }}
          onCreateCredential={handleCreateCredential}
          creatingCredentialId={creatingCredentialId}
        />
      )}

      {/* 2. SHIFTS VIEW (Cards list OR Active Shift Workspace) */}
      {activeTab === "shifts" && !activeShiftBlock && (
        <StaffShiftsTab
          shiftBlocks={shiftBlocks}
          allDuties={duties}
          canEdit={canEdit}
          onOpenCreateShift={() => {
            setEditingShiftBlock(null);
            setOpenShiftModal(true);
          }}
          onOpenEditShift={(b) => {
            setEditingShiftBlock(b);
            setOpenShiftModal(true);
          }}
          onDeleteShiftBlock={handleDeleteShiftBlock}
          onManageStaff={(b) => {
            setManagingShiftBlock(b);
            setOpenManageStaffModal(true);
          }}
          onOpenShiftWorkspace={handleOpenShiftWorkspace}
        />
      )}

      {/* SHIFT WORKSPACE DETAIL VIEW */}
      {activeShiftBlock && (
        <ShiftWorkspace
          shiftBlock={activeShiftBlock}
          allStaff={staff}
          allDuties={duties}
          allTasks={tasks}
          operationalAreas={operationalAreas}
          availableLocations={availableLocations}
          canEdit={canEdit}
          onBack={handleCloseShiftWorkspace}
          onOpenManageStaff={() => {
            setManagingShiftBlock(activeShiftBlock);
            setOpenManageStaffModal(true);
          }}
          onOpenEditShift={() => {
            setEditingShiftBlock(activeShiftBlock);
            setOpenShiftModal(true);
          }}
          onOpenInchargesModal={() => {
            setManagingInchargesBlock(activeShiftBlock);
            setOpenInchargesModal(true);
          }}
          onAssignDuty={(staffId) => {
            setDutyModalStaffId(staffId ?? null);
            setDutyModalShiftId(activeShiftBlock.id);
            setDutyToEdit(null);
            setOpenDutyModal(true);
          }}
          onEditDuty={(d) => {
            setDutyToEdit(d);
            setOpenDutyModal(true);
          }}
          onDeleteDuty={handleDeleteDuty}
          onAddTask={(staffId) => {
            setTaskModalStaffId(staffId ?? null);
            setTaskModalShiftId(activeShiftBlock.id);
            setTaskToEdit(null);
            setOpenTaskModal(true);
          }}
          onEditTask={(t) => {
            setTaskToEdit(t);
            setOpenTaskModal(true);
          }}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {/* 3. ASSIGNMENTS VIEW (Cross-Shift Control Board) */}
      {activeTab === "assignments" && !activeShiftBlock && (
        <StaffAssignmentsTab
          duties={duties}
          tasks={tasks}
          allStaff={staff}
          shiftBlocks={shiftBlocks}
          operationalAreas={operationalAreas}
          canEdit={canEdit}
          onOpenAssignDuty={() => {
            setDutyModalStaffId(null);
            setDutyModalShiftId(null);
            setDutyToEdit(null);
            setOpenDutyModal(true);
          }}
          onEditDuty={(d) => {
            setDutyToEdit(d);
            setOpenDutyModal(true);
          }}
          onDeleteDuty={handleDeleteDuty}
          onOpenAddTask={() => {
            setTaskModalStaffId(null);
            setTaskModalShiftId(null);
            setTaskToEdit(null);
            setOpenTaskModal(true);
          }}
          onEditTask={(t) => {
            setTaskToEdit(t);
            setOpenTaskModal(true);
          }}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {/* 4. IN-CHARGES VIEW (Event-Wide Leadership Coverage) */}
      {activeTab === "incharges" && !activeShiftBlock && (
        <StaffInchargesTab
          shiftBlocks={shiftBlocks}
          operationalAreas={operationalAreas}
          canEdit={canEdit}
          onOpenManageIncharges={(b) => {
            setManagingInchargesBlock(b);
            setOpenInchargesModal(true);
          }}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODALS & DRAWERS (Single-purpose, reused)                          */}
      {/* ------------------------------------------------------------------ */}

      {/* 1. Add / Edit Staff Member Modal */}
      <MemberFormDialog
        open={openMemberModal}
        onClose={() => setOpenMemberModal(false)}
        staffMember={editingMember}
        staffCategories={staffCategories}
        onSuccess={load}
      />

      {/* 2. Schedule / Edit Shift Block Modal */}
      <ShiftBlockDialog
        open={openShiftModal}
        onClose={() => setOpenShiftModal(false)}
        shiftBlock={editingShiftBlock}
        onSuccess={load}
      />

      {/* 3. Manage Shift Staff Roster Modal */}
      <ManageShiftStaffModal
        open={openManageStaffModal}
        onClose={() => setOpenManageStaffModal(false)}
        shiftBlock={managingShiftBlock}
        allStaff={staff}
        allShiftBlocks={shiftBlocks}
        onSuccess={load}
      />

      {/* 4. Assign / Edit Operational Duty Modal */}
      <DutyAssignmentModal
        open={openDutyModal}
        onClose={() => setOpenDutyModal(false)}
        staffId={dutyModalStaffId}
        shiftId={dutyModalShiftId}
        dutyToEdit={dutyToEdit}
        allStaff={staff}
        allShiftBlocks={shiftBlocks}
        operationalAreas={operationalAreas}
        availableLocations={availableLocations}
        dutyTypes={dutyTypes}
        onSuccess={load}
      />

      {/* 5. Assign / Edit Operational Task Modal */}
      <TaskAssignmentModal
        open={openTaskModal}
        onClose={() => setOpenTaskModal(false)}
        staffId={taskModalStaffId}
        shiftId={taskModalShiftId}
        taskToEdit={taskToEdit}
        allStaff={staff}
        allShiftBlocks={shiftBlocks}
        onSuccess={load}
      />

      {/* 6. Shift In-Charges Modal */}
      <ShiftInchargesModal
        open={openInchargesModal}
        onClose={() => setOpenInchargesModal(false)}
        shiftBlock={managingInchargesBlock}
        operationalAreas={operationalAreas}
        onSuccess={load}
      />

      {/* 7. New Login Credentials Display Dialog */}
      <NewLoginDialog
        login={newLogin}
        onClose={() => setNewLogin(null)}
      />

      {/* 8. Staff Detail Drawer */}
      <StaffDetailDrawer
        staff={selectedStaffForDrawer}
        shifts={shifts}
        duties={duties}
        tasks={tasks}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canEdit={canEdit}
        onEditStaff={(s) => {
          setDrawerOpen(false);
          setEditingMember(s);
          setOpenMemberModal(true);
        }}
        onDeleteStaff={handleDeleteStaff}
        onCreateCredential={handleCreateCredential}
        creatingCredential={creatingCredentialId === selectedStaffForDrawer?.id}
      />
    </div>
  );
}
