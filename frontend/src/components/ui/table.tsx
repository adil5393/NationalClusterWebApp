import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Table = forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto rounded-lg border border-white/10 bg-obsidian-900/60 shadow-sm">
      <table
        ref={ref}
        className={cn("w-full border-collapse text-sm font-body text-slate-200", className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-white/10 bg-obsidian-800/80 text-xs font-bold uppercase tracking-wider text-slate-400 font-heading", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-white/5", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left align-middle font-bold text-slate-300 font-heading tracking-wider",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-white/[0.04] data-[state=selected]:bg-white/[0.08]",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-3 text-slate-200 align-middle text-sm font-body", className)}
      {...props}
    />
  );
}

export function TFoot({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={cn("border-t border-white/10 bg-obsidian-800/60 font-medium text-slate-300", className)}
      {...props}
    />
  );
}
