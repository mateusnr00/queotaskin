"use client";

import { AreaChart } from "@/components/ui/tremor";
import { formatBRL } from "@/lib/format";
import type { PontoDeVenda } from "@/server/services/estatisticas";

export function GraficoDeVendas({ pontos }: { pontos: PontoDeVenda[] }) {
  if (pontos.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Sem vendas no período.
      </div>
    );
  }
  return (
    <AreaChart
      className="h-72"
      data={pontos}
      index="rotulo"
      categories={["faturamento"]}
      colors={["chart1"]}
      valueFormatter={(v) => formatBRL(v)}
      showLegend={false}
      yAxisWidth={72}
    />
  );
}
