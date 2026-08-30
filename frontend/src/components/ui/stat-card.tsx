import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  tone?: "gold" | "coral" | "live" | "blue" | "neutral";
  testId?: string;
  trend?: { value: string; positive?: boolean };
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ icon: Icon, label, value, sub, accent, tone = "neutral", testId, trend, className, ...props }, ref) => {
    const isGold = accent || tone === "gold";
    const isCoral = tone === "coral";
    const isLive = tone === "live";
    const isBlue = tone === "blue";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border p-4 sm:p-5 transition-colors shadow-sm",
          isGold
            ? "border-gold/30 bg-obsidian-900 shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]"
            : isCoral
            ? "border-coral/30 bg-obsidian-900 shadow-[0_0_15px_-3px_rgba(255,69,0,0.15)]"
            : isLive
            ? "border-emerald-500/30 bg-obsidian-900 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]"
            : "border-white/10 bg-obsidian-900 hover:border-white/20",
          className,
        )}
        data-testid={testId}
        {...props}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-heading truncate">
            {label}
          </span>
          {Icon && (
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md shrink-0",
                isGold
                  ? "bg-gold text-obsidian font-bold shadow-sm"
                  : isCoral
                  ? "bg-coral text-white font-bold shadow-sm"
                  : isLive
                  ? "bg-emerald-500 text-obsidian font-bold shadow-sm"
                  : isBlue
                  ? "bg-blue-500 text-white font-bold shadow-sm"
                  : "border border-white/10 bg-white/5 text-slate-300",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
        <p className="mt-3 font-heading text-2xl font-black tracking-tight text-white sm:text-3xl tabular-nums">
          {value}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          {sub && <p className="text-xs font-medium text-slate-400 font-body truncate">{sub}</p>}
          {trend && (
            <span
              className={cn(
                "text-[11px] font-bold font-mono",
                trend.positive ? "text-emerald-400" : "text-slate-400",
              )}
            >
              {trend.value}
            </span>
          )}
        </div>
      </div>
    );
  },
);
StatCard.displayName = "StatCard";
