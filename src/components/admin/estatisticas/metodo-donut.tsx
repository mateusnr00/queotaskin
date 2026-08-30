"use client";

import { DonutChart } from "@/components/ui/tremor";
import { formatBRL } from "@/lib/format";
import type { MetodoFaturamento } from "@/server/services/estatisticas";

export function MetodoDonut({ metodos }: { metodos: MetodoFaturamento[] }) {
  if (metodos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem pagamentos no período.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <DonutChart
        className="h-40"
        data={metodos.map((m) => ({ name: m.rotulo, value: m.faturamento }))}
        category="name"
        value="value"
        colors={["chart1", "chart3", "chart2"]}
        valueFormatter={(v) => formatBRL(v)}
        showTooltip
      />
      <ul className="w-full space-y-1">
        {metodos.map((m) => (
          <li
            key={m.metodo}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">{m.rotulo}</span>
            <span className="tabular-nums">
              {formatBRL(m.faturamento)}{" "}
              <span className="text-xs text-muted-foreground">
                ({m.compras})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
