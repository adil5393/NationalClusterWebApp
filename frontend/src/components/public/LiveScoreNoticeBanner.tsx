import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveScoreNoticeBannerProps {
  className?: string;
}

export function LiveScoreNoticeBanner({ className }: LiveScoreNoticeBannerProps) {
  return (
    <div
      role="note"
      aria-label="Official scores notice"
      data-testid="live-score-notice-banner"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-body text-amber-200/90 shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400 shrink-0" aria-hidden="true" />
      <span className="font-semibold text-amber-200 tracking-wide">
        Check Official Table for Latest Scores
      </span>
    </div>
  );
}
