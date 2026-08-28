import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm font-body text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-orange-500",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[80px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-body text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-orange-500",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm font-body text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-orange-500 [&>option]:bg-slate-900 [&>option]:text-white",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400", className)}
      {...props}
    />
  );
}
