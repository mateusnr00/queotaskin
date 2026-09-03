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
// Aqui o rank vira o motivo, numa fileira só: o selo, a frase que fala com a
// pessoa ("Sua de graça, Ouro II" fala com ela; "Campanha liberada" fala de
// campanha) e uma linha dizendo qual degrau isto exigia.
//
// Os dois chips de resumo saíram. Eles repetiam, em miniatura, exatamente o
// que a frase acima deles dizia, e a faixa GRÁTIS logo abaixo já anuncia o
// preço em corpo 24. Três lugares dizendo "não custa nada" na mesma dobra.
//
// A entrada é a única animação, e roda uma vez. Nada pulsa depois: o botão de
// participar logo abaixo já é o elemento em movimento desta dobra, e dois
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
      className="selo-liberado relative overflow-hidden rounded-xl border px-4 py-2.5"
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

      {/* UMA FILEIRA, E NÃO UM PÔSTER.
          Isto era um bloco de quatro parágrafos e dois selos: o selo grande, a
          manchete, a explicação, e dois chips repetindo em miniatura o que a
          explicação já dizia. Tudo para comunicar uma coisa só, que a pessoa
          já pode entrar. Quem chegou aqui quer o botão de participar, e o
          bloco estava entre ele e a tela. */}
      <div className="relative flex items-center gap-3 pl-1.5">
        <RankBadge rank={rank} size="md" />
        <div className="min-w-0 flex-1">
          <p
            className="flex items-center gap-1.5 text-sm leading-tight font-extrabold"
            style={{ color: rank.color }}
          >
            <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {gratuita ? `Sua de graça, ${rank.label}` : "Liberada para você"}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Exclusiva do {exigido.label} para cima. Você já pode participar
            {gratuita ? " sem pagar nada." : "."}
          </p>
        </div>
      </div>
    </div>
  );
}
