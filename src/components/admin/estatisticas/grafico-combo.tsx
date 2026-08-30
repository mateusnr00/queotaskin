"use client";

import { ComboChart } from "@/components/ui/tremor";
import { formatBRL } from "@/lib/format";
import type { PontoDeVenda } from "@/server/services/estatisticas";

const nf = new Intl.NumberFormat("pt-BR");

// Faturamento (barras) e reservas (linha) no mesmo gráfico, em eixos
// separados: as duas grandezas têm escalas diferentes (reais x contagem), e um
// eixo único achataria a linha de reservas contra as barras de faturamento.
export function GraficoCombo({ pontos }: { pontos: PontoDeVenda[] }) {
  if (pontos.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
        Nenhuma venda no período selecionado.
      </div>
    );
  }
  return (
    <ComboChart
      className="h-80"
      data={pontos}
      index="rotulo"
      enableBiaxial
      barSeries={{
        categories: ["faturamento"],
        colors: ["chart1"],
        valueFormatter: (v) => formatBRL(v),
      }}
      lineSeries={{
        categories: ["reservas"],
        colors: ["chart3"],
        valueFormatter: (v) => nf.format(v),
      }}
    />
  );
}
