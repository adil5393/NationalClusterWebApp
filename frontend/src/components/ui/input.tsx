import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-white/15 bg-obsidian-900/90 px-3 text-sm font-body text-white placeholder:text-slate-500 transition-colors focus:border-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-gold disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, onChange, ...props }, ref) => (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        ref={ref}
        value={value}
        onChange={onChange}
        className={cn(
          "h-10 w-full rounded-md border border-white/15 bg-obsidian-900/90 pl-9 pr-8 text-sm font-body text-white placeholder:text-slate-500 transition-colors focus:border-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-gold",
          className,
        )}
        {...props}
      />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-white"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  ),
);
SearchInput.displayName = "SearchInput";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[80px] w-full rounded-md border border-white/15 bg-obsidian-900/90 px-3 py-2 text-sm font-body text-white placeholder:text-slate-500 transition-colors focus:border-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-gold disabled:opacity-50",
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
      "h-10 w-full rounded-md border border-white/15 bg-obsidian-900 px-3 text-sm font-body text-white transition-colors focus:border-gold focus:outline-none focus-visible:ring-1 focus-visible:ring-gold [&>option]:bg-obsidian-900 [&>option]:text-white",
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
      className={cn("mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400 font-heading", className)}
      {...props}
    />
  );
}
