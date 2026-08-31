import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Cartão de KPI do topo (tempo real). O delta compara com a mesma janela do
// dia anterior; null (sem base) simplesmente não desenha o selo, em vez de
// mostrar um "0%" que mente sobre não haver comparação.
export function StatDeHoje({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight tabular-nums md:text-3xl">
          {value}
        </span>
        {delta != null && <DeltaBadge delta={delta} />}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const subiu = delta >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        subiu
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
          : "bg-red-500/15 text-red-600 dark:text-red-300",
      )}
    >
      {subiu ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {Math.abs(delta)}%
    </span>
  );
}
