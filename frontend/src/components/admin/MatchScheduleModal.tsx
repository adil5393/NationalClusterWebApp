import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Activity,
  Trash2,
  AlertCircle,
  Timer,
  CheckCircle2,
  CalendarDays,
  Flame,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Tone } from "@/components/ui/badge";
import { Input, Select, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MatT {
  id: number;
  name: string;
}

export interface MatchScheduleT {
  id: number;
  tournament_name?: string | null;
  round_name?: string | null;
  pool_name?: string | null;
  team_a_id?: number | null;
  team_a_name?: string | null;
  team_b_id?: number | null;
  team_b_name?: string | null;
  status: string;
  mat_id?: number | null;
  mat_name?: string | null;
  venue_name?: string | null;
  scheduled_at?: string | null;
  scheduled_end_at?: string | null;
}

interface MatchScheduleModalProps {
  open: boolean;
  onClose: () => void;
  match: MatchScheduleT | null;
  mats: MatT[];
  onSave: (params: {
    matchId: number;
    matId?: number | null;
    scheduled_at: string | null;
    scheduled_end_at: string | null;
  }) => Promise<void>;
}

// Helpers
function pad(n: number): string {
  return String(n).padStart(2, "0");
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

function combineIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const totalMins = h * 60 + m + minutes;
  const newH = Math.floor((totalMins / 60) % 24);
  const newM = totalMins % 60;
  return `${pad(newH)}:${pad(newM)}`;
}

function calculateDurationMinutes(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return null;
  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  const diff = endTotal - startTotal;
  return diff > 0 ? diff : null;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "No date selected";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime12h(timeStr: string): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${period}`;
}

const DURATION_PRESETS = [
  { label: "30 min", mins: 30, hint: "Quick" },
  { label: "45 min", mins: 45, hint: "Standard Match" },
  { label: "60 min", mins: 60, hint: "Full 1 Hr" },
  { label: "75 min", mins: 75, hint: "With Review" },
  { label: "90 min", mins: 90, hint: "Extended" },
];

const STATUS_TONES: Record<string, Tone> = {
  ONGOING: "green",
  PAUSED: "amber",
  SCHEDULED: "blue",
  COMPLETED: "slate",
  CANCELLED: "red",
};

export function MatchScheduleModal({
  open,
  onClose,
  match,
  mats,
  onSave,
}: MatchScheduleModalProps) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [matId, setMatId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [activeDuration, setActiveDuration] = useState<number | null>(45);

  // Sync state when modal opens with a match
  useEffect(() => {
    if (match && open) {
      const { date: d, time: st } = splitIso(match.scheduled_at);
      const { time: et } = splitIso(match.scheduled_end_at);
      
      // Default to today if no date set
      const todayIso = new Date();
      const defaultDate = `${todayIso.getFullYear()}-${pad(todayIso.getMonth() + 1)}-${pad(todayIso.getDate())}`;

      setDate(d || defaultDate);
      setStartTime(st || "10:00");
      
      if (st && et) {
        setEndTime(et);
        const dur = calculateDurationMinutes(st, et);
        setActiveDuration(dur);
      } else if (st) {
        const defaultEnd = addMinutesToTime(st, 45);
        setEndTime(defaultEnd);
        setActiveDuration(45);
      } else {
        setEndTime("10:45");
        setActiveDuration(45);
      }

      setMatId(match.mat_id ? String(match.mat_id) : "");
    }
  }, [match, open]);

  if (!match) return null;

  // Generate Quick Date Options (Today, Tomorrow, +2 Days, +3 Days)
  const quickDates = [0, 1, 2, 3].map((offset) => {
    const target = new Date();
    target.setDate(target.getDate() + offset);
    const dateValue = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
    const label =
      offset === 0
        ? "Today"
        : offset === 1
        ? "Tomorrow"
        : target.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    return { dateValue, label };
  });

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    if (activeDuration && newStart) {
      setEndTime(addMinutesToTime(newStart, activeDuration));
    } else if (newStart && endTime) {
      setActiveDuration(calculateDurationMinutes(newStart, endTime));
    }
  };

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd);
    if (startTime && newEnd) {
      const dur = calculateDurationMinutes(startTime, newEnd);
      setActiveDuration(dur);
    }
  };

  const applyDurationPreset = (mins: number) => {
    setActiveDuration(mins);
    if (startTime) {
      setEndTime(addMinutesToTime(startTime, mins));
    }
  };

  const durationMins = calculateDurationMinutes(startTime, endTime);
  const isInvalidTimeRange = startTime && endTime && (durationMins === null || durationMins <= 0);

  const handleSave = async () => {
    if (!date && (startTime || endTime)) {
      return;
    }
    if (startTime && !endTime) {
      return;
    }
    if (isInvalidTimeRange) {
      return;
    }

    setSubmitting(true);
    try {
      const scheduled_at = date && startTime ? combineIso(date, startTime) : null;
      const scheduled_end_at = date && endTime ? combineIso(date, endTime) : null;
      const parsedMatId = matId ? Number(matId) : null;

      await onSave({
        matchId: match.id,
        matId: parsedMatId,
        scheduled_at,
        scheduled_end_at,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearSchedule = async () => {
    setSubmitting(true);
    try {
      await onSave({
        matchId: match.id,
        matId: matId ? Number(matId) : match.mat_id ?? null,
        scheduled_at: null,
        scheduled_end_at: null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const isCurrentlyScheduled = Boolean(match.scheduled_at && match.scheduled_end_at);
  const selectedMat = mats.find((m) => String(m.id) === matId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Match Date & Time Scheduling"
      className="max-w-xl"
      testId="match-schedule-modal"
    >
      <div className="space-y-5">
        {/* MATCH HERO BANNER */}
        <div className="rounded-xl border border-white/10 bg-obsidian-950/90 p-4 space-y-3 relative overflow-hidden shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-400">Match #{match.id}</span>
              <Badge tone={STATUS_TONES[match.status] ?? "neutral"} size="sm">
                {match.status}
              </Badge>
            </div>
            {match.tournament_name && (
              <span className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-gold truncate max-w-[200px]">
                {match.tournament_name}
              </span>
            )}
          </div>

          {/* Teams Header */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" title="Red Side" />
                <p className="font-heading font-black text-sm sm:text-base text-white truncate">
                  {match.team_a_name ?? "TBD"}
                </p>
              </div>
            </div>

            <div className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-heading font-black text-slate-400 tracking-wider">
              VS
            </div>

            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center justify-end gap-2">
                <p className="font-heading font-black text-sm sm:text-base text-white truncate">
                  {match.team_b_name ?? "TBD"}
                </p>
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" title="Blue Side" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400 font-body border-t border-white/5">
            {match.round_name && (
              <span className="flex items-center gap-1 text-slate-300">
                <Activity className="h-3 w-3 text-gold" />
                {match.round_name} {match.pool_name ? `· ${match.pool_name}` : ""}
              </span>
            )}
            {match.venue_name && (
              <span className="flex items-center gap-1 text-slate-400">
                <MapPin className="h-3 w-3 text-slate-500" />
                {match.venue_name}
              </span>
            )}
          </div>
        </div>

        {/* COURT / MAT ASSIGNMENT SELECTOR */}
        <div className="space-y-1.5">
          <Label className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white">
              <Activity className="h-3.5 w-3.5 text-gold" />
              Assigned Mat / Ground
            </span>
            <span className="text-[10px] font-normal text-slate-400">Court allocation</span>
          </Label>
          <Select
            value={matId}
            onChange={(e) => setMatId(e.target.value)}
            data-testid="modal-mat-select"
            className="h-10 text-sm font-body border-white/15 bg-obsidian-950"
          >
            <option value="">— Unassigned (Select Mat / Ground) —</option>
            {mats.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>

        {/* DATE SELECTION SECTION */}
        <div className="space-y-2">
          <Label className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-white">
              <CalendarDays className="h-3.5 w-3.5 text-gold" />
              Match Date
            </span>
            <span className="text-[11px] font-heading font-bold text-gold">
              {formatDisplayDate(date)}
            </span>
          </Label>

          {/* Quick Date Chips */}
          <div className="flex flex-wrap gap-2">
            {quickDates.map((qd) => (
              <button
                key={qd.dateValue}
                type="button"
                onClick={() => setDate(qd.dateValue)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-heading font-bold transition-all border",
                  date === qd.dateValue
                    ? "bg-gold text-obsidian border-gold shadow-sm"
                    : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white"
                )}
              >
                {qd.label}
              </button>
            ))}
          </div>

          <div className="pt-1">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 text-sm font-body border-white/15 bg-obsidian-950"
              data-testid="modal-schedule-date-input"
            />
          </div>
        </div>

        {/* TIME SLOT & DURATION SECTION */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-white mb-0">
              <Clock className="h-3.5 w-3.5 text-gold" />
              Time Window & Duration
            </Label>
            {durationMins !== null && durationMins > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-300">
                <Timer className="h-3 w-3" />
                {durationMins >= 60
                  ? `${Math.floor(durationMins / 60)}h ${durationMins % 60 ? `${durationMins % 60}m` : ""}`
                  : `${durationMins} mins`}
              </span>
            )}
          </div>

          {/* Duration Presets */}
          <div className="grid grid-cols-5 gap-1.5">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.mins}
                type="button"
                onClick={() => applyDurationPreset(preset.mins)}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg p-2 text-center transition-all border",
                  activeDuration === preset.mins
                    ? "bg-gold/20 border-gold text-gold font-bold shadow-sm"
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <span className="text-xs font-heading font-bold">{preset.label}</span>
                <span className="text-[9px] text-slate-400 font-mono mt-0.5">{preset.hint}</span>
              </button>
            ))}
          </div>

          {/* Start and End Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-heading font-semibold text-slate-400 mb-1">
                Start Time
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="h-10 text-sm font-body border-white/15 bg-obsidian-950"
                data-testid="modal-schedule-start-input"
              />
              {startTime && (
                <span className="block mt-1 text-[10px] font-mono text-slate-400 text-right">
                  {formatTime12h(startTime)}
                </span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-heading font-semibold text-slate-400 mb-1">
                End Time
              </label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                className={cn(
                  "h-10 text-sm font-body bg-obsidian-950",
                  isInvalidTimeRange ? "border-red-500 focus:border-red-500" : "border-white/15"
                )}
                data-testid="modal-schedule-end-input"
              />
              {endTime && (
                <span className="block mt-1 text-[10px] font-mono text-slate-400 text-right">
                  {formatTime12h(endTime)}
                </span>
              )}
            </div>
          </div>

          {isInvalidTimeRange && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>End time must be after start time on the same day.</span>
            </div>
          )}
        </div>

        {/* LIVE SCHEDULE PREVIEW CARD */}
        {date && startTime && endTime && !isInvalidTimeRange && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-heading font-black tracking-wider uppercase text-gold">
                <Flame className="h-3.5 w-3.5 text-gold animate-pulse" />
                Schedule Fixture Preview
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                Public Broadcast Slot
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-body">
              <div>
                <p className="font-heading font-bold text-white">
                  {formatDisplayDate(date)} · {formatTime12h(startTime)} – {formatTime12h(endTime)}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Duration:{" "}
                  <span className="text-gold font-mono font-bold">{durationMins} minutes</span>
                  {selectedMat ? ` · Assigned to ${selectedMat.name}` : " · No mat assigned yet"}
                </p>
              </div>

              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 text-emerald-300 px-2 py-1 text-xs font-bold">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Slot Ready
              </span>
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-white/10">
          <div>
            {isCurrentlyScheduled && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={submitting}
                onClick={handleClearSchedule}
                data-testid="modal-clear-schedule-btn"
                className="text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Schedule
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              disabled={submitting || isInvalidTimeRange || !date || !startTime || !endTime}
              onClick={handleSave}
              data-testid="modal-save-schedule-btn"
              className="text-xs font-black shadow-md"
            >
              {submitting ? "Saving Slot…" : "Save & Apply Schedule"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
