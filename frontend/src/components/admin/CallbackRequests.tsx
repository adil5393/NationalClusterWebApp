import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, BedDouble, BellRing, Check, MapPin, Phone, PhoneCall, PhoneOff, RotateCcw, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { callbacksChannel, connectLive } from "@/lib/live";
import { useMe } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export interface CallbackItem {
  id: number;
  requester_name: string;
  requester_role?: string | null;
  requester_kind: "participant" | "coach";
  team_name?: string | null;
  school_code?: string | null;
  topic?: string | null;
  room?: string | null;
  // Present only when the requester shared their device location (cleared once handled).
  location?: {
    latitude: number;
    longitude: number;
    accuracy_m?: number | null;
    distance_from_campus_m: number;
    on_campus: boolean;
  } | null;
  callback_phone: string;
  message?: string | null;
  status: "PENDING" | "DONE" | "UNREACHABLE";
  created_at: string;
  staff_member_id?: number | null;
  staff_name?: string | null;
  for_me: boolean;
  unreachable_in_app: boolean;
  handled_by_name?: string | null;
  handled_at?: string | null;
}

const POLL_MS = 30_000;

/** Every logged-in account receives every call-back request (tagged with its
 * helpline); the addressee sees theirs flagged "For you". */
function useCanReceiveCallbacks(): boolean {
  const me = useMe();
  return !!me?.authenticated;
}

/** This login's call-back requests (backend GET /me/callbacks), kept fresh by
 * the nudge-only /ws/callbacks channel plus a 30 s poll as a fallback. */
export function useMyCallbacks(): { items: CallbackItem[] | null; reload: () => void; enabled: boolean } {
  const enabled = useCanReceiveCallbacks();
  const [items, setItems] = useState<CallbackItem[] | null>(null);

  const reload = useCallback(() => {
    api
      .get<CallbackItem[]>("/me/callbacks")
      .then((r) => setItems(r.data))
      .catch(() => setItems((prev) => prev ?? []));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
    const timer = setInterval(reload, POLL_MS);
    const stop = connectLive(callbacksChannel(), () => reload());
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [enabled, reload]);

  return { items, reload, enabled };
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // no audio available — the toast still shows
  }
}

function distanceText(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function locationText(c: CallbackItem): string | null {
  if (!c.location) return null;
  return c.location.on_campus
    ? `On campus${c.location.accuracy_m != null ? ` (±${c.location.accuracy_m} m)` : ""}`
    : `${distanceText(c.location.distance_from_campus_m)} from campus`;
}

function mapsUrl(c: CallbackItem): string | null {
  return c.location ? `https://www.google.com/maps?q=${c.location.latitude},${c.location.longitude}` : null;
}

function describe(c: CallbackItem): string {
  return [c.team_name, c.room ? `Room: ${c.room}` : null, locationText(c)].filter(Boolean).join(" · ");
}

/** Mounted once in AdminLayout: pops a toast (+ beep, + desktop notification
 * where allowed) whenever a NEW waiting request arrives, on any page. */
export function CallbackNotifier() {
  const { items, enabled } = useMyCallbacks();
  const me = useMe();
  const navigate = useNavigate();
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!enabled || !items) return;
    const pending = items.filter((c) => c.status === "PENDING");
    if (seen.current === null) {
      // First load: remember what's already waiting without alerting for it.
      seen.current = new Set(pending.map((c) => c.id));
      return;
    }
    const fresh = pending.filter((c) => !seen.current!.has(c.id));
    fresh.forEach((c) => seen.current!.add(c.id));
    if (fresh.length === 0) return;

    beep();
    const home = me?.is_self_service_volunteer
      ? "/admin/my-id-card"
      : me?.is_self_service_staff
        ? "/admin/my-work"
        : "/admin";
    for (const c of fresh) {
      const tags = [c.topic, c.for_me ? "For you" : c.staff_name].filter(Boolean).join(" · ");
      const title = `${tags ? `[${tags}] ` : ""}Call-back request: ${c.requester_name}`;
      const body = [describe(c), c.message ? `“${c.message}”` : null]
        .filter(Boolean)
        .join("\n");
      toast(title, {
        description: body,
        duration: 15000,
        icon: <PhoneCall className="h-4 w-4 text-emerald-400" />,
        action: { label: "View", onClick: () => navigate(home) },
      });
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(title, { body, tag: `callback-${c.id}` });
        }
      } catch {
        // desktop notifications unsupported here (e.g. inside the Android app)
      }
    }
  }, [items, enabled, me, navigate]);

  return null;
}

const STATUS_LABEL: Record<CallbackItem["status"], { label: string; cls: string }> = {
  PENDING: { label: "Waiting", cls: "border-amber-500/40 bg-amber-500/15 text-amber-300" },
  DONE: { label: "Called", cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  UNREACHABLE: { label: "Couldn't reach", cls: "border-red-500/30 bg-red-500/10 text-red-300" },
};

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString();
}

/** "Call-back Requests" panel for the Dashboard / My Work. Renders nothing
 * until there's at least one request (waiting, or handled in the last 24 h). */
export function CallbackRequestsPanel() {
  const { items, reload, enabled } = useMyCallbacks();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  if (!enabled || !items || items.length === 0) return null;

  const setStatus = async (c: CallbackItem, status: CallbackItem["status"]) => {
    setBusyId(c.id);
    try {
      await api.post(`/me/callbacks/${c.id}/status`, { status });
      reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not update the request");
    } finally {
      setBusyId(null);
    }
  };

  const waiting = items.filter((c) => c.status === "PENDING").length;

  return (
    <section className="rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.07] to-obsidian-900 p-4 space-y-3" data-testid="callback-requests">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <PhoneCall className="h-4 w-4" />
          </span>
          <h2 className="font-heading text-base font-bold text-white">Call-back Requests</h2>
          {waiting > 0 && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-mono font-bold text-amber-300">{waiting} waiting</span>
          )}
        </div>
        {notifPermission === "default" && (
          <button
            type="button"
            onClick={() => Notification.requestPermission().then(setNotifPermission)}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] font-heading font-bold text-slate-300 hover:bg-white/10"
          >
            <BellRing className="h-3 w-3" /> Enable desktop alerts
          </button>
        )}
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {items.map((c) => {
          const st = STATUS_LABEL[c.status];
          const pending = c.status === "PENDING";
          return (
            <div
              key={c.id}
              className={cn(
                "rounded-lg border bg-obsidian-950 p-3 space-y-2",
                pending ? "border-amber-500/30" : "border-white/10 opacity-70",
              )}
              data-testid={`callback-request-${c.id}`}
            >
              {(c.topic || c.staff_name || c.for_me) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.topic && (
                    <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-heading font-extrabold uppercase tracking-wide text-sky-300">
                      {c.topic}
                    </span>
                  )}
                  {c.for_me ? (
                    <span className="rounded-full border border-gold/50 bg-gold/15 px-2 py-0.5 text-[10px] font-heading font-extrabold uppercase tracking-wide text-gold">
                      For you
                    </span>
                  ) : (
                    c.staff_name && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-heading font-extrabold tracking-wide text-violet-300"
                        title="Staff member this request is for"
                      >
                        <UserRound className="h-3 w-3" /> {c.staff_name}
                        {c.unreachable_in_app && <span className="font-normal normal-case text-amber-300"> · no login</span>}
                      </span>
                    )
                  )}
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading text-sm font-bold text-white truncate">
                    {c.requester_name}
                    <span className="ml-1.5 text-[11px] font-body font-normal text-slate-400">
                      {c.requester_kind === "coach" ? c.requester_role || "Coach" : c.requester_role || "Participant"}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {c.team_name}
                    {c.school_code ? ` (${c.school_code})` : ""} · {timeAgo(c.created_at)}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-heading font-bold", st.cls)}>{st.label}</span>
              </div>

              {c.room && (
                <p className="inline-flex items-center gap-1.5 rounded-md bg-gold/10 border border-gold/30 px-2 py-1 text-xs font-heading font-bold text-gold">
                  <BedDouble className="h-3.5 w-3.5" /> {c.room}
                </p>
              )}
              {c.location ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-heading font-bold",
                      c.location.on_campus
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-red-500/40 bg-red-500/10 text-red-300",
                    )}
                    title="From the requester's device location"
                  >
                    {c.location.on_campus ? <MapPin className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {locationText(c)}
                  </span>
                  <a
                    href={mapsUrl(c)!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-heading font-bold text-sky-300 hover:underline"
                    data-testid={`callback-map-${c.id}`}
                  >
                    Open in Maps
                  </a>
                </div>
              ) : null}
              {c.message && <p className="text-xs text-slate-200 font-body italic">“{c.message}”</p>}

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <a
                  href={`tel:${c.callback_phone}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-heading font-extrabold text-obsidian hover:bg-emerald-400"
                  data-testid={`callback-call-${c.id}`}
                >
                  <Phone className="h-3.5 w-3.5" /> Call {c.callback_phone}
                </a>
                {pending ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => setStatus(c, "DONE")}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2.5 py-1.5 text-xs font-heading font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                      data-testid={`callback-done-${c.id}`}
                    >
                      <Check className="h-3.5 w-3.5" /> Called
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => setStatus(c, "UNREACHABLE")}
                      className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-heading font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50"
                      data-testid={`callback-unreachable-${c.id}`}
                    >
                      <PhoneOff className="h-3.5 w-3.5" /> Couldn't reach
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] text-slate-500">
                      {c.handled_by_name ? `by ${c.handled_by_name}` : ""}
                      {c.handled_at ? ` · ${timeAgo(c.handled_at)}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => setStatus(c, "PENDING")}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-heading font-bold text-slate-400 hover:text-white disabled:opacity-50"
                      title="Move back to waiting"
                    >
                      <RotateCcw className="h-3 w-3" /> Reopen
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
