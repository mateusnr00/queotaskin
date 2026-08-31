"use client";

import { BarList } from "@/components/ui/tremor";
import { formatBRL } from "@/lib/format";
import type { CanalFaturamento } from "@/server/services/estatisticas";

export function ListaPorCanal({ canais }: { canais: CanalFaturamento[] }) {
  if (canais.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem vendas com origem no período.
      </p>
    );
  }
  return (
    <BarList
      data={canais.map((c) => ({ key: c.canal || "direto", name: c.rotulo, value: c.faturamento }))}
      valueFormatter={(v) => formatBRL(v)}
    />
  );
}
