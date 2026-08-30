import { useEffect, useMemo, useState } from "react";
import { Megaphone, AlertCircle, Bell, Clock, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { priorityTone, formatDate } from "@/lib/meta";
import { Tabs } from "@/components/ui/tabs";

interface Announcement {
  id: number;
  title: string;
  message: string;
  priority: string;
  published_at?: string | null;
}

export default function PublicAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    api
      .get<Announcement[]>("/public/announcements")
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const total = items.length;
    const urgent = items.filter(
      (a) => (a.priority || "").toLowerCase() === "high" || (a.priority || "").toLowerCase() === "urgent",
    ).length;
    const normal = items.filter(
      (a) => (a.priority || "").toLowerCase() !== "high" && (a.priority || "").toLowerCase() !== "urgent",
    ).length;
    return { total, urgent, normal };
  }, [items]);

  const filterTabs = [
    { id: "all", label: "All Notices", count: counts.total },
    { id: "urgent", label: "Urgent & High", count: counts.urgent },
    { id: "normal", label: "General Updates", count: counts.normal },
  ];

  const filtered = useMemo(() => {
    if (priorityFilter === "urgent") {
      return items.filter(
        (a) => (a.priority || "").toLowerCase() === "high" || (a.priority || "").toLowerCase() === "urgent",
      );
    }
    if (priorityFilter === "normal") {
      return items.filter(
        (a) => (a.priority || "").toLowerCase() !== "high" && (a.priority || "").toLowerCase() !== "urgent",
      );
    }
    return items;
  }, [items, priorityFilter]);

  return (
    <div
      className="mx-auto max-w-4xl px-4 sm:px-6 md:px-8 py-12 md:py-16 text-slate-100 bg-kabaddi-court min-h-screen"
      data-testid="public-announcements"
    >
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-8">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              OFFICIAL BULLETIN
            </span>
            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-400">
              LIVE NOTICES
            </span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            Announcements
          </h1>
          <p className="max-w-xl text-sm sm:text-base text-slate-400 font-body leading-relaxed">
            Verified updates, schedule adjustments, and operational guidelines from the tournament organizing committee.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-obsidian-900 px-3.5 py-2">
          <Megaphone className="h-4 w-4 text-gold" />
          <span className="text-xs font-bold text-white font-heading">
            {items.length} Active Notices
          </span>
        </div>
      </div>

      {/* FILTER TABS */}
      {items.length > 0 && (
        <div className="mt-6 flex justify-start sm:justify-end">
          <Tabs
            items={filterTabs}
            activeTab={priorityFilter}
            onChange={(tabId) => setPriorityFilter(tabId)}
            variant="boxed"
          />
        </div>
      )}

      {/* ANNOUNCEMENT FEED */}
      {loading ? (
        <div className="py-20">
          <Spinner label="Loading official bulletins…" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No announcements posted yet"
            hint="Important bulletins regarding match fixtures, meal timings, and ceremonies will appear here."
            icon={Bell}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-4" data-testid="announcement-list">
          {filtered.map((a) => {
            const isUrgent = (a.priority || "").toLowerCase() === "high" || (a.priority || "").toLowerCase() === "urgent";
            return (
              <article
                key={a.id}
                className={`rounded-xl border p-5 sm:p-6 transition-colors shadow-sm ${
                  isUrgent
                    ? "border-coral/40 bg-gradient-to-br from-coral/10 via-obsidian-900 to-obsidian"
                    : "border-white/10 bg-obsidian-900/90 hover:border-white/20"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    {isUrgent && <AlertCircle className="h-4 w-4 text-coral shrink-0" />}
                    <h2 className="font-heading text-base sm:text-lg font-bold text-white tracking-tight">
                      {a.title}
                    </h2>
                  </div>
                  <Badge tone={priorityTone(a.priority)} size="sm">
                    {a.priority.toUpperCase()}
                  </Badge>
                </div>

                <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-300 font-body">
                  {a.message}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-slate-400 font-body">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    Published: <strong className="text-slate-300 font-medium">{formatDate(a.published_at)}</strong>
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                    <Shield className="h-3 w-3 text-gold/70" /> Official Notice #{a.id}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
