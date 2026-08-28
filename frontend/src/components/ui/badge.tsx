import { cn } from "@/lib/utils";

type Tone = "neutral" | "coral" | "green" | "blue" | "amber" | "red" | "slate";

const tones: Record<Tone, string> = {
  neutral: "bg-white/5 text-slate-300 border-white/10",
  coral: "bg-coral/15 text-coral border-coral/30",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  slate: "bg-slate-800 text-slate-200 border-slate-700",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold font-body",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
