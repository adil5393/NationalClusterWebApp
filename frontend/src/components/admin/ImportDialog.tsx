import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Result { created: number; skipped: number; errors: string[] }

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
    <Dialog open={open} onClose={onClose} title={`Import ${type}`} testId="import-dialog">
      <div className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-bold text-slate-700">Expected columns</p>
          <p className="mt-1">{COLUMNS[type]}</p>
          <p className="mt-2 text-slate-400">Accepts .csv or .xlsx. The first row must be the header.</p>
        </div>
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white text-sm text-slate-500 hover:border-coral">
          <UploadCloud className="h-6 w-6" />
          {file ? file.name : "Click to choose a spreadsheet…"}
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="import-file-input" />
        </label>

        {result && (
          <div className="rounded-md border border-slate-200 p-3 text-sm" data-testid="import-result">
            <p><strong className="text-emerald-600">{result.created}</strong> created · <strong className="text-slate-500">{result.skipped}</strong> skipped</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-600">
                {result.errors.map((er, i) => <li key={i}>{er}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={upload} disabled={busy} data-testid="run-import-btn">{busy ? "Importing…" : "Import"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
