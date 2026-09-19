import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Calendar, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MatOption {
  id: number;
  name: string;
}

export interface SlotMatch {
  id: number;
  mat_id?: number | null;
  scheduled_at?: string | null;
  scheduled_end_at?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatReadableDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!isNaN(month) && month >= 1 && month <= 12 && !isNaN(day)) {
      return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
    }
  }
  return dateStr;
}

function splitIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function toIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function label12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

// 15-minute slots across the day.
const TIME_SLOTS: string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

// Shared across every editor on the page so a list of fixtures makes one request.
let matsPromise: Promise<MatOption[]> | null = null;
let matsFetchedAt = 0;
function loadMats(): Promise<MatOption[]> {
  if (!matsPromise || Date.now() - matsFetchedAt > 30_000) {
    matsFetchedAt = Date.now();
    matsPromise = api
      .get<MatOption[]>("/mats")
      .then((r) => r.data)
      .catch((e) => {
        matsPromise = null;
        throw e;
      });
  }
  return matsPromise;
}

/** Inline Court / Date / Start / End dropdowns for one fixture. Saves through
 * PUT /matches/{id}/mat (the same endpoint as the Mat / Ground page), so the
 * server's overlap check and validation apply here too. */
export function MatchSlotEditor({
  match,
  onSaved,
  className,
  disabled,
}: {
  match: SlotMatch;
  onSaved: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [mats, setMats] = useState<MatOption[]>([]);
  const start = splitIso(match.scheduled_at);
  const end = splitIso(match.scheduled_end_at);
  const [matId, setMatId] = useState(match.mat_id ? String(match.mat_id) : "");
  const [date, setDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(end.time);
  const [saving, setSaving] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMats().then(setMats).catch(() => {});
  }, []);

  // Re-seed when the server copy changes (after a save/refresh elsewhere).
  useEffect(() => {
    const s = splitIso(match.scheduled_at);
    const e = splitIso(match.scheduled_end_at);
    setMatId(match.mat_id ? String(match.mat_id) : "");
    setDate(s.date);
    setStartTime(s.time);
    setEndTime(e.time);
  }, [match.mat_id, match.scheduled_at, match.scheduled_end_at]);

  const dirty = useMemo(
    () =>
      matId !== (match.mat_id ? String(match.mat_id) : "") ||
      date !== start.date ||
      startTime !== start.time ||
      endTime !== end.time,
    [matId, date, startTime, endTime, match.mat_id, start.date, start.time, end.time],
  );

  const onStartChange = (value: string) => {
    setStartTime(value);
    if (value && (!endTime || endTime <= value)) setEndTime(addMinutes(value, 45));
  };

  const save = async () => {
    if ((date || startTime) && !(date && startTime)) {
      return toast.error("Pick both a date and a start time");
    }
    if (startTime && endTime && endTime <= startTime) {
      return toast.error("End time must be after start time");
    }
    setSaving(true);
    try {
      await api.put(`/matches/${match.id}/mat`, {
        mat_id: matId ? Number(matId) : null,
        scheduled_at: toIso(date, startTime),
        scheduled_end_at: toIso(date, endTime),
      });
      toast.success("Court & time saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save court & time");
    } finally {
      setSaving(false);
    }
  };

  const isControlDisabled = disabled || saving;
  const field = "h-7 text-xs px-2 py-0";

  return (
    <div className={cn("w-full max-w-[230px] space-y-1", className)} data-testid={`slot-editor-${match.id}`}>
      {/* Row 1: Mat & Date */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
        <div className="flex-[5] min-w-[70px]">
          <Select
            value={matId}
            disabled={isControlDisabled}
            onChange={(e) => setMatId(e.target.value)}
            className={cn(field, "w-full min-w-0 pr-4 text-xs font-body truncate")}
            aria-label="Court"
            title={mats.find((m) => String(m.id) === matId)?.name ?? "No court"}
            data-testid={`slot-court-${match.id}`}
          >
            <option value="">No court</option>
            {mats.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="relative flex-[6] min-w-[95px]">
          <div
            className={cn(
              field,
              "w-full flex items-center justify-between gap-1 rounded-md border border-white/15 bg-obsidian-900 font-body text-xs text-white transition-colors hover:border-white/30 focus-within:border-gold focus-within:ring-1 focus-within:ring-gold cursor-pointer select-none",
              isControlDisabled && "opacity-50 pointer-events-none cursor-not-allowed",
            )}
          >
            <span className={cn("truncate font-body", !date ? "text-slate-500" : "text-slate-200")}>
              {date ? formatReadableDate(date) : "Pick date"}
            </span>
            <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
          </div>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            disabled={isControlDisabled}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
            title={date ? formatReadableDate(date) : "Select date"}
            data-testid={`slot-date-${match.id}`}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [color-scheme:dark] disabled:cursor-not-allowed"
            onClick={(e) => {
              try {
                (e.currentTarget as any).showPicker?.();
              } catch {}
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                try {
                  (e.currentTarget as any).showPicker?.();
                } catch {}
              }
            }}
          />
        </div>
      </div>

      {/* Row 2: Start Time & End Time */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1">
        <div className="flex-1 min-w-[65px]">
          <Select
            value={startTime}
            disabled={isControlDisabled}
            onChange={(e) => onStartChange(e.target.value)}
            className={cn(field, "w-full min-w-0 pr-4 text-xs font-body")}
            aria-label="Start time"
            title={startTime ? `Start: ${label12h(startTime)}` : "Start time"}
            data-testid={`slot-start-${match.id}`}
          >
            <option value="">Start</option>
            {startTime && !TIME_SLOTS.includes(startTime) && <option value={startTime}>{label12h(startTime)}</option>}
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>
                {label12h(t)}
              </option>
            ))}
          </Select>
        </div>

        <ArrowRight className="h-3 w-3 text-slate-500 shrink-0 select-none" aria-hidden="true" />

        <div className="flex-1 min-w-[65px]">
          <Select
            value={endTime}
            disabled={isControlDisabled}
            onChange={(e) => setEndTime(e.target.value)}
            className={cn(field, "w-full min-w-0 pr-4 text-xs font-body")}
            aria-label="End time"
            title={endTime ? `End: ${label12h(endTime)}` : "End time"}
            data-testid={`slot-end-${match.id}`}
          >
            <option value="">End</option>
            {endTime && !TIME_SLOTS.includes(endTime) && <option value={endTime}>{label12h(endTime)}</option>}
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>
                {label12h(t)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {dirty && (
        <div className="flex items-center justify-end pt-0.5">
          <button
            type="button"
            onClick={save}
            disabled={isControlDisabled}
            data-testid={`slot-save-${match.id}`}
            className="inline-flex items-center gap-1 rounded bg-gold px-2 py-0.5 text-[11px] font-heading font-extrabold text-obsidian hover:bg-gold/90 disabled:opacity-60 transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
          </button>
        </div>
      )}
    </div>
  );
}
