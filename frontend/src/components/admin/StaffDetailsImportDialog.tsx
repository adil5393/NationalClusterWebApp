import { useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Result {
  staff: { in_sheet: number; created: number; updated: number; unchanged: number };
  errors: string[];
}

export function StaffDetailsImportDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"sheet" | "file">("sheet");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const applyResult = (data: Result) => {
    setResult(data);
    toast.success(
      `${data.staff.in_sheet} staff found — ${data.staff.created} added, ${data.staff.updated} updated`,
    );
    onDone();
  };

  const upload = async () => {
    if (!file) return toast.error("Choose the staff roster .xlsx/.csv file");
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/import/staff-details", fd, { headers: { "Content-Type": undefined } as any });
      applyResult(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post("/import/staff-details/sheet", {});
      applyResult(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Sync Staff Contact Details" testId="staff-details-import-dialog">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs text-slate-300 space-y-2">
          <p className="font-heading font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-gold" /> Expected Columns
          </p>
          <p className="text-slate-300 text-[11px] leading-relaxed">Full Name, Phone, Category (an ID column is fine to leave in, it's ignored).</p>
          <p className="text-slate-400 text-[11px] leading-relaxed border-t border-white/5 pt-1.5">
            Matches staff by name only — never by ID, since an ID only means something within the
            database it came from and two databases can assign it to different people. A name not
            already on file is added as a new staff member; an existing match only ever gets its
            phone/category updated in place, so re-syncing after the sheet gets more phone numbers
            filled in is always safe.
          </p>
        </div>

        <div className="flex gap-1.5 rounded-lg border border-white/10 bg-obsidian-950 p-1" data-testid="staff-details-import-mode-toggle">
          <button
            type="button"
            onClick={() => setMode("sheet")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              mode === "sheet" ? "bg-gold text-obsidian-950" : "text-slate-400 hover:text-white"
            }`}
            data-testid="staff-details-import-mode-sheet"
          >
            Google Sheet
          </button>
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              mode === "file" ? "bg-gold text-obsidian-950" : "text-slate-400 hover:text-white"
            }`}
            data-testid="staff-details-import-mode-file"
          >
            Upload File
          </button>
        </div>

        {mode === "sheet" ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs text-slate-400">
            Pulls the latest data straight from the configured staff roster Google Sheet — nothing to
            upload, just hit Resync whenever the sheet changes.
          </div>
        ) : (
          <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-obsidian-950 p-4 text-xs text-slate-400 hover:border-gold hover:text-white transition-all">
            <UploadCloud className="h-7 w-7 text-gold" />
            <span className="font-semibold text-center truncate max-w-full">
              {file ? file.name : "Click or drag the staff roster (.csv, .xlsx) to upload"}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="staff-details-import-file-input"
            />
          </label>
        )}

        {result && (
          <div
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-slate-200 space-y-1.5"
            data-testid="staff-details-import-result"
          >
            <div className="flex items-center gap-2 font-heading font-bold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Sync Complete
            </div>
            <p className="font-mono">
              Staff found in sheet: <strong className="text-white">{result.staff.in_sheet}</strong>
            </p>
            <p className="font-mono">
              Added: <strong className="text-white">{result.staff.created}</strong> · Updated:{" "}
              <strong className="text-white">{result.staff.updated}</strong> · Unchanged:{" "}
              <strong className="text-slate-300">{result.staff.unchanged}</strong>
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
            onClick={mode === "sheet" ? sync : upload}
            disabled={busy || (mode === "file" && !file)}
            data-testid="run-staff-details-import-btn"
          >
            {busy ? (
              mode === "sheet" ? "Syncing…" : "Importing…"
            ) : mode === "sheet" ? (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Resync
              </span>
            ) : (
              "Start Import"
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
