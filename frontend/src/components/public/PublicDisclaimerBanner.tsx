import { AlertTriangle, Mail } from "lucide-react";

export function PublicDisclaimerBanner() {
  return (
    <aside
      aria-label="Public notice and disclaimer"
      data-testid="public-disclaimer-banner"
      className="relative z-30 border-y border-amber-500/20 bg-gradient-to-r from-amber-950/60 via-amber-900/40 to-amber-950/60 text-slate-300"
    >
      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row lg:items-center lg:justify-between gap-1.5 sm:gap-2 lg:gap-6 px-4 py-1.5 sm:py-2 sm:px-6 md:px-8">
        {/* Left Section: Disclaimer with clear visual hierarchy */}
        <div className="flex-1 min-w-0 flex flex-col gap-1 sm:gap-1.5">
          {/* Row 1 on mobile / Primary warning: Most prominent element */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-heading font-extrabold uppercase tracking-wider text-amber-300 shrink-0">
              <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" aria-hidden="true" />
              <span>Notice</span>
            </span>
            <span className="font-bold text-amber-200 text-xs sm:text-[12.5px] leading-tight tracking-tight">
              Data may be inconsistent with official CBSE data.
            </span>
          </div>

          {/* Row 2 on mobile / Secondary disclaimer: Visually quieter and lower contrast */}
          <p className="text-[11px] sm:text-xs leading-snug text-slate-400 font-normal">
            This website is independently developed and is not affiliated with, endorsed by, sponsored by, or officially associated with the Central Board of Secondary Education (CBSE).
          </p>
        </div>

        {/* Right Section: Ownership & Contact (Least visually dominant) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 border-t border-amber-500/15 lg:border-t-0 lg:pt-0 shrink-0 text-[10.5px] sm:text-[11px] font-body text-slate-400">
          <span>
            Owned &amp; Developed by{" "}
            <span className="font-medium text-slate-200">Adil Shahid</span>
          </span>
          <span className="text-amber-500/40 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1 min-w-0">
            <span className="text-slate-500 shrink-0">Contact:</span>
            <a
              href="mailto:adil.shahid93@gmail.com"
              className="inline-flex items-center gap-1 text-amber-300/90 hover:text-amber-200 underline underline-offset-2 decoration-amber-400/40 hover:decoration-amber-300 transition-colors break-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 rounded-sm"
              title="Send email to Adil Shahid"
            >
              <Mail className="h-3 w-3 text-amber-400/80 shrink-0 hidden sm:inline" aria-hidden="true" />
              <span>adil.shahid93@gmail.com</span>
            </a>
          </span>
        </div>
      </div>
    </aside>
  );
}
