import { Loader2 } from "lucide-react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400" data-testid="loading-spinner">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm font-body">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
      <p className="font-heading text-base font-bold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500 font-body">{hint}</p>}
    </div>
  );
}
