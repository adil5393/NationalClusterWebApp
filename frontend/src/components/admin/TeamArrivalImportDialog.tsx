import { useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw, Bus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Result {
  teams: { in_sheet: number; synced: number };
  unmatched_school_codes: { school_code: string; school_name: string | null }[];
  errors: string[];
}

export function TeamArrivalImportDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post("/import/team-arrivals/sheet", {});
      const data: Result = r.data;
      setResult(data);
      if (data.unmatched_school_codes.length > 0) {
        toast.warning(
          `${data.teams.in_sheet} submission(s) found — ${data.unmatched_school_codes.length} school code(s) not found`,
        );
      } else {
        toast.success(`${data.teams.in_sheet} submission(s) found — synced ${data.teams.synced} teams`);
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Sync Team Arrivals" testId="team-arrival-import-dialog">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs text-slate-300 space-y-2">
          <p className="font-heading font-bold text-white flex items-center gap-2">
            <Bus className="h-4 w-4 text-gold" /> Team Arrival Form
          </p>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Pulls the latest responses straight from the team arrival form's Google Sheet — Timestamp,
            Email address, School Code/Affiliation Number, Arriving On, Arriving At, Location. Matches
            teams by School Code (falling back to Affiliation Number), stores each school's planned
            arrival date/time/location, and shows on the Arrival Report alongside the organizer's own
            "Arrived" confirmation. A resubmitted, corrected row for the same school replaces the earlier
            one. Codes with no matching team are reported below instead of being skipped silently.
          </p>
        </div>

        {result && (
          <div className="space-y-3">
            <div
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-slate-200 space-y-1.5"
              data-testid="team-arrival-import-result"
            >
              <div className="flex items-center gap-2 font-heading font-bold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Sync Complete
              </div>
              <p className="font-mono">
                Submissions found: <strong className="text-white">{result.teams.in_sheet}</strong>
              </p>
              <p className="font-mono">
                Teams synced: <strong className="text-white">{result.teams.synced}</strong>
              </p>
              <p className="font-mono">
                Could not find: <strong className="text-white">{result.unmatched_school_codes.length}</strong>
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-[11px] text-red-400">
                  {result.errors.map((er, i) => (
                    <li key={i}>{er}</li>
                  ))}
                </ul>
              )}
            </div>

            {result.unmatched_school_codes.length > 0 && (
              <div
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-slate-200 space-y-1.5"
                data-testid="unmatched-arrival-school-codes"
              >
                <div className="flex items-center gap-2 font-heading font-bold text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> {result.unmatched_school_codes.length} School Code(s) Not Found
                </div>
                <p className="text-slate-300 text-[11px]">
                  These schools don't have a team yet — import their roster (Attendance Excel) first, then
                  re-run this sync.
                </p>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px]">
                  {result.unmatched_school_codes.map((u, i) => (
                    <li key={i} className="rounded bg-black/20 px-2 py-1 text-amber-300">
                      {u.school_code}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="gold" size="sm" onClick={sync} disabled={busy} data-testid="run-team-arrival-import-btn">
            {busy ? (
              "Syncing…"
            ) : (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Resync
              </span>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
