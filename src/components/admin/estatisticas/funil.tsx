"use client";

import { BarList } from "@/components/ui/tremor";
import type { FunilDeConversao } from "@/server/services/estatisticas";

const nf = new Intl.NumberFormat("pt-BR");

export function Funil({ funil }: { funil: FunilDeConversao }) {
  const data = [
    { name: "Visitantes", value: funil.visitantes },
    { name: "Reservas", value: funil.reservas },
    { name: "Pagas", value: funil.pagas },
  ];
  return (
    <div className="space-y-3">
      {/* sortOrder="none": o funil precisa ficar na ordem das etapas, senão o
          BarList reordena por valor e some com a leitura de funil. */}
      <BarList
        data={data}
        sortOrder="none"
        valueFormatter={(v) => nf.format(v)}
      />
      <p className="text-xs text-muted-foreground">
        {funil.taxaGeralPct ?? 0}% dos visitantes compraram
        {funil.taxaPagamentoPct != null
          ? ` · ${funil.taxaPagamentoPct}% das reservas viraram pagamento`
          : ""}
      </p>
    </div>
  );
}
