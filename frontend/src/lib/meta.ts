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
