// O lugar do preço, quando a campanha é gratuita.
//
// Ela imitava o cartão de preço da campanha paga: rótulo à esquerda, número à
// direita. Só que o rótulo dizia "SUA ENTRADA CUSTA / por número" acima da
// palavra GRÁTIS, ou seja, explicava o preço de uma coisa que não tem preço,
// e "por número" prometia uma unidade que aqui não existe. Duas linhas de
// texto para não dizer nada, e a metade esquerda da faixa inteira gasta nelas.
//
// Agora é uma linha só, centrada: o presente e a palavra. Não sobrou lado
// vazio porque não sobrou lado, e a altura caiu à metade sem perder um átomo
// de informação.
//
// Verde, e não o laranja do preço: no resto do site o laranja é "isto custa,
// e é aqui que se paga". Usá-lo para dizer o contrário confundiria os dois
// estados justamente na dobra que decide.

import { Gift } from "lucide-react";

export function FaixaDeGratuito({
  rotulo,
}: {
  /**
   * O texto grande. Vem do painel (freeLabel) quando o admin escreveu algo,
   * senão é só GRÁTIS. O tamanho cai em texto longo para não quebrar em duas
   * linhas dentro da faixa.
   */
  rotulo?: string | null;
}) {
  const texto = (rotulo ?? "").trim() || "GRÁTIS";
  const comprido = texto.length > 10;

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.12] via-emerald-500/[0.06] to-transparent px-4 py-2">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-emerald-500/40"
      />
      <p className="flex items-center justify-center gap-2 text-emerald-500">
        <Gift aria-hidden className="h-5 w-5 shrink-0" />
        <span
          className={
            comprido
              ? "text-base font-extrabold tracking-[0.06em] uppercase"
              : "text-[1.4rem] leading-8 font-extrabold tracking-[0.08em] uppercase"
          }
        >
          {texto}
        </span>
      </p>
    </div>
  );
}
