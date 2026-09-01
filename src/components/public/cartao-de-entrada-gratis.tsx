"use client";

// O Cupom de Entrada dentro do checkout.
//
// Fica abaixo do resumo e acima do botão, que é onde a decisão acontece: mais
// para cima competiria com a escolha da quantidade, e mais para baixo a
// pessoa já teria clicado em pagar.
//
// Os três estados aparecem, e nenhum deles é escondido:
//
//   cota cara demais   o cupom vale R$ 10 e cobre uma cota de até R$ 10. Numa
//                      campanha mais cara ele é recusado inteiro, e a tela diz
//                      isso: não existe pagar a diferença.
//   tem cupom          interruptor ligado por padrão. Quem tem benefício
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
  /** A cota desta campanha passa do valor de face do cupom. */
  cotaAcimaDoCupom: boolean;
  valorDoCupomEmCentavos: number;
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

  const valorDoCupom = formatBRL(situacao.valorDoCupomEmCentavos / 100);

  // A cota é mais cara que o cupom: ele não cobre pela metade, e não existe
  // completar a diferença no Pix. Dizer isso é melhor que sumir com o cartão e
  // deixar a pessoa procurando onde foi parar o cupom dela.
  if (situacao.cotaAcimaDoCupom && situacao.disponiveis > 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Ticket aria-hidden className="h-4 w-4 shrink-0" />
          Cupom de Entrada não vale nesta campanha
        </p>
        <p className="mt-1 pl-6 text-[11px] leading-relaxed text-muted-foreground">
          O cupom vale {valorDoCupom} e cobre uma cota de até {valorDoCupom}.
          Aqui a cota custa mais que isso.{" "}
          {situacao.disponiveis === 1
            ? `Seu cupom continua valendo em campanhas de cota até ${valorDoCupom}.`
            : `Seus ${situacao.disponiveis} cupons continuam valendo em campanhas de cota até ${valorDoCupom}.`}
        </p>
      </div>
    );
  }

  if (situacao.jaUsouNesteSorteio) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Check aria-hidden className="h-4 w-4 shrink-0 text-emerald-500" />
          Cupom de Entrada já utilizado neste sorteio
        </p>
        <p className="mt-1 pl-6 text-[11px] leading-relaxed text-muted-foreground">
          {situacao.disponiveis > 0
            ? `Você ainda tem ${situacao.disponiveis} ${
                situacao.disponiveis === 1 ? "cupom" : "cupons"
              } para usar em outras campanhas.`
            : "Seus próximos cupons valem em outras campanhas."}
        </p>
      </div>
    );
  }

  if (situacao.disponiveis === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Ticket aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          Você ainda não tem Cupons de Entrada
        </p>
        <p className="mt-1 pl-6 text-[11px] leading-relaxed text-muted-foreground">
          Cada pessoa que você indicar pode liberar um cupom de {valorDoCupom},
          quando ela acumular {valorDoCupom} em pagamentos confirmados.
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
          Usar 1 Cupom de Entrada
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
            ? "cupom disponível"
            : "cupons disponíveis"}
          . Uma cota desta compra sai de graça, o cupom é consumido por inteiro
          e cada campanha aceita um.
        </span>
      </span>
    </label>
  );
}
