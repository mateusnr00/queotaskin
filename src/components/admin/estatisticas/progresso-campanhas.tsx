import { ProgressBar } from "@/components/ui/tremor";
import type { ProgressoCampanha } from "@/server/services/estatisticas";

const nf = new Intl.NumberFormat("pt-BR");

// Servidor puro: o ProgressBar do Tremor não usa hooks, então renderiza direto
// aqui sem virar client. Uma barra por sorteio ativo, com a mais cheia no topo.
export function ProgressoCampanhas({
  campanhas,
}: {
  campanhas: ProgressoCampanha[];
}) {
  if (campanhas.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma campanha ativa.
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {campanhas.map((c) => (
        <li key={c.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{c.titulo}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {nf.format(c.vendidos)}/{nf.format(c.total)} · {c.pct}%
            </span>
          </div>
          <ProgressBar value={c.pct} />
        </li>
      ))}
    </ul>
  );
}
