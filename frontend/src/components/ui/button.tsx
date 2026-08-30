import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "gold"
  | "coral"
  | "outline"
  | "ghost"
  | "danger"
  | "dark"
  | "live"
  | "secondary";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-coral text-white hover:bg-coral-600 shadow-sm transition-colors",
  gold: "bg-gold text-obsidian font-black hover:bg-amber-400 shadow-sm transition-colors",
  coral: "bg-coral text-white hover:bg-coral-600 shadow-sm transition-colors",
  secondary: "bg-obsidian-800 text-slate-200 hover:bg-obsidian-700 border border-white/10 transition-colors",
  dark: "bg-obsidian-900 text-white hover:bg-obsidian-800 border border-white/10 transition-colors",
  outline: "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white transition-colors",
  ghost: "text-slate-400 hover:bg-white/10 hover:text-white transition-colors",
  danger: "border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors",
  live: "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs font-semibold",
  sm: "h-8 px-3 text-xs font-semibold",
  md: "h-10 px-4 text-sm font-semibold",
  lg: "h-12 px-6 text-base font-bold",
  icon: "h-9 w-9 p-0",
  "icon-sm": "h-8 w-8 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-body tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
