import { Loader2 } from "lucide-react";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400" data-testid="loading-spinner">
      <Loader2 className="h-5 w-5 animate-spin text-coral" />
      <span className="text-sm font-body">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/5 px-6 py-14 text-center">
      <p className="font-heading text-base font-bold text-white">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-400 font-body">{hint}</p>}
    </div>
  );
}
