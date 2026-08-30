import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "interactive" | "live" | "gold" | "flat";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: "border-white/10 bg-obsidian-900 shadow-sm",
      elevated: "border-white/15 bg-obsidian-800 shadow-md",
      interactive: "border-white/10 bg-obsidian-900 hover:border-gold/50 hover:bg-obsidian-800/80 transition-colors shadow-sm",
      live: "border-emerald-500/40 bg-obsidian-900 shadow-[0_0_15px_-3px_rgba(16,185,129,0.25)]",
      gold: "border-gold/40 bg-obsidian-900 shadow-[0_0_20px_-3px_rgba(245,158,11,0.2)]",
      flat: "border-white/5 bg-transparent",
    }[variant];

    return (
      <div
        ref={ref}
        className={cn("rounded-lg border text-slate-100", variantStyles, className)}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-5 border-b border-white/10", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-heading text-lg font-bold tracking-tight text-white", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs text-slate-400 font-body leading-relaxed", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("p-5 text-slate-200 font-body", className)}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-5 pt-0 text-slate-300 font-body", className)}
      {...props}
    />
  );
}
