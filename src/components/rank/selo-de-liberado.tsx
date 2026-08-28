// O aviso de campanha liberada pelo rank.
//
// O MinLevelGate resolve metade do problema: mostra a quem não alcançou
// quanto falta. A outra metade estava faltando, e é a que traz de volta.
//
// Quem já subiu de rank abria a campanha exclusiva e não via nada. A tela era
// idêntica à de qualquer campanha aberta, então o que ele comprou para chegar
// ali não aparecia em lugar nenhum. Recompensa que não é vista não recompensa:
// vira só uma página normal, e a próxima compra não tem por que acontecer.
//
// Aqui o rank vira o motivo. O selo diz que aquela campanha está aberta PARA
// ELE, com o nome do rank dele e a cor do rank dele, e quando ela é gratuita
// diz também que não vai custar nada. É esse o momento que paga o esforço.
//
// A entrada é a única animação, e roda uma vez. Nada pulsa depois: a barra de
// progresso logo abaixo já é o elemento em movimento desta dobra, e dois
// competindo cansam.

import { Sparkles } from "lucide-react";

import { RankBadge } from "@/components/rank/rank-badge";
import { degrauDoRank, type Rank } from "@/lib/rank";

export function SeloDeLiberado({
  minLevel,
  rank,
  gratuita,
}: {
  /** O degrau exigido pela campanha. */
  minLevel: number;
  /** O rank de quem está vendo. */
  rank: Rank;
  gratuita: boolean;
}) {
  const exigido = degrauDoRank(minLevel);
  if (!exigido) return null;

  return (
    <div
      className="selo-liberado relative overflow-hidden rounded-xl border p-3.5"
      style={{
        borderColor: `${rank.color}66`,
        background: `linear-gradient(135deg, ${rank.color}22, ${rank.color}0a 55%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: rank.color }}
      />
      <div className="flex items-center gap-3 pl-1.5">
        <RankBadge rank={rank} size="sm" />
        <div className="min-w-0 flex-1">
          <p
            className="flex items-center gap-1.5 text-sm font-bold"
            style={{ color: rank.color }}
          >
            <Sparkles aria-hidden className="h-4 w-4 shrink-0" />
            {gratuita ? "Sua de graça" : "Liberada para você"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Exclusiva de{" "}
            <b className="font-semibold text-foreground">{exigido.label}</b> ou
            acima, e você é{" "}
            <b className="font-semibold text-foreground">{rank.label}</b>.
            {gratuita ? " Participe sem pagar nada." : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
