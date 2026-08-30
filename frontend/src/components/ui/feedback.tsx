import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-slate-400", className)}
      data-testid="loading-spinner"
    >
      <div className="relative">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
        <div className="absolute inset-0 rounded-full blur-sm bg-gold/20 animate-pulse" />
      </div>
      <span className="text-sm font-body font-medium tracking-wide text-slate-300">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon: Icon = AlertCircle,
  action,
  className,
}: {
  title: string;
  hint?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-white/15 bg-obsidian-900/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white/5 border border-white/10 text-slate-400">
        <Icon className="h-6 w-6 text-gold/70" />
      </div>
      <p className="mt-4 font-heading text-base font-bold text-white">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-400 font-body leading-relaxed">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/10", className)}
      {...props}
    />
  );
}

export function Progress({
  value = 0,
  max = 100,
  className,
  tone = "gold",
}: {
  value?: number;
  max?: number;
  className?: string;
  tone?: "gold" | "coral" | "live" | "blue";
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const toneClasses = {
    gold: "bg-gold",
    coral: "bg-coral",
    live: "bg-emerald-500",
    blue: "bg-blue-500",
  }[tone];

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <div
        className={cn("h-full transition-all duration-300", toneClasses)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
