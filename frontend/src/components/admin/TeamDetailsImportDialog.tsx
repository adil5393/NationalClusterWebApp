import { useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Result {
  teams: { updated: number };
  coaches: { created: number; updated: number };
  photos: { added: number };
  unmatched_school_codes: { school_code: string; school_name: string }[];
  errors: string[];
}

export function TeamDetailsImportDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file) return toast.error("Choose the school registration form .xlsx file");
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/import/team-details", fd, { headers: { "Content-Type": undefined } as any });
      setResult(r.data);
      if (r.data.unmatched_school_codes.length > 0) {
        toast.warning(`${r.data.unmatched_school_codes.length} school code(s) have no matching team yet`);
      } else {
        toast.success(`Synced ${r.data.teams.updated} teams`);
      }
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Import School Registration Form" testId="team-details-import-dialog">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs text-slate-300 space-y-2">
          <p className="font-heading font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-gold" /> Expected Columns
          </p>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            School Name, Coach Name(s) (comma-separated), Manager Name, Contact Number of Coach(es)
            (comma-separated, matched by position), Email address, Total Members, Team Photo link
            (Google Drive share link), School Code.
          </p>
          <p className="text-slate-400 text-[11px] leading-relaxed border-t border-white/5 pt-1.5">
            Matches teams by School Code — a team has to already exist (import the attendance/roster
            list first) before this can attach a coach, manager, or photo to it. Codes with no matching
            team are reported below instead of being skipped silently. Re-uploading a corrected sheet is
            safe, existing rows are only ever updated, never duplicated.
          </p>
        </div>

        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-obsidian-950 p-4 text-xs text-slate-400 hover:border-gold hover:text-white transition-all">
          <UploadCloud className="h-7 w-7 text-gold" />
          <span className="font-semibold text-center truncate max-w-full">
            {file ? file.name : "Click or drag the registration form (.csv, .xlsx) to upload"}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="team-details-import-file-input"
          />
        </label>

        {result && (
          <div className="space-y-3">
            <div
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-slate-200 space-y-1.5"
              data-testid="team-details-import-result"
            >
              <div className="flex items-center gap-2 font-heading font-bold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Import Complete
              </div>
              <p className="font-mono">
                Teams updated: <strong className="text-white">{result.teams.updated}</strong>
              </p>
              <p className="font-mono">
                Coaches/Managers: <strong className="text-white">{result.coaches.created}</strong> created ·{" "}
                <strong className="text-slate-300">{result.coaches.updated}</strong> updated
              </p>
              <p className="font-mono">
                Photos added: <strong className="text-white">{result.photos.added}</strong>
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
                data-testid="unmatched-school-codes"
              >
                <div className="flex items-center gap-2 font-heading font-bold text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> {result.unmatched_school_codes.length} School Code(s) Not Found
                </div>
                <p className="text-slate-300 text-[11px]">
                  These schools don't have a team yet — import their roster (Attendance Excel) first, then
                  re-run this import.
                </p>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px]">
                  {result.unmatched_school_codes.map((u, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
                      <span className="text-amber-300">{u.school_code}</span>
                      <span className="truncate text-slate-400">{u.school_name}</span>
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
          <Button
            variant="gold"
            size="sm"
            onClick={upload}
            disabled={busy || !file}
            data-testid="run-team-details-import-btn"
          >
            {busy ? "Importing…" : "Start Import"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
