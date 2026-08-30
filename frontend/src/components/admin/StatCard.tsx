import type { LucideIcon } from "lucide-react";
import { StatCard as BaseStatCard } from "@/components/ui/stat-card";

export function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <BaseStatCard
      icon={icon}
      label={label}
      value={value}
      sub={sub}
      accent={accent}
      tone={accent ? "gold" : "neutral"}
      testId={testId}
    />
  );
}
