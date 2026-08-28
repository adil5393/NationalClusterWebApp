import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { priorityTone, formatDate } from "@/lib/meta";

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

  useEffect(() => {
    api.get<Announcement[]>("/public/announcements").then((r) => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-5 md:px-8 py-16 md:py-20 text-slate-100" data-testid="public-announcements">
      <span className="text-xs font-bold uppercase tracking-widest text-coral">Stay Updated</span>
      <h1 className="mt-3 font-heading text-4xl font-black tracking-tight text-white sm:text-5xl">Announcements</h1>
      <p className="mt-3 max-w-2xl text-base text-slate-400">Live updates for participants, coaches and guests.</p>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No announcements yet" hint="Important updates will appear here during the event." />
        </div>
      ) : (
        <div className="mt-10 space-y-4" data-testid="announcement-list">
          {items.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading text-lg font-bold text-white">{a.title}</h3>
                <Badge tone={priorityTone(a.priority)}>{a.priority.toUpperCase()}</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{a.message}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">{formatDate(a.published_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
