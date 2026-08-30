import { useState } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Result {
  created: number;
  skipped: number;
  errors: string[];
}

const COLUMNS: Record<string, string> = {
  teams: "name (required), school, region, country, member_count",
  participants: "team (required, must match a team name), full_name (required), role, gender, age",
};

export function ImportDialog({
  open,
  onClose,
  type,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  type: "teams" | "participants";
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file) return toast.error("Choose a .csv or .xlsx file");
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post(`/import/${type}`, fd, { headers: { "Content-Type": undefined } as any });
      setResult(r.data);
      toast.success(`Imported ${r.data.created} ${type}`);
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Batch Import ${type.toUpperCase()}`} testId="import-dialog">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-obsidian-950 p-3.5 text-xs text-slate-300 space-y-1.5">
          <p className="font-heading font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-gold" /> Expected Spreadsheet Headers
          </p>
          <p className="font-mono text-gold text-[11px] bg-gold/10 px-2 py-1 rounded border border-gold/20">
            {COLUMNS[type]}
          </p>
          <p className="text-slate-400 text-[11px]">
            Accepts <code className="text-white">.csv</code> or <code className="text-white">.xlsx</code>. The first row must match the expected column names.
          </p>
        </div>

        <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-obsidian-950 p-4 text-xs text-slate-400 hover:border-gold hover:text-white transition-all">
          <UploadCloud className="h-7 w-7 text-gold" />
          <span className="font-semibold text-center truncate max-w-full">
            {file ? file.name : "Click or drag spreadsheet (.csv, .xlsx) to upload"}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="import-file-input"
          />
        </label>

        {result && (
          <div
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-slate-200 space-y-2"
            data-testid="import-result"
          >
            <div className="flex items-center gap-2 font-heading font-bold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Import Complete
            </div>
            <p className="font-mono">
              <strong className="text-white font-bold">{result.created}</strong> records created ·{" "}
              <strong className="text-slate-400">{result.skipped}</strong> skipped
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
            data-testid="run-import-btn"
          >
            {busy ? "Importing Data…" : "Start Import"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
