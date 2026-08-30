import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  courtPattern = true,
  className,
  containerClassName,
}: {
  children: React.ReactNode;
  courtPattern?: boolean;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-screen bg-obsidian text-slate-100",
        courtPattern && "bg-kabaddi-court",
        className,
      )}
    >
      <div className={cn("mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 md:px-8", containerClassName)}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  kicker,
  badge,
  actions,
  backTo,
  backLabel = "Back",
  className,
}: {
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  kicker?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  backTo?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="space-y-1.5">
        {backTo && (
          <Link
            to={backTo}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-gold transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          {kicker && (
            <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
              {kicker}
            </span>
          )}
          {badge}
        </div>
        <h1 className="font-heading text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <div className="text-sm font-body text-slate-400 max-w-3xl leading-relaxed">
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  badge,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-lg font-bold tracking-tight text-white sm:text-xl">
            {title}
          </h2>
          {badge}
        </div>
        {subtitle && <p className="text-xs text-slate-400 font-body">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function BroadcastTicker({
  text,
  badge = "NOTICE",
  className,
}: {
  text: string;
  badge?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 overflow-hidden rounded-lg border border-gold/30 bg-gold/10 px-4 py-2 text-xs text-slate-200 shadow-sm",
        className,
      )}
    >
      <span className="rounded bg-gold px-2 py-0.5 font-heading text-[10px] font-black uppercase text-obsidian tracking-wider shrink-0">
        {badge}
      </span>
      <p className="truncate font-body font-medium text-slate-200">{text}</p>
    </div>
  );
}
