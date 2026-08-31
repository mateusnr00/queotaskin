"use client";

// A Entrada Grátis dentro do checkout.
//
// Fica abaixo do resumo e acima do botão, que é onde a decisão acontece: mais
// para cima competiria com a escolha da quantidade, e mais para baixo a
// pessoa já teria clicado em pagar.
//
// Os três estados aparecem, e nenhum deles é escondido:
//
//   tem entrada        interruptor ligado por padrão. Quem tem benefício
//                      esperando quase sempre quer usar, e deixar desligado
//                      transforma um presente em pegadinha de quem não viu.
//   já usou aqui       aparece desabilitado, dizendo que as outras entradas
//                      continuam valendo em outras campanhas. Sumir com o
//                      cartão faria parecer que o saldo evaporou.
//   sem entrada        uma linha explicando como se ganha uma. Só para quem
//                      já é afiliado: para o resto seria propaganda no meio
//                      do pagamento.
//
// O desconto mostrado aqui é o preço de UMA cota, calculado no servidor e
// repetido aqui só para leitura. Quem decide o valor cobrado é a action.

import { Check, Ticket } from "lucide-react";

import { formatBRL } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface EntradaNoCheckout {
  ehAfiliado: boolean;
  disponiveis: number;
  jaUsouNesteSorteio: boolean;
  podeUsar: boolean;
}

export function CartaoDeEntradaGratis({
  situacao,
  precoDaCota,
  usar,
  aoMudar,
  desabilitado,
}: {
  situacao: EntradaNoCheckout;
  /** Quanto uma cota custa nesta campanha: é esse o desconto. */
  precoDaCota: number;
  usar: boolean;
  aoMudar: (v: boolean) => void;
  desabilitado?: boolean;
}) {
  // Quem não é afiliado não vê nada: o checkout já é a tela mais cheia do
  // site, e um cartão sobre um programa do qual a pessoa não participa só
  // atrapalha quem está pagando.
  if (!situacao.ehAfiliado) return null;

  if (situacao.jaUsouNesteSorteio) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-500" />
          Entrada Grátis já utilizada neste sorteio
        </p>
        <p className="mt-1 pl-6 text-[11px] leading-relaxed text-muted-foreground">
          {situacao.disponiveis > 0
            ? `Você ainda tem ${situacao.disponiveis} ${
                situacao.disponiveis === 1 ? "entrada" : "entradas"
              } para usar em outras campanhas.`
            : "Suas próximas entradas valem em outras campanhas."}
        </p>
      </div>
    );
  }

  if (situacao.disponiveis === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Ticket aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          Você ainda não tem Entradas Grátis
        </p>
        <p className="mt-1 pl-6 text-[11px] leading-relaxed text-muted-foreground">
          Indique amigos e ganhe uma a cada R$ 10 em compras dos seus
          indicados.
        </p>
      </div>
    );
  }

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
        usar
          ? "border-emerald-500/40 bg-emerald-500/[0.08]"
          : "border-border bg-muted/30 hover:bg-muted/50",
      )}
    >
      <Switch
        checked={usar}
        disabled={desabilitado}
        onCheckedChange={aoMudar}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
          <Ticket aria-hidden className="h-4 w-4 shrink-0 text-emerald-500" />
          Usar 1 Entrada Grátis
          {usar && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500 tabular-nums">
              -{formatBRL(precoDaCota)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          Você tem{" "}
          <b className="font-semibold text-foreground">
            {situacao.disponiveis}
          </b>{" "}
          {situacao.disponiveis === 1
            ? "entrada disponível"
            : "entradas disponíveis"}
          . Uma cota desta compra sai de graça, e cada campanha aceita uma
          entrada.
        </span>
      </span>
    </label>
  );
}
