// O aviso do boost no comprovante, nos dois estados da compra.
//
// ANTES DE PAGAR é promessa, e a tela diz que é: o boost só é consumido
// quando o pagamento é confirmado, e um PIX que expira não gasta nada.
//
// DEPOIS DE PAGO é extrato: mostra a conta que aconteceu, com o XP de antes,
// o multiplicador e o que ele acrescentou. É o único momento em que a pessoa
// está olhando e sabe que acabou de comprar.
//
// Componente de servidor: sem estado e sem interação. A contagem regressiva
// mora no selo do topo, que é de cliente.

import { Zap } from "lucide-react";

import { ROTULO_DA_RARIDADE } from "@/lib/xp/caixa-de-level-up";

type Raridade = keyof typeof ROTULO_DA_RARIDADE;

/** O boost prometido, enquanto o pagamento não foi confirmado. */
export function BoostPendenteNoCheckout({
  multiplicador,
  raridade,
}: {
  multiplicador: number;
  raridade: Raridade;
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.07] p-3">
      <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-primary uppercase">
        <Zap aria-hidden className="h-3.5 w-3.5" />
        Boost de level ativo
      </p>
      <p className="mt-1 text-sm font-bold">
        {multiplicador}x XP nesta compra
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {ROTULO_DA_RARIDADE[raridade]}. Será aplicado quando o pagamento for
        confirmado. Se o PIX expirar, o boost continua guardado para a próxima.
      </p>
    </div>
  );
}

/** O boost já usado, com a conta aberta. */
export function BoostUsadoNaCompra({
  multiplicador,
  xpBase,
  xpFinal,
}: {
  multiplicador: number;
  /** O XP que a compra renderia sem o boost. */
  xpBase: number;
  xpFinal: number;
}) {
  const bonus = xpFinal - xpBase;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.07] p-4">
      <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-primary uppercase">
        <Zap aria-hidden className="h-3.5 w-3.5" />
        Boost utilizado
      </p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">XP base</dt>
          <dd className="font-semibold tabular-nums">
            {xpBase.toLocaleString("pt-BR")} XP
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Boost</dt>
          <dd className="font-semibold tabular-nums text-primary">
            {multiplicador}x
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-1">
          <dt className="font-semibold">XP recebido</dt>
          <dd className="text-base font-black tabular-nums text-primary">
            {xpFinal.toLocaleString("pt-BR")} XP
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Bônus do boost</dt>
          <dd className="font-semibold tabular-nums text-emerald-400">
            +{bonus.toLocaleString("pt-BR")} XP
          </dd>
        </div>
      </dl>
    </div>
  );
}
