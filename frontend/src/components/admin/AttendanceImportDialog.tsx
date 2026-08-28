import { useState } from "react";
import { UploadCloud } from "lucide-react";
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
      toast.success(`Imported ${r.data.teams.created + r.data.teams.updated} teams, ${r.data.participants.created + r.data.participants.updated} participants`);
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Import Attendance List" testId="attendance-import-dialog">
      <div className="space-y-4">
        <div className="rounded-md bg-white/5 p-3 text-xs text-slate-300 border border-white/5">
          <p className="font-bold text-white">Upload the raw attendance list export</p>
          <p className="mt-1 text-slate-300">
            The same file you already export. Only its tab literally named <strong>"Sheet"</strong> is read
            (one row per student) — the file must contain a tab with that exact name, any other tabs are
            ignored. Teams are derived automatically by grouping students by school code, so there's no
            need to prepare separate files.
          </p>
          <p className="mt-2 text-slate-400">
            Schools are matched by school code, students by registration number, so re-uploading a newer
            export — a new team, or more players added to an existing one — only adds what's new instead
            of duplicating existing records. Only male students are imported.
          </p>
        </div>
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-white/5 text-sm text-slate-400 hover:border-coral hover:text-white">
          <UploadCloud className="h-6 w-6 text-coral" />
          {file ? file.name : "Click to choose the attendance list…"}
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="attendance-import-file-input" />
        </label>

        {result && (
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-slate-200" data-testid="attendance-import-result">
            <p>
              Teams: <strong className="text-emerald-400">{result.teams.created}</strong> created ·{" "}
              <strong className="text-slate-400">{result.teams.updated}</strong> updated
            </p>
            <p className="mt-1">
              Participants: <strong className="text-emerald-400">{result.participants.created}</strong> created ·{" "}
              <strong className="text-slate-400">{result.participants.updated}</strong> updated ·{" "}
              <strong className="text-slate-400">{result.participants.skipped_female}</strong> female skipped
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-400">
                {result.errors.map((er, i) => <li key={i}>{er}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={upload} disabled={busy} data-testid="run-attendance-import-btn">{busy ? "Importing…" : "Import"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
