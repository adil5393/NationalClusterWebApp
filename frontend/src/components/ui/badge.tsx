import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type Tone =
  | "neutral"
  | "coral"
  | "green"
  | "blue"
  | "amber"
  | "gold"
  | "saffron"
  | "red"
  | "slate"
  | "live"
  | "cyan"
  | "purple";

const tones: Record<Tone, string> = {
  neutral: "bg-white/5 text-slate-300 border-white/10",
  coral: "bg-coral/15 text-coral border-coral/30",
  gold: "bg-gold/15 text-gold border-gold/30",
  saffron: "bg-saffron/15 text-saffron-400 border-saffron/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  live: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-[0_0_12px_-2px_rgba(16,185,129,0.3)]",
  cyan: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  slate: "bg-slate-800/90 text-slate-200 border-slate-700",
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export const Badge = forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; size?: "sm" | "md" | "lg" }
>(({ tone = "neutral", size = "sm", className, children, ...props }, ref) => {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs font-semibold",
    md: "px-2.5 py-1 text-xs font-bold",
    lg: "px-3 py-1.5 text-sm font-bold",
  }[size];

  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-body tracking-wide transition-colors",
        tones[tone] || tones.neutral,
        sizeClasses,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
});
Badge.displayName = "Badge";

export function LiveBadge({
  label = "LIVE",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-0.5 text-xs font-black font-heading tracking-wider text-emerald-300 shadow-[0_0_12px_-2px_rgba(16,185,129,0.4)]",
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-live-dot" />
      {label}
    </span>
  );
}

export function ChampionshipBadge({
  label = "NATIONALS 2026–27",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-black font-heading tracking-wider text-gold shadow-[0_0_12px_-2px_rgba(245,158,11,0.25)]",
        className,
      )}
    >
      {label}
    </span>
  );
}
