// Shared label -> Badge tone mappings so status/priority colours stay consistent.

type Tone = "neutral" | "coral" | "green" | "blue" | "amber" | "red" | "slate";

export const knowledgeStatusTone = (s: string): Tone => {
  const m: Record<string, Tone> = {
    Idea: "neutral",
    Discussion: "blue",
    Pending: "amber",
    Decided: "coral",
    "In Progress": "coral",
    Completed: "green",
    Cancelled: "red",
  };
  return m[s] ?? "neutral";
};

export const procurementStatusTone = (s: string): Tone => {
  const m: Record<string, Tone> = {
    Open: "amber",
    Researching: "blue",
    Quoted: "coral",
    Ordered: "coral",
    Received: "green",
    Cancelled: "red",
  };
  return m[s] ?? "neutral";
};

export const priorityTone = (p: string): Tone => {
  const m: Record<string, Tone> = {
    low: "neutral",
    normal: "blue",
    high: "amber",
    urgent: "red",
  };
  return m[p] ?? "neutral";
};

export const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** "29 Sep 2026, 09:30 am" — date AND time, in the viewer's local zone. */
export const formatDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
};

// Compact "+1h" / "+45m" / "+1h 30m" style for a duty's outside-shift-window
// overflow (backend's DutyAssignment `outside_shift_minutes` — see
// routers/staff.py `_duty_shift_overflow_minutes`). Shared by the organizer
// ShiftBlock roster (Staff.tsx) and the staff self-service My Work page so
// both render the same overflow the same way.
export const formatOverflowMinutes = (minutes?: number | null): string | null => {
  if (!minutes || minutes <= 0) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `+${hrs}h ${mins}m`;
  if (hrs > 0) return `+${hrs}h`;
  return `+${mins}m`;
};

export const formatMoney = (v?: number | string | null, currency = "INR") => {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `${currency === "INR" ? "₹" : currency + " "}${n.toLocaleString("en-IN")}`;
};

// Every staff picker (duty assignment, task assignee, account linking) groups
// the same way — by StaffMember.category — so this stays the one place that
// decides the grouping/order instead of each dropdown re-implementing it.
// Same conversion routers/public.py does server-side for the public team page —
// duplicated here (not exposed by the admin API, which returns raw entered
// URLs) so the admin "manage photos" preview can show a real thumbnail too.
const DRIVE_ID_RE = /(?:id=|\/d\/)([\w-]{25,})/;
export function driveThumbnail(rawUrl: string): string {
  const m = rawUrl.match(DRIVE_ID_RE);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : rawUrl;
}

export function groupStaffByCategory<T extends { category?: string | null }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || "Uncategorized";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Formats an ISO datetime string into YYYY-MM-DDTHH:MM for HTML datetime-local inputs */
export const toDateTimeLocal = (dateStr?: string | null): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateStr)) {
        return dateStr.slice(0, 16);
      }
      return "";
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
};
