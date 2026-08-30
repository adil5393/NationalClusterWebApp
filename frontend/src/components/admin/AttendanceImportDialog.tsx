import { useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Result {
  teams: { created: number; updated: number };
  participants: { created: number; updated: number; skipped_female: number };
  errors: string[];
}

export function AttendanceImportDialog({
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
    if (!file) return toast.error("Choose the attendance list .xlsx file");
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/import/attendance-list", fd, { headers: { "Content-Type": undefined } as any });
      setResult(r.data);
      toast.success(
        `Imported ${r.data.teams.created + r.data.teams.updated} teams, ${
          r.data.participants.created + r.data.participants.updated
        } participants`,
      );
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Import CBSE Attendance Workbook" testId="attendance-import-dialog">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs text-slate-300 space-y-2">
          <p className="font-heading font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-gold" /> Raw Attendance List Export Format
          </p>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            The tab named <strong className="text-gold font-mono">"Sheet"</strong> is read with one row per student. Teams are derived automatically by grouping students by school code.
          </p>
          <p className="text-slate-400 text-[11px] leading-relaxed border-t border-white/5 pt-1.5">
            Schools match on school code, students match on registration number — re-uploading safe for updates.
          </p>
        </div>

        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-obsidian-950 p-4 text-xs text-slate-400 hover:border-gold hover:text-white transition-all">
          <UploadCloud className="h-7 w-7 text-gold" />
          <span className="font-semibold text-center truncate max-w-full">
            {file ? file.name : "Click or drag attendance workbook (.xlsx) to upload"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="attendance-import-file-input"
          />
        </label>

        {result && (
          <div
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-slate-200 space-y-1.5"
            data-testid="attendance-import-result"
          >
            <div className="flex items-center gap-2 font-heading font-bold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Attendance Synchronization Complete
            </div>
            <p className="font-mono">
              Teams: <strong className="text-white">{result.teams.created}</strong> created ·{" "}
              <strong className="text-slate-300">{result.teams.updated}</strong> updated
            </p>
            <p className="font-mono">
              Athletes: <strong className="text-white">{result.participants.created}</strong> created ·{" "}
              <strong className="text-slate-300">{result.participants.updated}</strong> updated ·{" "}
              <strong className="text-slate-400">{result.participants.skipped_female}</strong> skipped
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-[11px] text-red-400">
                {result.errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
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
            data-testid="run-attendance-import-btn"
          >
            {busy ? "Synchronizing…" : "Start Synchronization"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
