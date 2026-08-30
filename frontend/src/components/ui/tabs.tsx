import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number | string;
  icon?: React.ElementType;
  badge?: string;
}

export function Tabs<T extends string = string>({
  items,
  activeTab,
  onChange,
  variant = "pill",
  className,
}: {
  items: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  variant?: "pill" | "underline" | "boxed";
  className?: string;
}) {
  if (variant === "underline") {
    return (
      <div className={cn("flex space-x-6 border-b border-white/10", className)}>
        {items.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative flex items-center gap-2 pb-3.5 text-sm font-heading font-bold tracking-wide transition-colors",
                isActive ? "text-gold" : "text-slate-400 hover:text-slate-200",
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-mono font-bold",
                    isActive ? "bg-gold/20 text-gold" : "bg-white/10 text-slate-400",
                  )}
                >
                  {tab.count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gold shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "boxed") {
    return (
      <div className={cn("flex flex-wrap gap-1 rounded-lg border border-white/10 bg-obsidian-900/80 p-1", className)}>
        {items.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-heading font-bold tracking-wide transition-colors",
                isActive
                  ? "bg-gold text-obsidian shadow-sm"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-mono",
                    isActive ? "bg-obsidian/20 text-obsidian" : "bg-white/10 text-slate-400",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Default 'pill' variant
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((tab) => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3.5 py-2 text-xs font-heading font-bold tracking-wide transition-colors",
              isActive
                ? "border-gold/50 bg-gold/15 text-gold shadow-[0_0_12px_-2px_rgba(245,158,11,0.25)]"
                : "border-white/10 bg-obsidian-900/60 text-slate-400 hover:border-white/20 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-mono font-bold",
                  isActive ? "bg-gold text-obsidian" : "bg-white/10 text-slate-300",
                )}
              >
                {tab.count}
              </span>
            )}
            {tab.badge && (
              <span className="rounded bg-coral px-1.5 py-0.5 text-[9px] font-black text-white">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
