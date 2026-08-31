"use client";

import { DonutChart } from "@/components/ui/tremor";
import { formatBRL } from "@/lib/format";
import type { ReservasEmRisco } from "@/server/services/estatisticas";

const nf = new Intl.NumberFormat("pt-BR");

export function Risco({ risco }: { risco: ReservasEmRisco }) {
  const temJanela = risco.expiradas + risco.pagasNaJanela > 0;
  return (
    <div className="flex items-center gap-5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-2xl font-bold tabular-nums md:text-3xl">
          {formatBRL(risco.valorPendente)}
        </div>
        <div className="text-xs text-muted-foreground">
          {nf.format(risco.pendentes)} reserva(s) pendente(s) agora
        </div>
        <div className="text-xs text-muted-foreground">
          {risco.taxaExpiracaoPct != null
            ? `${risco.taxaExpiracaoPct}% expiram sem pagar (últimos 7 dias)`
            : "Sem reservas concluídas nos últimos 7 dias"}
        </div>
      </div>
      {temJanela && (
        <DonutChart
          className="h-28 w-28 shrink-0"
          data={[
            { name: "Pagas", value: risco.pagasNaJanela },
            { name: "Expiradas", value: risco.expiradas },
          ]}
          category="name"
          value="value"
          colors={["chart5", "chart4"]}
          valueFormatter={(v) => nf.format(v)}
          showTooltip
        />
      )}
    </div>
  );
}
