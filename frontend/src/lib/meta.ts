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
