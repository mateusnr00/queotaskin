// O lugar do preço, quando a campanha é gratuita.
//
// Era uma faixa com "SORTEIO GRATUITO" centralizado e nada mais. Dizia o
// fato e desperdiçava o momento: no lugar exato onde a campanha paga mostra
// o valor, a gratuita mostrava um letreiro que não respondia a pergunta
// seguinte, "então o que eu faço aqui?".
//
// Segue a estrutura do PrecoDaCampanha de propósito, porque ocupa o mesmo
// lugar na página: rótulo à esquerda, número grande à direita. Só que aqui o
// número é a palavra GRÁTIS, e o rótulo diz por que ela está lá.
//
// Verde, e não o laranja do preço: no resto do site o laranja é "isto custa,
// e é aqui que se paga". Usá-lo para dizer o contrário confundiria os dois
// estados justamente na dobra que decide.

import { Gift } from "lucide-react";

export function FaixaDeGratuito({
  rotulo,
  unidade = "por número",
}: {
  /**
   * O texto grande. Vem do painel (freeLabel) quando o admin escreveu algo,
   * senão é só GRÁTIS. O tamanho cai em texto longo para não quebrar em duas
   * linhas dentro do card.
   */
  rotulo?: string | null;
  unidade?: string;
}) {
  const texto = (rotulo ?? "").trim() || "GRÁTIS";
  const comprido = texto.length > 8;

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.14] via-emerald-500/[0.06] to-transparent px-4 py-3 md:px-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-emerald-500/40"
      />
      <div className="flex items-center justify-between gap-3 pl-1.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Sua entrada custa
          </p>
          <p className="text-xs font-medium text-muted-foreground">{unidade}</p>
        </div>
        <p className="flex shrink-0 items-center gap-2 text-emerald-500">
          <Gift aria-hidden className="h-5 w-5 md:h-6 md:w-6" />
          <span
            className={
              comprido
                ? "text-lg font-extrabold tracking-tight uppercase md:text-xl"
                : "text-3xl font-extrabold tracking-tight uppercase md:text-4xl"
            }
          >
            {texto}
          </span>
        </p>
      </div>
    </div>
  );
}
