import { AvailableLocationOption, OperationalAreaItem } from "@/pages/admin/Duties";
import {
  StaffDetailMember,
  StaffShiftItem,
  StaffDutyItem,
  StaffTaskItem,
} from "@/components/admin/StaffDetailDrawer";

export type { AvailableLocationOption, OperationalAreaItem };
export type { StaffDetailMember, StaffShiftItem, StaffDutyItem, StaffTaskItem };

export interface StaffMember {
  id: number;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
  notes?: string | null;
  login_username?: string | null;
}

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
      operational_area_id?: number | null;
      operational_area_name?: string | null;
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
      category?: string;
    }[];
  })[];
  incharges?: {
    operational_area_id: number;
    operational_area_name: string | null;
    operational_area_code: string | null;
    staff: { id: number; full_name: string }[];
  }[];
  created_at?: string;
  updated_at?: string;
}

export const pad = (n: number) => String(n).padStart(2, "0");

export const formatShiftDate = (isoStr: string) => {
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

export const formatShiftTime = (isoStr?: string | null) => {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoStr || "";
  }
};

export const getShiftDuration = (startIso: string, endIso: string) => {
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

export const toLocalIso = (isoStr: string) => {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
};
