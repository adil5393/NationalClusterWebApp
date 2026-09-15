import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  HardHat,
  Search,
  KeyRound,
  Eye,
  CheckSquare,
  Phone,
  Mail,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Clock,
  Calendar,
  MapPin,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatOverflowMinutes } from "@/lib/meta";
import { useModuleAccess } from "@/lib/permissions";
import { StaffSelector, MultiStaffSelector, StaffOption } from "@/components/admin/StaffSelector";
import {
  StaffDetailDrawer,
  StaffDetailMember,
  StaffShiftItem,
  StaffDutyItem,
  StaffTaskItem,
} from "@/components/admin/StaffDetailDrawer";
import { EventLocationItem, OperationalAreaItem } from "@/pages/admin/Duties";

export interface ShiftBlockItem {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  status: string;
  derived_status: string;
  is_active: boolean;
  notes?: string | null;
  staff_count: number;
  staff_assignments?: (StaffShiftItem & {
    duties?: {
      id: number;
      duty_type: string;
      start_time?: string;
      end_time?: string;
      location_name?: string;
      room_name?: string;
      notes?: string;
      warning?: string | null;
      outside_shift_minutes?: number | null;
    }[];
    tasks?: {
      id: number;
      title: string;
      status: string;
      priority?: string;
      due_date?: string;
    }[];
  })[];
  // WHO leads WHICH Operational Area for this ShiftBlock — see
  // models.ShiftOperationalIncharge. Grouped by area already, server-side.
  incharges?: {
    operational_area_id: number;
    operational_area_name: string | null;
    operational_area_code: string | null;
    staff: { id: number; full_name: string }[];
  }[];
  created_at?: string;
  updated_at?: string;
}

interface StaffMember {
  id: number;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
  notes?: string | null;
  login_username?: string | null;
}

const emptyMember = { full_name: "", phone: "", email: "", category: "", notes: "" };
const emptyShiftBlock = {
  name: "",
  date: "",
  end_date: "",
  start_time: "08:00",
  end_time: "14:00",
  notes: "",
};

export default function Staff() {
  const { canEdit } = useModuleAccess("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shiftBlocks, setShiftBlocks] = useState<ShiftBlockItem[]>([]);
  const [shifts, setShifts] = useState<StaffShiftItem[]>([]);
  const [duties, setDuties] = useState<StaffDutyItem[]>([]);
  const [tasks, setTasks] = useState<StaffTaskItem[]>([]);
  const [staffCategories, setStaffCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [loginFilter, setLoginFilter] = useState<"ALL" | "HAS_LOGIN" | "NO_LOGIN">("ALL");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Tab switch between Personnel Directory and Shift Blocks
  const [viewTab, setViewTab] = useState<"staff" | "shifts">("staff");

  // Modals & Drawer State
  const [memberForm, setMemberForm] = useState(emptyMember);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openFormDialog, setOpenFormDialog] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Shift Block Modal State
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [shiftBlockForm, setShiftBlockForm] = useState(emptyShiftBlock);
  const [editingShiftBlockId, setEditingShiftBlockId] = useState<number | null>(null);
  const [expandedShiftBlockId, setExpandedShiftBlockId] = useState<number | null>(null);

  // Credential creation popup
  const [newLogin, setNewLogin] = useState<{ full_name: string; username: string; password: string } | null>(null);
  const [creatingCredentialId, setCreatingCredentialId] = useState<number | null>(null);

  // Manage Staff Modal State (dedicated staffing workflow)
  const [openManageStaffModal, setOpenManageStaffModal] = useState(false);
  const [managingShiftBlock, setManagingShiftBlock] = useState<ShiftBlockItem | null>(null);
  const [managingStaffIds, setManagingStaffIds] = useState<number[]>([]);
  const [savingStaffAssignments, setSavingStaffAssignments] = useState(false);
  const [copyFromShiftId, setCopyFromShiftId] = useState<string>("");

  // Operational locations & duty types
  const [locations, setLocations] = useState<EventLocationItem[]>([]);
  const [dutyTypes, setDutyTypes] = useState<string[]>([]);
  const [operationalAreas, setOperationalAreas] = useState<OperationalAreaItem[]>([]);

  // Contextual Duty Modal State (from ShiftBlock view)
  const [openContextDutyModal, setOpenContextDutyModal] = useState(false);
  const [contextDutyStaff, setContextDutyStaff] = useState<{ id: number; name: string } | null>(null);
  const [contextDutyShift, setContextDutyShift] = useState<{ id: number; name: string; start_time: string; end_time: string } | null>(null);
  const [contextDutyForm, setContextDutyForm] = useState({
    operational_area_id: "",
    duty_type: "",
    location_id: "",
    start_time: "",
    end_time: "",
    notes: "",
  });

  // Manage In-Charges Modal State (from ShiftBlock view) — see
  // models.ShiftOperationalIncharge: WHO leads WHICH Operational Area for
  // this one ShiftBlock. Only staff already on this block's own roster are
  // eligible (enforced server-side too).
  const [openInchargesModal, setOpenInchargesModal] = useState(false);
  const [managingInchargesBlock, setManagingInchargesBlock] = useState<ShiftBlockItem | null>(null);
  const [inchargesForm, setInchargesForm] = useState<Record<number, number[]>>({});
  const [savingIncharges, setSavingIncharges] = useState(false);

  // Contextual Task Modal State (from ShiftBlock view)
  const [openContextTaskModal, setOpenContextTaskModal] = useState(false);
  const [contextTaskStaff, setContextTaskStaff] = useState<{ id: number; name: string } | null>(null);
  const [contextTaskShift, setContextTaskShift] = useState<{ id: number; name: string } | null>(null);
  const [contextTaskForm, setContextTaskForm] = useState({
    title: "",
    category: "Operations",
    priority: "medium",
    due_date: "",
    description: "",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<StaffMember[]>("/staff"),
      api.get<ShiftBlockItem[]>("/staff/shift-blocks"),
      api.get<StaffShiftItem[]>("/staff/shifts"),
      api.get<StaffDutyItem[]>("/staff/duties"),
      api.get<StaffTaskItem[]>("/tasks"),
      api.get<{ duty_types: string[]; staff_categories: string[] }>("/staff/meta"),
      api.get<EventLocationItem[]>("/event-locations"),
      api.get<OperationalAreaItem[]>("/operational-areas"),
    ])
      .then(([s, sb, sh, d, t, m, l, oa]) => {
        setStaff(s.data);
        setShiftBlocks(sb.data);
        setShifts(sh.data);
        setDuties(d.data);
        setTasks(t.data);
        setDutyTypes(m.data.duty_types);
        setStaffCategories(m.data.staff_categories);
        setLocations(l.data);
        setOperationalAreas(oa.data);
      })
      .catch((err) => {
        console.error("Failed to load staff roster data:", err);
        toast.error(err?.response?.data?.detail ?? "Failed to load staff roster");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Compute duty count map and task count map for O(1) lookups
  const dutyCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of duties) {
      map.set(d.staff_id, (map.get(d.staff_id) || 0) + 1);
    }
    return map;
  }, [duties]);

  const taskCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const t of tasks) {
      if (t.assigned_staff_id) {
        map.set(t.assigned_staff_id, (map.get(t.assigned_staff_id) || 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  const shiftCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of shifts) {
      map.set(s.staff_id, (map.get(s.staff_id) || 0) + 1);
    }
    return map;
  }, [shifts]);

  const activeShiftMap = useMemo(() => {
    const map = new Map<number, StaffShiftItem>();
    for (const s of shifts) {
      if (s.is_active) {
        map.set(s.staff_id, s);
      }
    }
    return map;
  }, [shifts]);

  // Filtered staff members
  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      const matchesSearch =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === "ALL" || (s.category || "").toLowerCase() === selectedCategory.toLowerCase();

      const matchesLogin =
        loginFilter === "ALL" ||
        (loginFilter === "HAS_LOGIN" && Boolean(s.login_username)) ||
        (loginFilter === "NO_LOGIN" && !s.login_username);

      return matchesSearch && matchesCat && matchesLogin;
    });
  }, [staff, search, selectedCategory, loginFilter]);

  // Pagination
  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, loginFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const pagedStaff = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredStaff.slice(start, start + PAGE_SIZE);
  }, [filteredStaff, page]);

  // Keep drawer staff in sync if list updates
  useEffect(() => {
    if (selectedStaff) {
      const updated = staff.find((s) => s.id === selectedStaff.id);
      if (updated) setSelectedStaff(updated);
    }
  }, [staff]);

  const openCreateDialog = () => {
    setEditingId(null);
    setMemberForm(emptyMember);
    setOpenFormDialog(true);
  };

  const openEditDialog = (s: StaffMember) => {
    setEditingId(s.id);
    setMemberForm({
      full_name: s.full_name,
      phone: s.phone ?? "",
      email: s.email ?? "",
      category: s.category ?? "",
      notes: s.notes ?? "",
    });
    setOpenFormDialog(true);
  };

  const saveMember = async () => {
    if (!memberForm.full_name.trim()) return toast.error("Staff name required");
    const payload = {
      full_name: memberForm.full_name.trim(),
      phone: memberForm.phone.trim() || null,
      email: memberForm.email.trim() || null,
      category: memberForm.category.trim() || null,
      notes: memberForm.notes.trim() || null,
    };
    try {
      if (editingId) {
        await api.put(`/staff/${editingId}`, payload);
        toast.success("Staff member updated");
      } else {
        await api.post("/staff", payload);
        toast.success("Staff member added to directory");
      }
      setOpenFormDialog(false);
      setMemberForm(emptyMember);
      setEditingId(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save staff member");
    }
  };

  const delMember = async (id: number) => {
    if (!confirm("Delete this staff member? Duty assignments will be removed too.")) return;
    try {
      await api.delete(`/staff/${id}`);
      if (selectedStaff?.id === id) {
        setDrawerOpen(false);
        setSelectedStaff(null);
      }
      toast.success("Staff member removed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete staff member");
    }
  };

  const createCredential = async (s: StaffMember) => {
    setCreatingCredentialId(s.id);
    try {
      const r = await api.post<{ login_username: string; login_password: string }>(`/staff/${s.id}/credential`);
      setNewLogin({ full_name: s.full_name, username: r.data.login_username, password: r.data.login_password });
      toast.success(`Login created for ${s.full_name}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create credential");
    } finally {
      setCreatingCredentialId(null);
    }
  };

  const handleOpenDrawer = (s: StaffMember) => {
    setSelectedStaff(s);
    setDrawerOpen(true);
  };

  const handleToggleTask = async (task: StaffTaskItem) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await api.put(`/tasks/${task.id}`, { status: nextStatus });
    } catch {
      toast.error("Could not update task status");
      load();
    }
  };

  const handleDeleteDuty = async (dutyId: number) => {
    if (!confirm("Remove this duty allotment?")) return;
    try {
      await api.delete(`/staff/duties/${dutyId}`);
      toast.success("Duty removed");
      load();
    } catch {
      toast.error("Could not remove duty");
    }
  };

  const handleDeleteShiftBlock = async (blockId: number) => {
    if (!confirm("Delete this shift block? Assigned staff will be unlinked, but duties and tasks will be preserved.")) return;
    try {
      await api.delete(`/staff/shift-blocks/${blockId}`);
      toast.success("Shift block removed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete shift block");
    }
  };

  const handleDeleteShift = async (shiftId: number) => {
    if (!confirm("Remove this staff shift assignment?")) return;
    try {
      await api.delete(`/staff/shifts/${shiftId}`);
      toast.success("Shift assignment removed");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not remove shift assignment");
    }
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  const formatShiftDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoStr;
    }
  };

  const formatShiftTime = (isoStr?: string | null) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return isoStr;
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return isoStr || "";
    }
  };

  const getShiftDuration = (startIso: string, endIso: string) => {
    try {
      const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
      if (diffMs <= 0) return "";
      const totalMins = Math.round(diffMs / 60000);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
      if (hrs > 0) return `${hrs}h`;
      return `${mins}m`;
    } catch {
      return "";
    }
  };

  const openCreateShiftDialog = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    setEditingShiftBlockId(null);
    setShiftBlockForm({
      name: "",
      date: todayStr,
      end_date: todayStr,
      start_time: "08:00",
      end_time: "14:00",
      notes: "",
    });
    setOpenShiftDialog(true);
  };

  const openEditShiftDialog = (b: ShiftBlockItem) => {
    const sDate = new Date(b.start_time);
    const eDate = new Date(b.end_time);
    const sDateStr = `${sDate.getFullYear()}-${pad(sDate.getMonth() + 1)}-${pad(sDate.getDate())}`;
    const eDateStr = `${eDate.getFullYear()}-${pad(eDate.getMonth() + 1)}-${pad(eDate.getDate())}`;
    const sTimeStr = `${pad(sDate.getHours())}:${pad(sDate.getMinutes())}`;
    const eTimeStr = `${pad(eDate.getHours())}:${pad(eDate.getMinutes())}`;

    setEditingShiftBlockId(b.id);
    setShiftBlockForm({
      name: b.name,
      date: sDateStr,
      end_date: eDateStr,
      start_time: sTimeStr,
      end_time: eTimeStr,
      notes: b.notes || "",
    });
    setOpenShiftDialog(true);
  };

  const saveShiftBlock = async () => {
    if (!shiftBlockForm.name.trim()) return toast.error("Shift block name required");
    if (!shiftBlockForm.date) return toast.error("Please select a start date");
    if (!shiftBlockForm.start_time || !shiftBlockForm.end_time) return toast.error("Start and end time required");

    const effectiveEndDate = shiftBlockForm.end_date || shiftBlockForm.date;
    const startObj = new Date(`${shiftBlockForm.date}T${shiftBlockForm.start_time}`);
    const endObj = new Date(`${effectiveEndDate}T${shiftBlockForm.end_time}`);

    if (Number.isNaN(startObj.getTime()) || Number.isNaN(endObj.getTime())) {
      return toast.error("Invalid date or time entered");
    }

    if (endObj <= startObj) {
      return toast.error("Shift end date & time must be strictly after start date & time");
    }

    const startIso = startObj.toISOString();
    const endIso = endObj.toISOString();

    try {
      if (editingShiftBlockId) {
        await api.put(`/staff/shift-blocks/${editingShiftBlockId}`, {
          name: shiftBlockForm.name.trim(),
          start_time: startIso,
          end_time: endIso,
          notes: shiftBlockForm.notes.trim() || null,
        });
        toast.success("Shift block updated successfully");
      } else {
        await api.post("/staff/shift-blocks", {
          name: shiftBlockForm.name.trim(),
          start_time: startIso,
          end_time: endIso,
          notes: shiftBlockForm.notes.trim() || null,
          status: "SCHEDULED",
        });
        toast.success("Shift block created successfully");
      }
      setOpenShiftDialog(false);
      setShiftBlockForm(emptyShiftBlock);
      setEditingShiftBlockId(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save shift block");
    }
  };

  const openManageStaffDialog = (block: ShiftBlockItem) => {
    setManagingShiftBlock(block);
    const currentIds = (block.staff_assignments || []).map((a) => a.staff_id);
    setManagingStaffIds(currentIds);
    setCopyFromShiftId("");
    setOpenManageStaffModal(true);
  };

  const handleCopyStaffFrom = (sourceBlockIdStr: string) => {
    setCopyFromShiftId(sourceBlockIdStr);
    if (!sourceBlockIdStr) return;
    const sourceBlock = shiftBlocks.find((b) => b.id === Number(sourceBlockIdStr));
    if (sourceBlock && sourceBlock.staff_assignments) {
      const copiedIds = sourceBlock.staff_assignments.map((a) => a.staff_id);
      setManagingStaffIds(copiedIds);
      toast.info(
        `Copied ${copiedIds.length} staff member(s) from "${sourceBlock.name}". Review selection and click Save.`
      );
    }
  };

  const saveStaffAssignments = async () => {
    if (!managingShiftBlock) return;
    setSavingStaffAssignments(true);
    try {
      await api.put(`/staff/shift-blocks/${managingShiftBlock.id}/staff`, {
        staff_ids: managingStaffIds,
      });
      toast.success("Staff assignments updated successfully");
      setOpenManageStaffModal(false);
      setManagingShiftBlock(null);
      load();
    } catch (e: any) {
      // Keep modal open so organizer can review or correct the selection (e.g. on 409 conflict)
      toast.error(e?.response?.data?.detail ?? "Could not update staff assignments");
    } finally {
      setSavingStaffAssignments(false);
    }
  };

  // Only staff already on this ShiftBlock's own roster are eligible to lead
  // it (enforced server-side too) — never the whole staff directory.
  const eligibleInchargeStaff: StaffOption[] = useMemo(() => {
    return (managingInchargesBlock?.staff_assignments || []).map((a) => ({
      id: a.staff_id,
      full_name: a.staff_name || `Staff #${a.staff_id}`,
      category: a.staff_category || null,
      phone: a.staff_phone || null,
    }));
  }, [managingInchargesBlock]);

  const openInchargesDialog = (block: ShiftBlockItem) => {
    const initial: Record<number, number[]> = {};
    for (const g of block.incharges || []) {
      initial[g.operational_area_id] = g.staff.map((s) => s.id);
    }
    setManagingInchargesBlock(block);
    setInchargesForm(initial);
    setOpenInchargesModal(true);
  };

  const toggleInchargeStaff = (areaId: number, staffIds: number[]) => {
    setInchargesForm((prev) => ({ ...prev, [areaId]: staffIds }));
  };

  const saveIncharges = async () => {
    if (!managingInchargesBlock) return;
    setSavingIncharges(true);
    try {
      // Send every active area, plus any area already carrying in-charges
      // (even if since deactivated) so this save never silently wipes an
      // area the dialog doesn't show a selector for.
      const areaIds = new Set<number>([
        ...activeOperationalAreas.map((a) => a.id),
        ...Object.keys(inchargesForm).map(Number),
      ]);
      const payload = Array.from(areaIds).map((areaId) => ({
        operational_area_id: areaId,
        staff_ids: inchargesForm[areaId] || [],
      }));
      await api.put(`/staff/shift-blocks/${managingInchargesBlock.id}/incharges`, payload);
      toast.success("In-charges updated");
      setOpenInchargesModal(false);
      setManagingInchargesBlock(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update in-charges");
    } finally {
      setSavingIncharges(false);
    }
  };

  const toLocalIso = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  };

  const activeLocations = useMemo(() => {
    return locations.filter((l) => l.is_active);
  }, [locations]);

  const activeOperationalAreas = useMemo(() => {
    return operationalAreas.filter((a) => a.is_active);
  }, [operationalAreas]);

  const handleOpenContextDuty = (block: ShiftBlockItem, assignment: any) => {
    setContextDutyStaff({ id: assignment.staff_id, name: assignment.staff_name || `Staff #${assignment.staff_id}` });
    setContextDutyShift({ id: assignment.id, name: block.name, start_time: block.start_time, end_time: block.end_time });
    setContextDutyForm({
      operational_area_id: "",
      duty_type: "",
      location_id: "",
      start_time: toLocalIso(block.start_time),
      end_time: toLocalIso(block.end_time),
      notes: "",
    });
    setOpenContextDutyModal(true);
  };

  const handleOpenContextTask = (block: ShiftBlockItem, assignment: any) => {
    setContextTaskStaff({ id: assignment.staff_id, name: assignment.staff_name || `Staff #${assignment.staff_id}` });
    setContextTaskShift({ id: assignment.id, name: block.name });
    setContextTaskForm({
      title: "",
      category: "Operations",
      priority: "medium",
      due_date: toLocalIso(block.end_time),
      description: "",
    });
    setOpenContextTaskModal(true);
  };

  const saveContextDuty = async () => {
    if (!contextDutyStaff || !contextDutyShift) return;
    if (!contextDutyForm.operational_area_id) return toast.error("Operational area is required");
    if (!contextDutyForm.duty_type.trim()) return toast.error("Specific duty is required");

    let startIso: string | null = null;
    let endIso: string | null = null;
    if (contextDutyForm.start_time) {
      const d = new Date(contextDutyForm.start_time);
      if (!Number.isNaN(d.getTime())) startIso = d.toISOString();
    }
    if (contextDutyForm.end_time) {
      const d = new Date(contextDutyForm.end_time);
      if (!Number.isNaN(d.getTime())) endIso = d.toISOString();
    }

    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      return toast.error("Duty end time must be after start time");
    }

    try {
      const res = await api.post("/staff/duties", {
        staff_id: contextDutyStaff.id,
        shift_id: contextDutyShift.id,
        operational_area_id: Number(contextDutyForm.operational_area_id),
        duty_type: contextDutyForm.duty_type.trim(),
        location_id: contextDutyForm.location_id ? Number(contextDutyForm.location_id) : null,
        start_time: startIso,
        end_time: endIso,
        notes: contextDutyForm.notes.trim() || null,
      });

      if (res.data?.warning) {
        toast.warning(res.data.warning);
      } else {
        toast.success(`Duty assigned to ${contextDutyStaff.name}`);
      }
      setOpenContextDutyModal(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not assign duty");
    }
  };

  const saveContextTask = async () => {
    if (!contextTaskStaff || !contextTaskShift) return;
    if (!contextTaskForm.title.trim()) return toast.error("Task title is required");

    try {
      await api.post("/tasks", {
        title: contextTaskForm.title.trim(),
        category: contextTaskForm.category.trim() || "Operations",
        priority: contextTaskForm.priority,
        assigned_staff_id: contextTaskStaff.id,
        shift_id: contextTaskShift.id,
        due_date: contextTaskForm.due_date ? new Date(contextTaskForm.due_date).toISOString() : null,
        description: contextTaskForm.description.trim() || null,
        status: "pending",
      });

      toast.success(`Task assigned to ${contextTaskStaff.name}`);
      setOpenContextTaskModal(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not assign task");
    }
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading staff personnel directory…" />
      </div>
    );
  }

  const totalLogins = staff.filter((s) => s.login_username).length;
  const activeNowCount = shifts.filter((s) => s.is_active).length;

  return (
    <div data-testid="admin-staff" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            PEOPLE & OPERATIONS DIRECTORY
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Staff Personnel & Shifts
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Manage tournament personnel availability (shifts), responsibilities (duties), action tasks, and mobile portal access.
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCreateShiftDialog()}
              data-testid="schedule-shift-btn"
              className="text-xs font-bold"
            >
              <Clock className="h-3.5 w-3.5 text-gold" /> Schedule Shift
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={openCreateDialog}
              data-testid="add-staff-btn"
              className="text-xs font-extrabold shrink-0"
            >
              <Plus className="h-4 w-4" /> Add Staff Member
            </Button>
          </div>
        )}
      </div>

      {/* TABS: PEOPLE vs SHIFT BLOCKS */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setViewTab("staff")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-heading font-bold transition-colors",
            viewTab === "staff"
              ? "bg-gold text-obsidian font-black shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
          data-testid="tab-staff-directory"
        >
          <Users className="h-3.5 w-3.5" />
          <span>People</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono", viewTab === "staff" ? "bg-obsidian/20 text-obsidian font-black" : "bg-white/10 text-slate-300")}>
            {staff.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setViewTab("shifts")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-heading font-bold transition-colors",
            viewTab === "shifts"
              ? "bg-gold text-obsidian font-black shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
          data-testid="tab-shift-blocks"
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Shift Blocks</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono", viewTab === "shifts" ? "bg-obsidian/20 text-obsidian font-black" : "bg-white/10 text-slate-300")}>
            {shiftBlocks.length}
          </span>
        </button>
      </div>

      {viewTab === "staff" && (
        <>
          {/* PERSONNEL METRICS CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Total Personnel
              </p>
              <p className="font-heading text-xl sm:text-2xl font-black text-white">{staff.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                With Login Access
              </p>
              <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">{totalLogins}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Roles & Categories
              </p>
              <p className="font-heading text-xl sm:text-2xl font-black text-gold">{staffCategories.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                On Shift Right Now
              </p>
              <p className="font-heading text-xl sm:text-2xl font-black text-cyan-400">{activeNowCount}</p>
            </div>
          </div>
          {/* SEARCH AND FILTER BAR */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* SEARCH */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search by name, phone, email, or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="staff-search-input"
            />
          </div>

          {/* CATEGORY SELECT */}
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 text-xs sm:w-48"
          >
            <option value="ALL">All Categories</option>
            {staffCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          {/* LOGIN FILTER */}
          <Select
            value={loginFilter}
            onChange={(e) => setLoginFilter(e.target.value as any)}
            className="h-9 text-xs sm:w-40"
          >
            <option value="ALL">All Accounts</option>
            <option value="HAS_LOGIN">With Login</option>
            <option value="NO_LOGIN">No Login</option>
          </Select>
        </div>

        {/* ACTIVE FILTER PILLS */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] text-slate-400 font-mono">Showing {filteredStaff.length} of {staff.length}</span>
          {selectedCategory !== "ALL" && (
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className="inline-flex items-center gap-1 rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-[10px] font-bold text-gold"
            >
              Category: {selectedCategory} ×
            </button>
          )}
          {loginFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => setLoginFilter("ALL")}
              className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
            >
              Login: {loginFilter === "HAS_LOGIN" ? "With Login" : "No Login"} ×
            </button>
          )}
        </div>
      </div>

      {/* STAFF LIST / DIRECTORY */}
      {staff.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No staff personnel enrolled"
            hint="Add staff members to assign duties, tasks, and mobile portal access."
          />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No matching staff found"
            hint="Try changing your search query or category filters."
          />
        </div>
      ) : (
        <>
          {/* MOBILE: STACKED COMPACT CARDS */}
          <div className="grid gap-2.5 sm:hidden">
            {pagedStaff.map((s) => {
              const dCount = dutyCounts.get(s.id) || 0;
              const tCount = taskCounts.get(s.id) || 0;
              return (
                <div
                  key={s.id}
                  data-testid={`staff-card-${s.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold/15 text-gold font-heading font-black text-xs relative">
                        {s.full_name.slice(0, 1).toUpperCase()}
                        {activeShiftMap.get(s.id) && (
                          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-obsidian animate-pulse" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-heading font-bold text-white text-sm truncate">{s.full_name}</h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {activeShiftMap.get(s.id) && (
                            <span className="rounded bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                              ● ON SHIFT
                            </span>
                          )}
                          {s.category && (
                            <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-semibold text-gold">
                              {s.category}
                            </span>
                          )}
                          {s.phone && <span className="text-[11px] text-slate-400 font-mono">· {s.phone}</span>}
                        </div>
                      </div>
                    </div>

                    <Badge tone={s.login_username ? "green" : "neutral"} size="sm">
                      {s.login_username ? "Login Active" : "No Login"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-slate-400 font-mono">
                    <span>Shifts: <strong className="text-white">{shiftCounts.get(s.id) || 0}</strong></span>
                    <span>Duties: <strong className="text-white">{dCount}</strong></span>
                    <span>Tasks: <strong className="text-white">{tCount}</strong></span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDrawer(s)}
                      className="h-7 text-xs px-2.5"
                    >
                      <Eye className="h-3 w-3" /> View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP & TABLET: CLEAN COMPACT TABLE */}
          <div className="hidden sm:block rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">#</TH>
                  <TH>Personnel</TH>
                  <TH>Category / Role</TH>
                  <TH>Contact Details</TH>
                  <TH className="text-center">Login Access</TH>
                  <TH className="text-center">Shifts</TH>
                  <TH className="text-center">Duties</TH>
                  <TH className="text-center">Tasks</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {pagedStaff.map((s, i) => {
                  const sCount = shiftCounts.get(s.id) || 0;
                  const dCount = dutyCounts.get(s.id) || 0;
                  const tCount = taskCounts.get(s.id) || 0;
                  const activeShift = activeShiftMap.get(s.id);
                  const serial = (page - 1) * PAGE_SIZE + i + 1;
                  return (
                    <TR key={s.id} data-testid={`staff-row-${s.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{serial}</TD>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gold/15 text-gold font-heading font-black text-xs relative">
                            {s.full_name.slice(0, 1).toUpperCase()}
                            {activeShift && (
                              <span
                                className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-obsidian animate-pulse"
                                title="On Shift Right Now"
                              />
                            )}
                          </div>
                          <div>
                            <span className="font-heading font-bold text-white text-xs tracking-wide block">
                              {s.full_name}
                            </span>
                            {activeShift && (
                              <span className="text-[10px] font-mono text-emerald-400 font-bold block">
                                ● On Shift
                              </span>
                            )}
                          </div>
                        </div>
                      </TD>
                      <TD>
                        {s.category ? (
                          <Badge tone="gold" size="sm">
                            {s.category}
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </TD>
                      <TD>
                        <div className="space-y-0.5 text-xs">
                          {s.phone && (
                            <p className="text-slate-300 font-mono text-[11px] flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5 text-gold" /> {s.phone}
                            </p>
                          )}
                          {s.email && (
                            <p className="text-slate-400 text-[11px] flex items-center gap-1">
                              <Mail className="h-2.5 w-2.5 text-slate-500" /> {s.email}
                            </p>
                          )}
                          {!s.phone && !s.email && <span className="text-slate-500 text-xs">—</span>}
                        </div>
                      </TD>
                      <TD className="text-center">
                        {s.login_username ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            <KeyRound className="h-3 w-3" /> @{s.login_username}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">No Login</span>
                        )}
                      </TD>
                      <TD className="text-center font-mono text-xs">
                        <span className={cn("px-2 py-0.5 rounded font-bold", sCount > 0 ? "bg-emerald-500/15 text-emerald-300" : "text-slate-500")}>
                          {sCount}
                        </span>
                      </TD>
                      <TD className="text-center font-mono text-xs">
                        <span className={cn("px-2 py-0.5 rounded font-bold", dCount > 0 ? "bg-gold/15 text-gold" : "text-slate-500")}>
                          {dCount}
                        </span>
                      </TD>
                      <TD className="text-center font-mono text-xs">
                        <span className={cn("px-2 py-0.5 rounded font-bold", tCount > 0 ? "bg-cyan-500/15 text-cyan-300" : "text-slate-500")}>
                          {tCount}
                        </span>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDrawer(s)}
                            data-testid={`view-staff-${s.id}`}
                            className="h-7 text-xs px-2"
                            title="View Staff Profile & Assignments"
                          >
                            <Eye className="h-3 w-3" /> View
                          </Button>
                          {canEdit && (
                            <>
                              {!s.login_username && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => createCredential(s)}
                                  disabled={creatingCredentialId === s.id}
                                  data-testid={`create-credential-${s.id}`}
                                  title="Create Portal Login"
                                >
                                  <KeyRound className="h-3.5 w-3.5 text-gold" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEditDialog(s)}
                                data-testid={`edit-staff-${s.id}`}
                                title="Edit Staff"
                              >
                                <Pencil className="h-3.5 w-3.5 text-slate-300" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => delMember(s.id)}
                                data-testid={`delete-staff-${s.id}`}
                                title="Delete Staff"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400 font-mono">
              <span>
                Page {page} of {totalPages} · {filteredStaff.length} Total Staff
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 text-xs"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* SHIFT BLOCKS VIEW */}
      {viewTab === "shifts" && (
        <div className="space-y-4">
          {/* SHIFT WORKSPACE METRICS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Total Shift Blocks
              </p>
              <p className="font-heading text-xl sm:text-2xl font-black text-white">{shiftBlocks.length}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Active Shifts Now
              </p>
              <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">{activeNowCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                Staff Members Assigned
              </p>
              <p className="font-heading text-xl sm:text-2xl font-black text-gold">{shifts.length}</p>
            </div>
          </div>

          {shiftBlocks.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
              <EmptyState
                title="No Shift Blocks Created"
                hint="Click '+ Schedule Shift' above to create a common workforce shift and assign personnel."
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shiftBlocks.map((block) => {
                const isExpanded = expandedShiftBlockId === block.id;
                const startDateStr = formatShiftDate(block.start_time);
                const endDateStr = formatShiftDate(block.end_time);
                const dateStr = startDateStr === endDateStr ? startDateStr : `${startDateStr} – ${endDateStr}`;
                const duration = getShiftDuration(block.start_time, block.end_time);
                const timeStr = `${formatShiftTime(block.start_time)} – ${formatShiftTime(block.end_time)}${duration ? ` (${duration})` : ""}`;
                const isNow = block.is_active;

                return (
                  <div
                    key={block.id}
                    data-testid={`shift-block-card-${block.id}`}
                    className={cn(
                      "rounded-xl border bg-obsidian-900 p-4 space-y-3 transition-all",
                      isNow
                        ? "border-emerald-500/40 shadow-emerald-500/5 shadow-lg"
                        : "border-white/10"
                    )}
                  >
                    {/* TOP HEADER */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-gold block">
                          WORKFORCE SHIFT
                        </span>
                        <h3 className="font-heading font-black text-white text-base tracking-wide">
                          {block.name}
                        </h3>
                        <p className="text-xs text-slate-300 font-mono mt-0.5 flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>{dateStr}</span>
                          <span className="text-slate-500">·</span>
                          <Clock className="h-3 w-3 text-gold" />
                          <span>{timeStr}</span>
                        </p>
                      </div>

                      <span
                        className={cn(
                          "text-[10px] font-heading font-extrabold px-2 py-0.5 rounded uppercase tracking-wider shrink-0",
                          isNow
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : block.derived_status === "COMPLETED"
                            ? "bg-white/10 text-slate-400"
                            : block.derived_status === "CANCELLED"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-gold/15 text-gold border border-gold/30"
                        )}
                      >
                        {isNow ? "● ON SHIFT" : block.derived_status}
                      </span>
                    </div>

                    {block.notes && (
                      <p className="text-xs text-slate-400 italic bg-white/5 rounded px-2.5 py-1.5 font-body">
                        "{block.notes}"
                      </p>
                    )}

                    {/* ASSIGNED STAFF BADGE & CONTROLS */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3 text-xs gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-slate-300 font-mono">
                        <Users className="h-3.5 w-3.5 text-gold" />
                        <span className="font-bold text-white">
                          {block.staff_count ?? (block.staff_assignments?.length || 0)}
                        </span> Staff Assigned
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {canEdit && (
                          <Button
                            variant={(block.staff_count ?? (block.staff_assignments?.length || 0)) === 0 ? "gold" : "outline"}
                            size="sm"
                            onClick={() => openManageStaffDialog(block)}
                            data-testid={`manage-staff-${block.id}`}
                            className="h-7 text-xs px-2.5 font-bold"
                          >
                            <Users className="h-3 w-3 mr-1" />
                            {(block.staff_count ?? (block.staff_assignments?.length || 0)) === 0 ? "+ Assign Staff" : "Manage Staff"}
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedShiftBlockId(isExpanded ? null : block.id)}
                          data-testid={`toggle-shift-staff-${block.id}`}
                          className="h-7 text-xs px-2.5 font-bold"
                        >
                          {isExpanded ? (
                            <>
                              Hide Staff <ChevronUp className="h-3 w-3 ml-1" />
                            </>
                          ) : (
                            <>
                              View Staff <ChevronDown className="h-3 w-3 ml-1" />
                            </>
                          )}
                        </Button>

                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEditShiftDialog(block)}
                              data-testid={`edit-shift-block-${block.id}`}
                              title="Edit Shift Block"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDeleteShiftBlock(block.id)}
                              data-testid={`delete-shift-block-${block.id}`}
                              title="Delete Shift Block"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* EXPANDED ASSIGNED STAFF LIST */}
                    {isExpanded && (
                      <div className="border-t border-white/10 pt-3 space-y-3">
                        {/* OPERATIONAL AREA IN-CHARGES */}
                        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                              In-Charges
                            </p>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openInchargesDialog(block)}
                                data-testid={`manage-incharges-${block.id}`}
                                className="text-[11px] font-bold text-gold hover:underline flex items-center gap-1"
                              >
                                <Shield className="h-3 w-3" /> Manage In-Charges
                              </button>
                            )}
                          </div>
                          {!block.incharges || block.incharges.length === 0 ? (
                            <p className="text-[11px] text-slate-500 italic">No in-charges assigned yet.</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {block.incharges.map((g) => (
                                <div key={g.operational_area_id} className="text-xs">
                                  <p className="font-heading font-bold text-gold">{g.operational_area_name}</p>
                                  {g.staff.map((s) => (
                                    <p key={s.id} className="text-slate-300 font-body pl-2">
                                      {s.full_name}
                                    </p>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
                            Assigned Staff ({block.staff_assignments?.length || 0})
                          </p>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openManageStaffDialog(block)}
                              className="text-[11px] font-bold text-gold hover:underline flex items-center gap-1"
                            >
                              <Users className="h-3 w-3" /> Edit Staff Roster
                            </button>
                          )}
                        </div>
                        {(!block.staff_assignments || block.staff_assignments.length === 0) ? (
                          <div className="flex flex-col items-center justify-center py-4 text-center space-y-2 bg-white/[0.02] rounded-lg border border-dashed border-white/10">
                            <p className="text-xs text-slate-400 italic">No staff members assigned to this shift yet.</p>
                            {canEdit && (
                              <Button
                                variant="gold"
                                size="sm"
                                onClick={() => openManageStaffDialog(block)}
                                data-testid={`assign-staff-empty-${block.id}`}
                                className="h-7 text-xs px-3 font-bold"
                              >
                                <Plus className="h-3 w-3 mr-1" /> + Assign Staff
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {block.staff_assignments.map((assignment) => (
                              <div
                                key={assignment.id}
                                className="rounded-lg bg-white/5 p-2.5 space-y-2 border border-white/5 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-heading font-bold text-white truncate">
                                      {assignment.staff_name || `Staff #${assignment.staff_id}`}
                                    </span>
                                    {assignment.staff_category && (
                                      <span className="rounded bg-white/10 px-1.5 py-0.2 text-[9px] text-slate-300 font-mono shrink-0">
                                        {assignment.staff_category}
                                      </span>
                                    )}
                                  </div>
                                  {canEdit && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenContextDuty(block, assignment)}
                                        data-testid={`add-duty-shift-${assignment.id}`}
                                        className="h-6 text-[10px] px-2 font-bold text-gold border-gold/30 hover:bg-gold/10"
                                      >
                                        <Plus className="h-2.5 w-2.5 mr-0.5" /> Duty
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenContextTask(block, assignment)}
                                        data-testid={`add-task-shift-${assignment.id}`}
                                        className="h-6 text-[10px] px-2 font-bold text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10"
                                      >
                                        <Plus className="h-2.5 w-2.5 mr-0.5" /> Task
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Operational duties for this staff member — stacked
                                    WHEN / WHAT / WHERE / WARNING so it scans at a
                                    glance instead of one dense punctuation-heavy line */}
                                {assignment.duties && assignment.duties.length > 0 && (
                                  <div className="space-y-1.5 border-t border-white/5 pt-1.5">
                                    {assignment.duties.map((d) => {
                                      const overflow = formatOverflowMinutes(d.outside_shift_minutes);
                                      return (
                                        <div key={d.id} className="flex items-start gap-2 text-[11px]">
                                          <span className="shrink-0 font-mono text-slate-500 pt-0.5 w-[86px]">
                                            {d.start_time && d.end_time ? `${formatShiftTime(d.start_time)}–${formatShiftTime(d.end_time)}` : "All Day"}
                                          </span>
                                          <div className="min-w-0 flex-1 space-y-0.5">
                                            <p className="text-white font-bold font-sans">{d.duty_type}</p>
                                            <p className="text-emerald-400 font-sans flex items-center gap-1">
                                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                                              {d.location_name || d.room_name || "Operational Venue"}
                                            </p>
                                            {d.warning && (
                                              <p className="text-amber-400 font-sans flex items-center gap-1">
                                                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                                Outside shift{overflow ? ` · ${overflow}` : ""}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Operational tasks for this staff member */}
                                {assignment.tasks && assignment.tasks.length > 0 && (
                                  <div className="space-y-1 border-t border-white/5 pt-1.5 font-mono text-[11px]">
                                    {assignment.tasks.map((t) => (
                                      <div key={t.id} className="flex items-center gap-1.5 text-slate-300">
                                        <span className="text-slate-500">○</span>
                                        <span className={t.status === "completed" ? "line-through text-slate-500 font-sans" : "text-white font-sans"}>
                                          {t.title}
                                        </span>
                                        <span className="text-[9px] text-slate-400 uppercase font-mono ml-auto">[{t.priority || "normal"}]</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {(!assignment.duties || assignment.duties.length === 0) && (!assignment.tasks || assignment.tasks.length === 0) && (
                                  <div className="text-[10px] text-slate-500 italic font-mono pt-0.5">
                                    No duties or tasks allotted yet.
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADD / EDIT STAFF DIALOG */}
      <Dialog
        open={openFormDialog}
        onClose={() => setOpenFormDialog(false)}
        title={editingId ? "Edit Staff Member" : "Add Staff Member"}
        testId="staff-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Full Name *</Label>
            <Input
              placeholder="e.g. Ramesh Kumar"
              value={memberForm.full_name}
              onChange={(e) => setMemberForm((m) => ({ ...m, full_name: e.target.value }))}
              data-testid="staff-name-input"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Category / Role</Label>
              <Select
                value={memberForm.category}
                onChange={(e) => setMemberForm((m) => ({ ...m, category: e.target.value }))}
                data-testid="staff-category-select"
              >
                <option value="">Select Category…</option>
                {staffCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input
                placeholder="e.g. 9876543210"
                value={memberForm.phone}
                onChange={(e) => setMemberForm((m) => ({ ...m, phone: e.target.value }))}
                data-testid="staff-phone-input"
              />
            </div>
          </div>

          <div>
            <Label>Email (Optional)</Label>
            <Input
              type="email"
              placeholder="e.g. ramesh@example.com"
              value={memberForm.email}
              onChange={(e) => setMemberForm((m) => ({ ...m, email: e.target.value }))}
            />
          </div>

          <div>
            <Label>Operational Notes</Label>
            <Textarea
              placeholder="Designation, hostel block, shift preference, or special instructions…"
              rows={3}
              value={memberForm.notes}
              onChange={(e) => setMemberForm((m) => ({ ...m, notes: e.target.value }))}
              data-testid="staff-notes-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenFormDialog(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveMember} data-testid="save-staff-btn">
              {editingId ? "Update Staff" : "Save to Directory"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* STAFF DETAIL DRAWER */}
      <StaffDetailDrawer
        staff={selectedStaff}
        shifts={shifts}
        duties={duties}
        tasks={tasks}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canEdit={canEdit}
        onEditStaff={(s) => {
          setDrawerOpen(false);
          openEditDialog(s);
        }}
        onDeleteStaff={delMember}
        onCreateCredential={createCredential}
        onDeleteDuty={handleDeleteDuty}
        onDeleteShift={handleDeleteShift}
        onToggleTask={handleToggleTask}
        creatingCredential={creatingCredentialId === selectedStaff?.id}
      />

      {/* SCHEDULE / EDIT SHIFT BLOCK DIALOG */}
      <Dialog
        open={openShiftDialog}
        onClose={() => setOpenShiftDialog(false)}
        title={editingShiftBlockId ? "Edit Shift Block" : "Schedule Common Shift Block"}
        testId="schedule-shift-dialog"
      >
        <div className="space-y-3.5">
          <p className="text-xs text-slate-300 font-body">
            Define a common workforce shift window. Staff assignments and operational duties are allocated in subsequent steps.
          </p>

          <div>
            <Label>Shift Name *</Label>
            <Input
              placeholder="e.g. Morning Shift"
              value={shiftBlockForm.name}
              onChange={(e) => setShiftBlockForm((f) => ({ ...f, name: e.target.value }))}
              data-testid="shift-name-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Shift Start Date *</Label>
              <Input
                type="date"
                value={shiftBlockForm.date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setShiftBlockForm((f) => ({
                    ...f,
                    date: newDate,
                    end_date: f.end_date === f.date || !f.end_date ? newDate : f.end_date,
                  }));
                }}
                data-testid="shift-date-input"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Shift End Date *</Label>
                {shiftBlockForm.end_date && shiftBlockForm.date && shiftBlockForm.end_date > shiftBlockForm.date && (
                  <span className="text-[10px] text-gold font-mono font-bold">+1 Day</span>
                )}
              </div>
              <Input
                type="date"
                value={shiftBlockForm.end_date || shiftBlockForm.date}
                min={shiftBlockForm.date}
                onChange={(e) => setShiftBlockForm((f) => ({ ...f, end_date: e.target.value }))}
                data-testid="shift-end-date-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Time *</Label>
              <Input
                type="time"
                value={shiftBlockForm.start_time}
                onChange={(e) => setShiftBlockForm((f) => ({ ...f, start_time: e.target.value }))}
                data-testid="shift-start-time-input"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>End Time *</Label>
                {shiftBlockForm.end_time && shiftBlockForm.start_time && shiftBlockForm.end_time <= shiftBlockForm.start_time && (
                  <span className="text-[10px] text-gold font-mono font-bold">Overnight</span>
                )}
              </div>
              <Input
                type="time"
                value={shiftBlockForm.end_time}
                onChange={(e) => {
                  const newEndTime = e.target.value;
                  setShiftBlockForm((f) => {
                    let updatedEndDate = f.end_date || f.date;
                    // If overnight shift (end time <= start time) and end_date is same as start date, auto-advance end_date to next day
                    if (newEndTime && f.start_time && newEndTime <= f.start_time && updatedEndDate === f.date && f.date) {
                      const nextDay = new Date(`${f.date}T00:00:00`);
                      nextDay.setDate(nextDay.getDate() + 1);
                      updatedEndDate = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
                    }
                    return { ...f, end_time: newEndTime, end_date: updatedEndDate };
                  });
                }}
                data-testid="shift-end-time-input"
              />
            </div>
          </div>

          <div>
            <Label>Operational Notes (Optional)</Label>
            <Input
              placeholder="e.g. Morning reception availability, Ground 2 standby"
              value={shiftBlockForm.notes}
              onChange={(e) => setShiftBlockForm((f) => ({ ...f, notes: e.target.value }))}
              data-testid="shift-notes-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenShiftDialog(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveShiftBlock} data-testid="save-shift-btn">
              {editingShiftBlockId ? "Update Shift" : "Create Shift"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MANAGE SHIFT STAFF DIALOG */}
      <Dialog
        open={openManageStaffModal}
        onClose={() => setOpenManageStaffModal(false)}
        title={`Manage Staff — ${managingShiftBlock?.name || "Shift Block"}`}
        testId="manage-shift-staff-dialog"
      >
        <div className="space-y-4">
          {/* Shift info snippet */}
          {managingShiftBlock && (
            <div className="rounded-lg bg-white/5 p-3 border border-white/10 flex items-center justify-between text-xs">
              <div>
                <span className="font-heading font-black text-white block text-sm">
                  {managingShiftBlock.name}
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {formatShiftDate(managingShiftBlock.start_time)} · {formatShiftTime(managingShiftBlock.start_time)} – {formatShiftTime(managingShiftBlock.end_time)}
                </span>
              </div>
              <span className="font-mono text-gold font-bold">
                {managingStaffIds.length} staff selected
              </span>
            </div>
          )}

          {/* Copy Staff From... QoL */}
          {shiftBlocks.filter((b) => b.id !== managingShiftBlock?.id).length > 0 && (
            <div className="rounded-lg bg-obsidian-950 p-2.5 border border-white/5 space-y-1.5">
              <Label className="text-[11px] text-slate-300">
                Copy Staff Selection From Another Shift:
              </Label>
              <Select
                value={copyFromShiftId}
                onChange={(e) => handleCopyStaffFrom(e.target.value)}
                className="h-8 text-xs"
                data-testid="copy-staff-from-select"
              >
                <option value="">Select shift to copy staff from…</option>
                {shiftBlocks
                  .filter((b) => b.id !== managingShiftBlock?.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({formatShiftDate(b.start_time)} · {b.staff_count ?? (b.staff_assignments?.length || 0)} staff)
                    </option>
                  ))}
              </Select>
            </div>
          )}

          <div>
            <Label>Personnel Roster (Select / Deselect Staff)</Label>
            <MultiStaffSelector
              staff={staff}
              selectedIds={managingStaffIds}
              onChange={setManagingStaffIds}
            />
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              {managingStaffIds.length} staff member(s) selected
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenManageStaffModal(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={saveStaffAssignments}
              disabled={savingStaffAssignments}
              data-testid="save-shift-staff-btn"
            >
              {savingStaffAssignments ? "Saving…" : "Save Staff Assignments"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MANAGE OPERATIONAL AREA IN-CHARGES DIALOG */}
      <Dialog
        open={openInchargesModal}
        onClose={() => setOpenInchargesModal(false)}
        title={`Manage In-Charges — ${managingInchargesBlock?.name || "Shift Block"}`}
        testId="manage-incharges-dialog"
      >
        <div className="space-y-4">
          {managingInchargesBlock && (
            <div className="rounded-lg bg-white/5 p-3 border border-white/10 text-xs">
              <span className="font-heading font-black text-white block text-sm">
                {managingInchargesBlock.name}
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {formatShiftDate(managingInchargesBlock.start_time)} · {formatShiftTime(managingInchargesBlock.start_time)} – {formatShiftTime(managingInchargesBlock.end_time)}
              </span>
            </div>
          )}

          {eligibleInchargeStaff.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              No staff are assigned to this shift block yet — assign staff first, then choose their in-charges here.
            </p>
          ) : activeOperationalAreas.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              No Operational Areas exist yet. Add one from the Duties &amp; Venues page first.
            </p>
          ) : (
            <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
              {activeOperationalAreas.map((a) => (
                <div key={a.id} className="rounded-lg bg-obsidian-950 p-2.5 border border-white/5 space-y-1.5">
                  <Label className="text-[11px] text-gold">{a.name}</Label>
                  <MultiStaffSelector
                    staff={eligibleInchargeStaff}
                    selectedIds={inchargesForm[a.id] || []}
                    onChange={(ids) => toggleInchargeStaff(a.id, ids)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenInchargesModal(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={saveIncharges}
              disabled={savingIncharges || eligibleInchargeStaff.length === 0}
              data-testid="save-incharges-btn"
            >
              {savingIncharges ? "Saving…" : "Save In-Charges"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* NEW LOGIN CREDENTIALS MODAL */}
      <Dialog
        open={Boolean(newLogin)}
        onClose={() => setNewLogin(null)}
        title="Staff Portal Login Provisioned"
        testId="new-staff-login-dialog"
      >
        {newLogin && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 font-body leading-relaxed">
              Organizer portal credentials for <strong>{newLogin.full_name}</strong> have been generated. Share these
              with the staff member now — the temporary password cannot be retrieved once closed.
            </p>
            <div className="space-y-2.5 rounded-lg border border-gold/30 bg-gold/5 p-4">
              <div>
                <Label>Username</Label>
                <p className="font-mono text-sm font-bold text-white" data-testid="new-staff-login-username">
                  {newLogin.username}
                </p>
              </div>
              <div>
                <Label>Password</Label>
                <p className="font-mono text-sm font-bold text-white" data-testid="new-staff-login-password">
                  {newLogin.password}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-white/10">
              <Button variant="gold" size="sm" onClick={() => setNewLogin(null)} data-testid="close-new-staff-login">
                Dismiss & Copy
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* CONTEXTUAL ADD DUTY DIALOG */}
      <Dialog
        open={openContextDutyModal}
        onClose={() => setOpenContextDutyModal(false)}
        title="Assign Duty to Shift Personnel"
        testId="context-duty-dialog"
      >
        <div className="space-y-3.5">
          <div className="rounded-lg bg-white/5 p-3 border border-white/10 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Assigned Personnel:</span>
              <span className="text-xs font-heading font-bold text-white">
                {contextDutyStaff?.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Shift Block:</span>
              <span className="text-xs font-heading font-bold text-gold">
                {contextDutyShift?.name}
              </span>
            </div>
          </div>

          <div>
            <Label>Operational Area *</Label>
            <Select
              value={contextDutyForm.operational_area_id}
              onChange={(e) => setContextDutyForm((f) => ({ ...f, operational_area_id: e.target.value }))}
              data-testid="context-duty-area-select"
            >
              <option value="">Select the team this duty reports under…</option>
              {activeOperationalAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-slate-500 font-body">
              WHO this duty reports under — its in-charge(s) for this shift. Separate from the specific duty below.
            </p>
          </div>

          <div>
            <Label>Specific Duty *</Label>
            <Input
              placeholder="e.g. Match Control, Court Support, Water Distribution"
              list="staff-duty-types"
              value={contextDutyForm.duty_type}
              onChange={(e) => setContextDutyForm((f) => ({ ...f, duty_type: e.target.value }))}
              data-testid="context-duty-type-input"
            />
            <datalist id="staff-duty-types">
              {dutyTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div>
            <Label>Operational Location (WHERE)</Label>
            <Select
              value={contextDutyForm.location_id}
              onChange={(e) => setContextDutyForm((f) => ({ ...f, location_id: e.target.value }))}
              data-testid="context-duty-location-select"
            >
              <option value="">Select Operational Venue (Ground, Gate, Reception…)</option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  📍 {loc.name} ({loc.location_type})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Start Time</Label>
              <Input
                type="datetime-local"
                value={contextDutyForm.start_time}
                onChange={(e) => setContextDutyForm((f) => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="datetime-local"
                value={contextDutyForm.end_time}
                onChange={(e) => setContextDutyForm((f) => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              placeholder="Duty notes, special instructions, communication channel…"
              rows={2}
              value={contextDutyForm.notes}
              onChange={(e) => setContextDutyForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenContextDutyModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveContextDuty} data-testid="save-context-duty-btn">
              Assign Duty
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CONTEXTUAL ADD TASK DIALOG */}
      <Dialog
        open={openContextTaskModal}
        onClose={() => setOpenContextTaskModal(false)}
        title="Assign Task to Shift Personnel"
        testId="context-task-dialog"
      >
        <div className="space-y-3.5">
          <div className="rounded-lg bg-white/5 p-3 border border-white/10 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Assigned Personnel:</span>
              <span className="text-xs font-heading font-bold text-white">
                {contextTaskStaff?.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Shift Block:</span>
              <span className="text-xs font-heading font-bold text-gold">
                {contextTaskShift?.name}
              </span>
            </div>
          </div>

          <div>
            <Label>Task Title *</Label>
            <Input
              placeholder="e.g. Collect team arrival sheets, verify drinking water"
              value={contextTaskForm.title}
              onChange={(e) => setContextTaskForm((f) => ({ ...f, title: e.target.value }))}
              data-testid="context-task-title-input"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Category</Label>
              <Input
                placeholder="e.g. Operations, Logistics, Protocol"
                value={contextTaskForm.category}
                onChange={(e) => setContextTaskForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={contextTaskForm.priority}
                onChange={(e) => setContextTaskForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>Due Date / Time</Label>
            <Input
              type="datetime-local"
              value={contextTaskForm.due_date}
              onChange={(e) => setContextTaskForm((f) => ({ ...f, due_date: e.target.value }))}
            />
          </div>

          <div>
            <Label>Description / Instructions</Label>
            <Textarea
              placeholder="Additional details, checkpoints…"
              rows={2}
              value={contextTaskForm.description}
              onChange={(e) => setContextTaskForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpenContextTaskModal(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveContextTask} data-testid="save-context-task-btn">
              Assign Task
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
