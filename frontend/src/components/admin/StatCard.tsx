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
    <div className="rounded-lg border border-slate-200 bg-white p-5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={cn("grid h-8 w-8 place-items-center rounded-md", accent ? "bg-coral text-white" : "bg-slate-900 text-white")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 font-heading text-3xl font-black tracking-tight text-slate-950">{value}</p>
      {sub && <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>}
    </div>
  );
}
