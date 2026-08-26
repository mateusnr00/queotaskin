import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Cartão de indicador do topo do painel.
 *
 * O número é o protagonista: vem grande, tabular e em primeiro, com o rótulo
 * abaixo. O ícone fica atrás, discreto, presença sem competir com o dado.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "default" | "money" | "growth";
}) {
  const cor = {
    default: "text-foreground",
    money: "text-emerald-500",
    growth: "text-primary",
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4">
      <Icon
        aria-hidden
        className="absolute -top-3 -right-3 h-20 w-20 text-muted-foreground/[0.06]"
        strokeWidth={1.5}
      />
      <div className="relative">
        <p className={cn("text-2xl leading-none font-bold tracking-tight tabular-nums", cor)}>
          {value}
        </p>
        <p className="mt-1.5 text-xs font-medium text-muted-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</p>}
      </div>
    </div>
  );
}
