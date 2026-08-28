import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 sm:p-5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={cn("grid h-8 w-8 place-items-center rounded-md", accent ? "bg-coral text-white" : "bg-obsidian text-slate-300 border border-white/10")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 font-heading text-3xl font-black tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-xs font-semibold text-slate-400">{sub}</p>}
    </div>
  );
}
