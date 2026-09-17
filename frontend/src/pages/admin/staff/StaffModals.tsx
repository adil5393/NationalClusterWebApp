import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { StaffSelector, MultiStaffSelector, StaffOption } from "@/components/admin/StaffSelector";
import { toDateTimeLocal } from "@/lib/meta";
import {
  StaffMember,
  ShiftBlockItem,
  OperationalAreaItem,
  AvailableLocationOption,
  formatShiftDate,
  formatShiftTime,
  pad,
} from "./types";

/* -------------------------------------------------------------------------- */
/* 1. MEMBER FORM DIALOG (Add / Edit Staff Member)                            */
/* -------------------------------------------------------------------------- */
interface MemberFormDialogProps {
  open: boolean;
  onClose: () => void;
  staffMember: StaffMember | null;
  staffCategories: string[];
  onSuccess: () => void;
}

export function MemberFormDialog({
  open,
  onClose,
  staffMember,
  staffCategories,
  onSuccess,
}: MemberFormDialogProps) {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    category: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (staffMember) {
      setForm({
        full_name: staffMember.full_name || "",
        phone: staffMember.phone || "",
        email: staffMember.email || "",
        category: staffMember.category || "",
        notes: staffMember.notes || "",
      });
    } else {
      setForm({ full_name: "", phone: "", email: "", category: "", notes: "" });
    }
  }, [staffMember, open]);

  const handleSubmit = async () => {
    if (!form.full_name.trim()) return toast.error("Staff name is required");
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      category: form.category.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (staffMember) {
        await api.put(`/staff/${staffMember.id}`, payload);
        toast.success("Staff member updated");
      } else {
        await api.post("/staff", payload);
        toast.success("Staff member added to directory");
      }
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save staff member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={staffMember ? "Edit Staff Personnel" : "Add New Staff Member"}
      testId="staff-form-dialog"
    >
      <div className="space-y-3.5">
        <div>
          <Label>Full Name *</Label>
          <Input
            placeholder="e.g. Ramesh Patel"
            value={form.full_name}
            onChange={(e) => setForm((m) => ({ ...m, full_name: e.target.value }))}
            data-testid="staff-name-input"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Category / Role</Label>
            <Input
              placeholder="e.g. Referees, Medical, Technical"
              list="staff-category-options"
              value={form.category}
              onChange={(e) => setForm((m) => ({ ...m, category: e.target.value }))}
              data-testid="staff-category-input"
            />
            <datalist id="staff-category-options">
              {staffCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <Label>Phone (Optional)</Label>
            <Input
              type="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => setForm((m) => ({ ...m, phone: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label>Email (Optional)</Label>
          <Input
            type="email"
            placeholder="e.g. ramesh@example.com"
            value={form.email}
            onChange={(e) => setForm((m) => ({ ...m, email: e.target.value }))}
          />
        </div>

        <div>
          <Label>Operational Notes</Label>
          <Textarea
            placeholder="Designation, hostel block, shift preference, or special instructions…"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((m) => ({ ...m, notes: e.target.value }))}
            data-testid="staff-notes-input"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" size="sm" onClick={handleSubmit} disabled={saving} data-testid="save-staff-btn">
            {saving ? "Saving…" : staffMember ? "Update Staff" : "Save to Directory"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. SHIFT BLOCK DIALOG (Schedule / Edit Shift Block)                        */
/* -------------------------------------------------------------------------- */
interface ShiftBlockDialogProps {
  open: boolean;
  onClose: () => void;
  shiftBlock: ShiftBlockItem | null;
  onSuccess: () => void;
}

export function ShiftBlockDialog({
  open,
  onClose,
  shiftBlock,
  onSuccess,
}: ShiftBlockDialogProps) {
  const [form, setForm] = useState({
    name: "",
    date: "",
    end_date: "",
    start_time: "08:00",
    end_time: "14:00",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shiftBlock) {
      const sDate = new Date(shiftBlock.start_time);
      const eDate = new Date(shiftBlock.end_time);
      setForm({
        name: shiftBlock.name,
        date: `${sDate.getFullYear()}-${pad(sDate.getMonth() + 1)}-${pad(sDate.getDate())}`,
        end_date: `${eDate.getFullYear()}-${pad(eDate.getMonth() + 1)}-${pad(eDate.getDate())}`,
        start_time: `${pad(sDate.getHours())}:${pad(sDate.getMinutes())}`,
        end_time: `${pad(eDate.getHours())}:${pad(eDate.getMinutes())}`,
        notes: shiftBlock.notes || "",
      });
    } else {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      setForm({
        name: "",
        date: todayStr,
        end_date: todayStr,
        start_time: "08:00",
        end_time: "14:00",
        notes: "",
      });
    }
  }, [shiftBlock, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error("Shift block name required");
    if (!form.date) return toast.error("Please select a start date");
    if (!form.start_time || !form.end_time) return toast.error("Start and end time required");

    const effectiveEndDate = form.end_date || form.date;
    const startObj = new Date(`${form.date}T${form.start_time}`);
    const endObj = new Date(`${effectiveEndDate}T${form.end_time}`);

    if (Number.isNaN(startObj.getTime()) || Number.isNaN(endObj.getTime())) {
      return toast.error("Invalid date or time entered");
    }

    if (endObj <= startObj) {
      return toast.error("Shift end date & time must be strictly after start date & time");
    }

    setSaving(true);
    const startIso = startObj.toISOString();
    const endIso = endObj.toISOString();

    try {
      if (shiftBlock) {
        await api.put(`/staff/shift-blocks/${shiftBlock.id}`, {
          name: form.name.trim(),
          start_time: startIso,
          end_time: endIso,
          notes: form.notes.trim() || null,
        });
        toast.success("Shift block updated successfully");
      } else {
        await api.post("/staff/shift-blocks", {
          name: form.name.trim(),
          start_time: startIso,
          end_time: endIso,
          notes: form.notes.trim() || null,
          status: "SCHEDULED",
        });
        toast.success("Shift block created successfully");
      }
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save shift block");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={shiftBlock ? "Edit Shift Block" : "Schedule Common Shift Block"}
      testId="schedule-shift-dialog"
    >
      <div className="space-y-3.5">
        <p className="text-xs text-slate-300 font-body">
          Define a common workforce shift window. Staff assignments and operational duties are allocated in subsequent steps.
        </p>

        <div>
          <Label>Shift Name *</Label>
          <Input
            placeholder="e.g. Morning Shift, Day 1 Evening"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            data-testid="shift-name-input"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Shift Start Date *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => {
                const newDate = e.target.value;
                setForm((f) => ({
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
              {form.end_date && form.date && form.end_date > form.date && (
                <span className="text-[10px] text-gold font-mono font-bold">+1 Day</span>
              )}
            </div>
            <Input
              type="date"
              value={form.end_date || form.date}
              min={form.date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              data-testid="shift-end-date-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start Time *</Label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              data-testid="shift-start-time-input"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>End Time *</Label>
              {form.end_time && form.start_time && form.end_time <= form.start_time && (
                <span className="text-[10px] text-gold font-mono font-bold">Overnight</span>
              )}
            </div>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => {
                const newEndTime = e.target.value;
                setForm((f) => {
                  let updatedEndDate = f.end_date || f.date;
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
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            data-testid="shift-notes-input"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" size="sm" onClick={handleSubmit} disabled={saving} data-testid="save-shift-btn">
            {saving ? "Saving…" : shiftBlock ? "Update Shift" : "Create Shift"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. MANAGE SHIFT STAFF MODAL (Roster membership)                            */
/* -------------------------------------------------------------------------- */
interface ManageShiftStaffModalProps {
  open: boolean;
  onClose: () => void;
  shiftBlock: ShiftBlockItem | null;
  allStaff: StaffMember[];
  allShiftBlocks: ShiftBlockItem[];
  onSuccess: () => void;
}

export function ManageShiftStaffModal({
  open,
  onClose,
  shiftBlock,
  allStaff,
  allShiftBlocks,
  onSuccess,
}: ManageShiftStaffModalProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [copyFromShiftId, setCopyFromShiftId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shiftBlock) {
      const currentIds = (shiftBlock.staff_assignments || []).map((a) => a.staff_id);
      setSelectedIds(currentIds);
      setCopyFromShiftId("");
    } else {
      setSelectedIds([]);
      setCopyFromShiftId("");
    }
  }, [shiftBlock, open]);

  const handleCopyFrom = (sourceBlockIdStr: string) => {
    setCopyFromShiftId(sourceBlockIdStr);
    if (!sourceBlockIdStr) return;
    const sourceBlock = allShiftBlocks.find((b) => b.id === Number(sourceBlockIdStr));
    if (sourceBlock && sourceBlock.staff_assignments) {
      const copiedIds = sourceBlock.staff_assignments.map((a) => a.staff_id);
      setSelectedIds(copiedIds);
      toast.info(
        `Copied ${copiedIds.length} staff member(s) from "${sourceBlock.name}". Review selection and click Save.`
      );
    }
  };

  const handleSave = async () => {
    if (!shiftBlock) return;
    setSaving(true);
    try {
      await api.put(`/staff/shift-blocks/${shiftBlock.id}/staff`, {
        staff_ids: selectedIds,
      });
      toast.success("Staff assignments updated successfully");
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update staff assignments");
    } finally {
      setSaving(false);
    }
  };

  const sortedAllStaff = useMemo(() => {
    return [...allStaff].sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
    );
  }, [allStaff]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Manage Staff — ${shiftBlock?.name || "Shift Block"}`}
      testId="manage-shift-staff-dialog"
    >
      <div className="space-y-4">
        {shiftBlock && (
          <div className="rounded-lg bg-white/5 p-3 border border-white/10 flex items-center justify-between text-xs">
            <div>
              <span className="font-heading font-black text-white block text-sm">
                {shiftBlock.name}
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {formatShiftDate(shiftBlock.start_time)} · {formatShiftTime(shiftBlock.start_time)} – {formatShiftTime(shiftBlock.end_time)}
              </span>
            </div>
            <span className="font-mono text-gold font-bold">
              {selectedIds.length} staff selected
            </span>
          </div>
        )}

        {allShiftBlocks.filter((b) => b.id !== shiftBlock?.id).length > 0 && (
          <div className="rounded-lg bg-obsidian-950 p-2.5 border border-white/5 space-y-1.5">
            <Label className="text-[11px] text-slate-300">
              Copy Staff Selection From Another Shift:
            </Label>
            <Select
              value={copyFromShiftId}
              onChange={(e) => handleCopyFrom(e.target.value)}
              className="h-8 text-xs"
              data-testid="copy-staff-from-select"
            >
              <option value="">Select shift to copy staff from…</option>
              {allShiftBlocks
                .filter((b) => b.id !== shiftBlock?.id)
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
            staff={sortedAllStaff}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
          />
          <p className="text-[11px] text-slate-400 font-mono mt-1">
            {selectedIds.length} staff member(s) selected
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            data-testid="save-shift-staff-btn"
          >
            {saving ? "Saving…" : "Save Staff Assignments"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. DUTY ASSIGNMENT MODAL (Assign / Edit Duty)                              */
/* -------------------------------------------------------------------------- */
interface DutyAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  staffId?: number | null;
  shiftId?: number | null;
  dutyToEdit?: any | null; // If editing an existing duty
  allStaff: StaffMember[];
  allShiftBlocks: ShiftBlockItem[];
  operationalAreas: OperationalAreaItem[];
  availableLocations: AvailableLocationOption[];
  dutyTypes: string[];
  onSuccess: () => void;
}

export function DutyAssignmentModal({
  open,
  onClose,
  staffId,
  shiftId,
  dutyToEdit,
  allStaff,
  allShiftBlocks,
  operationalAreas,
  availableLocations,
  dutyTypes,
  onSuccess,
}: DutyAssignmentModalProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(staffId ?? null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(shiftId ?? null);
  const [operationalAreaId, setOperationalAreaId] = useState<string>("");
  const [dutyType, setDutyType] = useState<string>("");
  const [locationKey, setLocationKey] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const activeOperationalAreas = useMemo(() => {
    return operationalAreas.filter((a) => a.is_active);
  }, [operationalAreas]);

  const courtsAndGrounds = useMemo(
    () => availableLocations.filter((o) => o.location_source === "mat"),
    [availableLocations],
  );
  const buildingsAndRooms = useMemo(
    () => availableLocations.filter((o) => o.location_source === "building" || o.location_source === "room"),
    [availableLocations],
  );
  const otherEventLocations = useMemo(
    () => availableLocations.filter((o) => o.location_source === "event_location"),
    [availableLocations],
  );

  const selectedStaffMember = useMemo(
    () => allStaff.find((s) => s.id === selectedStaffId) || null,
    [allStaff, selectedStaffId]
  );

  // Available shifts for selected staff
  const staffEligibleShifts = useMemo(() => {
    if (!selectedStaffId) return allShiftBlocks;
    const eligible = allShiftBlocks.filter((b) =>
      (b.staff_assignments || []).some((a) => a.staff_id === selectedStaffId)
    );
    if (selectedShiftId && !eligible.some((b) => b.id === selectedShiftId)) {
      const current = allShiftBlocks.find((b) => b.id === selectedShiftId);
      if (current) eligible.unshift(current);
    }
    return eligible;
  }, [allShiftBlocks, selectedStaffId, selectedShiftId]);

  // Sorted staff options for this duty assignment modal
  const sortedStaffOptions = useMemo(() => {
    if (selectedShiftId) {
      const block = allShiftBlocks.find((b) => b.id === selectedShiftId);
      if (block && (block.staff_assignments || []).length > 0) {
        const shiftStaffIds = new Set((block.staff_assignments || []).map((a) => a.staff_id));
        const onShift = allStaff.filter((s) => shiftStaffIds.has(s.id));
        if (onShift.length > 0) {
          return onShift.sort((a, b) =>
            (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
          );
        }
      }
    }
    return [...allStaff].sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
    );
  }, [allStaff, selectedShiftId, allShiftBlocks]);

  useEffect(() => {
    if (dutyToEdit) {
      setSelectedStaffId(dutyToEdit.staff_id);
      setSelectedShiftId(dutyToEdit.shift_id ?? null);
      setOperationalAreaId(dutyToEdit.operational_area_id ? String(dutyToEdit.operational_area_id) : "");
      setDutyType(dutyToEdit.duty_type || "");

      // Rebuild location key if available
      let key = "";
      if (dutyToEdit.location_source && dutyToEdit.location_source_id) {
        key = `${dutyToEdit.location_source}:${dutyToEdit.location_source_id}`;
      } else if (dutyToEdit.location_id) {
        key = `event_location:${dutyToEdit.location_id}`;
      } else if (dutyToEdit.room_id) {
        key = `room:${dutyToEdit.room_id}`;
      }
      setLocationKey(key);
      setStartTime(toDateTimeLocal(dutyToEdit.start_time));
      setEndTime(toDateTimeLocal(dutyToEdit.end_time));
      setNotes(dutyToEdit.notes || "");
    } else {
      setSelectedStaffId(staffId ?? null);
      setSelectedShiftId(shiftId ?? null);
      setOperationalAreaId("");
      setDutyType("");
      setLocationKey("");
      setNotes("");

      // If shiftId is provided, prefill start/end time from shift block
      const targetShiftId = shiftId;
      if (targetShiftId) {
        const found = allShiftBlocks.find((b) =>
          b.id === targetShiftId || (b.staff_assignments || []).some((a) => a.id === targetShiftId)
        );
        if (found) {
          setStartTime(toDateTimeLocal(found.start_time));
          setEndTime(toDateTimeLocal(found.end_time));
        } else {
          setStartTime("");
          setEndTime("");
        }
      } else {
        setStartTime("");
        setEndTime("");
      }
    }
  }, [dutyToEdit, staffId, shiftId, open, allShiftBlocks]);

  const handleSubmit = async () => {
    if (!selectedStaffId) return toast.error("Please select a staff member");
    if (!operationalAreaId) return toast.error("Operational area is required");
    if (!dutyType.trim()) return toast.error("Specific duty is required");

    let startIso: string | null = null;
    let endIso: string | null = null;
    if (startTime) {
      const d = new Date(startTime);
      if (!Number.isNaN(d.getTime())) startIso = d.toISOString();
    }
    if (endTime) {
      const d = new Date(endTime);
      if (!Number.isNaN(d.getTime())) endIso = d.toISOString();
    }

    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      return toast.error("Duty end time must be after start time");
    }

    const [locationSource, locationSourceIdStr] = locationKey
      ? locationKey.split(":")
      : [null, null];

    // Resolve shift assignment id if shiftId passed is a block id
    let resolvedShiftId = selectedShiftId;
    if (selectedShiftId && selectedStaffId) {
      const block = allShiftBlocks.find((b) => b.id === selectedShiftId);
      if (block) {
        const assignment = (block.staff_assignments || []).find((a) => a.staff_id === selectedStaffId);
        if (assignment) {
          resolvedShiftId = assignment.id;
        }
      }
    }

    setSaving(true);
    const payload = {
      staff_id: selectedStaffId,
      shift_id: resolvedShiftId,
      operational_area_id: Number(operationalAreaId),
      duty_type: dutyType.trim(),
      location_source: locationSource,
      location_source_id: locationSourceIdStr ? Number(locationSourceIdStr) : null,
      start_time: startIso,
      end_time: endIso,
      notes: notes.trim() || null,
    };

    try {
      if (dutyToEdit) {
        const res = await api.put(`/staff/duties/${dutyToEdit.id}`, payload);
        if (res.data?.warning) {
          toast.warning(res.data.warning);
        } else {
          toast.success("Duty updated successfully");
        }
      } else {
        const res = await api.post("/staff/duties", payload);
        if (res.data?.warning) {
          toast.warning(res.data.warning);
        } else {
          toast.success("Duty assigned successfully");
        }
      }
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save duty");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dutyToEdit ? "Edit Operational Duty" : "Assign Operational Duty"}
      testId="assign-duty-dialog"
    >
      <div className="space-y-3.5">
        {/* Staff selector if not locked */}
        {!staffId && !dutyToEdit ? (
          <div>
            <Label>Staff Member *</Label>
            <StaffSelector
              staff={sortedStaffOptions}
              value={selectedStaffId}
              onChange={setSelectedStaffId}
            />
          </div>
        ) : (
          <div className="rounded-lg bg-white/5 p-3 border border-white/10 flex items-center justify-between text-xs">
            <span className="text-slate-400">Assigned Personnel:</span>
            <span className="font-heading font-bold text-white">
              {selectedStaffMember?.full_name || `Staff #${selectedStaffId}`}
            </span>
          </div>
        )}

        {/* Shift selector */}
        <div>
          <Label>Shift (Optional)</Label>
          <Select
            value={selectedShiftId ? String(selectedShiftId) : ""}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              setSelectedShiftId(val);
              if (val) {
                const found = allShiftBlocks.find((b) => b.id === val);
                if (found) {
                  setStartTime(toDateTimeLocal(found.start_time));
                  setEndTime(toDateTimeLocal(found.end_time));
                }
              }
            }}
            className="h-9 text-xs"
          >
            <option value="">No shift link / Cross-shift duty</option>
            {staffEligibleShifts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({formatShiftDate(b.start_time)} · {formatShiftTime(b.start_time)}–{formatShiftTime(b.end_time)})
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Operational Area *</Label>
          <Select
            value={operationalAreaId}
            onChange={(e) => setOperationalAreaId(e.target.value)}
            className="h-9 text-xs"
            data-testid="duty-area-select"
          >
            <option value="">Select the team this duty reports under…</option>
            {activeOperationalAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Specific Duty *</Label>
          <Input
            placeholder="e.g. Team Check-in, Welcome Desk, Match Control"
            list="duty-types-datalist"
            value={dutyType}
            onChange={(e) => setDutyType(e.target.value)}
            className="h-9 text-xs"
            data-testid="duty-type-input"
          />
          <datalist id="duty-types-datalist">
            {dutyTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div>
          <Label>Location (Physical / Venue)</Label>
          <Select
            value={locationKey}
            onChange={(e) => setLocationKey(e.target.value)}
            className="h-9 text-xs"
            data-testid="duty-location-select"
          >
            <option value="">Select an existing location…</option>
            {courtsAndGrounds.length > 0 && (
              <optgroup label="COURTS / GROUNDS">
                {courtsAndGrounds.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            )}
            {buildingsAndRooms.length > 0 && (
              <optgroup label="BUILDINGS / ROOMS">
                {buildingsAndRooms.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            )}
            {otherEventLocations.length > 0 && (
              <optgroup label="OTHER EVENT LOCATIONS">
                {otherEventLocations.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Start Time</Label>
            <Input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <Label>End Time</Label>
            <Input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div>
          <Label>Notes (Optional)</Label>
          <Textarea
            placeholder="Duty instructions, reporting contact, channel…"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" size="sm" onClick={handleSubmit} disabled={saving} data-testid="save-duty-btn">
            {saving ? "Saving…" : dutyToEdit ? "Update Duty" : "Assign Duty"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. TASK ASSIGNMENT MODAL (Add / Edit Task)                                 */
/* -------------------------------------------------------------------------- */
interface TaskAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  staffId?: number | null;
  shiftId?: number | null;
  taskToEdit?: any | null;
  allStaff: StaffMember[];
  allShiftBlocks: ShiftBlockItem[];
  onSuccess: () => void;
}

export function TaskAssignmentModal({
  open,
  onClose,
  staffId,
  shiftId,
  taskToEdit,
  allStaff,
  allShiftBlocks,
  onSuccess,
}: TaskAssignmentModalProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(staffId ?? null);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(shiftId ?? null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Operations");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const sortedStaff = useMemo(() => {
    return [...allStaff].sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
    );
  }, [allStaff]);

  useEffect(() => {
    if (taskToEdit) {
      setSelectedStaffId(taskToEdit.assigned_staff_id ?? null);
      setSelectedShiftId(taskToEdit.shift_id ?? null);
      setTitle(taskToEdit.title || "");
      setCategory(taskToEdit.category || "Operations");
      setPriority(taskToEdit.priority || "medium");
      setDueDate(toDateTimeLocal(taskToEdit.due_date));
      setDescription(taskToEdit.description || "");
    } else {
      setSelectedStaffId(staffId ?? null);
      setSelectedShiftId(shiftId ?? null);
      setTitle("");
      setCategory("Operations");
      setPriority("medium");
      setDescription("");
      if (shiftId) {
        const found = allShiftBlocks.find((b) => b.id === shiftId);
        setDueDate(toDateTimeLocal(found?.end_time));
      } else {
        setDueDate("");
      }
    }
  }, [taskToEdit, staffId, shiftId, open, allShiftBlocks]);

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error("Task title is required");
    setSaving(true);

    let resolvedShiftId = selectedShiftId;
    if (selectedShiftId && selectedStaffId) {
      const block = allShiftBlocks.find((b) => b.id === selectedShiftId);
      if (block) {
        const assignment = (block.staff_assignments || []).find((a) => a.staff_id === selectedStaffId);
        if (assignment) resolvedShiftId = assignment.id;
      }
    }

    const payload = {
      title: title.trim(),
      category: category.trim() || "Operations",
      priority,
      assigned_staff_id: selectedStaffId,
      shift_id: resolvedShiftId,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      description: description.trim() || null,
      status: taskToEdit ? taskToEdit.status : "pending",
    };

    try {
      if (taskToEdit) {
        await api.put(`/tasks/${taskToEdit.id}`, payload);
        toast.success("Task updated");
      } else {
        await api.post("/tasks", payload);
        toast.success("Task created");
      }
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={taskToEdit ? "Edit Operational Task" : "Assign Operational Task"}
      testId="assign-task-dialog"
    >
      <div className="space-y-3.5">
        {!staffId && !taskToEdit ? (
          <div>
            <Label>Assigned Personnel (Optional)</Label>
            <StaffSelector
              staff={sortedStaff}
              value={selectedStaffId}
              onChange={setSelectedStaffId}
            />
          </div>
        ) : (
          selectedStaffId && (
            <div className="rounded-lg bg-white/5 p-3 border border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-400">Assigned Personnel:</span>
              <span className="font-heading font-bold text-white">
                {allStaff.find((s) => s.id === selectedStaffId)?.full_name || `Staff #${selectedStaffId}`}
              </span>
            </div>
          )
        )}

        <div>
          <Label>Task Title *</Label>
          <Input
            placeholder="e.g. Collect team arrival sheets, verify drinking water"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 text-xs"
            data-testid="task-title-input"
            autoFocus
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <Input
              placeholder="e.g. Operations, Logistics, Protocol"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div>
            <Label>Priority</Label>
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="h-9 text-xs"
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
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-9 text-xs"
          />
        </div>

        <div>
          <Label>Description / Instructions</Label>
          <Textarea
            placeholder="Additional details, checkpoints…"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" size="sm" onClick={handleSubmit} disabled={saving} data-testid="save-task-btn">
            {saving ? "Saving…" : taskToEdit ? "Update Task" : "Assign Task"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. SHIFT IN-CHARGES MODAL                                                  */
/* -------------------------------------------------------------------------- */
interface ShiftInchargesModalProps {
  open: boolean;
  onClose: () => void;
  shiftBlock: ShiftBlockItem | null;
  operationalAreas: OperationalAreaItem[];
  onSuccess: () => void;
}

export function ShiftInchargesModal({
  open,
  onClose,
  shiftBlock,
  operationalAreas,
  onSuccess,
}: ShiftInchargesModalProps) {
  const [inchargesForm, setInchargesForm] = useState<Record<number, number[]>>({});
  const [saving, setSaving] = useState(false);

  const activeAreas = useMemo(() => {
    return operationalAreas.filter((a) => a.is_active);
  }, [operationalAreas]);

  // Only staff already on this ShiftBlock's own roster are eligible, sorted alphabetically
  const eligibleStaff: StaffOption[] = useMemo(() => {
    const list = (shiftBlock?.staff_assignments || []).map((a) => ({
      id: a.staff_id,
      full_name: a.staff_name || `Staff #${a.staff_id}`,
      category: a.staff_category || null,
      phone: a.staff_phone || null,
    }));
    return list.sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
    );
  }, [shiftBlock]);

  useEffect(() => {
    if (shiftBlock) {
      const initial: Record<number, number[]> = {};
      for (const g of shiftBlock.incharges || []) {
        initial[g.operational_area_id] = g.staff.map((s) => s.id);
      }
      setInchargesForm(initial);
    } else {
      setInchargesForm({});
    }
  }, [shiftBlock, open]);

  const toggleStaff = (areaId: number, staffIds: number[]) => {
    setInchargesForm((prev) => ({ ...prev, [areaId]: staffIds }));
  };

  const handleSave = async () => {
    if (!shiftBlock) return;
    setSaving(true);
    try {
      const areaIds = new Set<number>([
        ...activeAreas.map((a) => a.id),
        ...Object.keys(inchargesForm).map(Number),
      ]);
      const payload = Array.from(areaIds).map((areaId) => ({
        operational_area_id: areaId,
        staff_ids: inchargesForm[areaId] || [],
      }));
      await api.put(`/staff/shift-blocks/${shiftBlock.id}/incharges`, payload);
      toast.success("In-charges updated");
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update in-charges");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Manage In-Charges — ${shiftBlock?.name || "Shift Block"}`}
      testId="manage-incharges-dialog"
    >
      <div className="space-y-4">
        {shiftBlock && (
          <div className="rounded-lg bg-white/5 p-3 border border-white/10 text-xs">
            <span className="font-heading font-black text-white block text-sm">
              {shiftBlock.name}
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {formatShiftDate(shiftBlock.start_time)} · {formatShiftTime(shiftBlock.start_time)} – {formatShiftTime(shiftBlock.end_time)}
            </span>
          </div>
        )}

        {eligibleStaff.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No staff are assigned to this shift block yet — assign staff first, then choose their in-charges here.
          </p>
        ) : activeAreas.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No Operational Areas exist yet. Add one from the Duties &amp; Venues page first.
          </p>
        ) : (
          <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
            {activeAreas.map((a) => (
              <div key={a.id} className="rounded-lg bg-obsidian-950 p-2.5 border border-white/5 space-y-1.5">
                <Label className="text-[11px] text-gold">{a.name}</Label>
                <MultiStaffSelector
                  staff={eligibleStaff}
                  selectedIds={inchargesForm[a.id] || []}
                  onChange={(ids) => toggleStaff(a.id, ids)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={handleSave}
            disabled={saving || eligibleStaff.length === 0}
            data-testid="save-incharges-btn"
          >
            {saving ? "Saving…" : "Save In-Charges"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. NEW LOGIN PROVISIONED DIALOG                                            */
/* -------------------------------------------------------------------------- */
interface NewLoginDialogProps {
  login: { full_name: string; username: string; password: string } | null;
  onClose: () => void;
}

export function NewLoginDialog({ login, onClose }: NewLoginDialogProps) {
  if (!login) return null;
  return (
    <Dialog
      open={Boolean(login)}
      onClose={onClose}
      title="Staff Portal Login Provisioned"
      testId="new-staff-login-dialog"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-300 font-body leading-relaxed">
          Organizer portal credentials for <strong>{login.full_name}</strong> have been generated. Share these
          with the staff member now — the temporary password cannot be retrieved once closed.
        </p>
        <div className="space-y-2.5 rounded-lg border border-gold/30 bg-gold/5 p-4">
          <div>
            <Label>Username</Label>
            <p className="font-mono text-sm font-bold text-white" data-testid="new-staff-login-username">
              {login.username}
            </p>
          </div>
          <div>
            <Label>Password</Label>
            <p className="font-mono text-sm font-bold text-white" data-testid="new-staff-login-password">
              {login.password}
            </p>
          </div>
        </div>
        <div className="flex justify-end pt-2 border-t border-white/10">
          <Button variant="gold" size="sm" onClick={onClose} data-testid="close-new-staff-login">
            Dismiss &amp; Copy
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
