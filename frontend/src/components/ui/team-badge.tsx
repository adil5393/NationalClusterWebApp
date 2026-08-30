import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface TeamAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  seed?: number | string;
  size?: "xs" | "sm" | "md" | "lg";
  tone?: "gold" | "red" | "blue" | "coral" | "neutral";
}

export function TeamAvatar({
  name,
  seed,
  size = "md",
  tone = "neutral",
  className,
}: TeamAvatarProps) {
  const initials = name
    ? name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "TM";

  const sizeClasses = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-11 w-11 text-base",
  }[size];

  const toneClasses = {
    gold: "border-gold/40 bg-gold/15 text-gold",
    red: "border-red-500/40 bg-red-500/15 text-red-400",
    blue: "border-blue-500/40 bg-blue-500/15 text-blue-400",
    coral: "border-coral/40 bg-coral/15 text-coral",
    neutral: "border-white/15 bg-white/5 text-slate-200",
  }[tone];

  return (
    <div
      className={cn(
        "relative grid place-items-center rounded-lg border font-heading font-black tracking-tight shrink-0",
        sizeClasses,
        toneClasses,
        className,
      )}
    >
      {initials}
      {seed !== undefined && (
        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-gold font-mono text-[9px] font-bold text-obsidian shadow-sm">
          {seed}
        </span>
      )}
    </div>
  );
}

export interface TeamBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  cluster?: string;
  region?: string;
  pool?: string;
  seed?: number | string;
  avatarSize?: "xs" | "sm" | "md" | "lg";
  tone?: "gold" | "red" | "blue" | "coral" | "neutral";
}

export const TeamBadge = forwardRef<HTMLDivElement, TeamBadgeProps>(
  (
    {
      name,
      cluster,
      region,
      pool,
      seed,
      avatarSize = "sm",
      tone = "neutral",
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn("inline-flex items-center gap-2.5 min-w-0", className)}
        {...props}
      >
        <TeamAvatar name={name} seed={seed} size={avatarSize} tone={tone} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-heading text-sm font-bold text-white">{name}</p>
          {(cluster || region || pool) && (
            <p className="truncate text-[11px] font-body text-slate-400">
              {pool && <span className="font-semibold text-gold mr-1.5">{pool}</span>}
              {cluster && <span>{cluster}</span>}
              {cluster && region && <span className="mx-1">·</span>}
              {region && <span>{region}</span>}
            </p>
          )}
        </div>
      </div>
    );
  },
);
TeamBadge.displayName = "TeamBadge";
