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
// Aqui o rank vira o motivo, e o bloco é escrito para ser lido como prêmio, e
// não como aviso:
//
//   o selo primeiro     grande, na cor do rank, com o nome do degrau embaixo.
//                       É o troféu; ele que carrega a conquista.
//   o nome dele         "Sua de graça, Ouro II" fala com a pessoa. "Campanha
//                       liberada" fala de campanha.
//   o que custou        a linha diz o degrau exigido. O degrau dele já está no
//                       título e embaixo do selo; uma terceira vez na mesma
//                       frase vira ruído.
//   selos de fecho      "Sem pagar nada", "Exclusiva por rank": o resumo que
//                       o olho pega antes de ler a frase.
//
// A entrada é a única animação, e roda uma vez. Nada pulsa depois: o botão de
// participar logo abaixo já é o elemento em movimento desta dobra, e dois
// competindo cansam.

import { Gift, Lock, Sparkles } from "lucide-react";

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
      className="selo-liberado relative overflow-hidden rounded-2xl border p-4 md:p-5"
      style={{
        borderColor: `${rank.color}59`,
        background: `linear-gradient(135deg, ${rank.color}26, ${rank.color}0d 55%, transparent)`,
      }}
    >
      {/* O fio na borda, na cor do rank: amarra o bloco ao selo sem precisar
          pintar o card inteiro. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: rank.color }}
      />
      {/* Um brilho fora de foco atrás do selo. É o que separa "conquista" de
          "caixa de aviso" sem acrescentar mais uma borda colorida. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-10 h-40 w-40 rounded-full blur-3xl"
        style={{ background: `${rank.color}40` }}
      />

      <div className="relative flex items-start gap-4 pl-1.5">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <RankBadge rank={rank} size="lg" />
          <span
            className="text-[10px] font-bold tracking-wide uppercase"
            style={{ color: rank.color }}
          >
            {rank.label}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
            <Sparkles aria-hidden className="h-3 w-3 shrink-0" />
            Desbloqueado pelo seu rank
          </p>

          <p
            className="mt-1 text-lg leading-tight font-extrabold tracking-tight md:text-xl"
            style={{ color: rank.color }}
          >
            {gratuita ? `Sua de graça, ${rank.label}` : "Liberada para você"}
          </p>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Só quem é{" "}
            <b className="font-semibold text-foreground">{exigido.label}</b> ou
            acima entra nesta campanha. Você entrou
            {gratuita ? ", e sem pagar nada." : "."}
          </p>

          {/* O resumo em selos, para quem não lê a frase: são as duas coisas
              que fazem esta campanha diferente das outras da lista. */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {gratuita && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-500">
                <Gift aria-hidden className="h-3 w-3" />
                Sem pagar nada
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
              style={{
                borderColor: `${rank.color}4d`,
                backgroundColor: `${rank.color}1a`,
                color: rank.color,
              }}
            >
              <Lock aria-hidden className="h-3 w-3" />
              Exclusiva por rank
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
