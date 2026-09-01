"use client";

// O Cupom de Entrada dentro do checkout.
//
// Fica abaixo do resumo e acima do botão, que é onde a decisão acontece: mais
// para cima competiria com a escolha da quantidade, e mais para baixo a
// pessoa já teria clicado em pagar.
//
// O CUPOM É ESCOLHIDO, E NÃO SORTEADO PELA TELA.
//
// Alterações administrativas fazem cupons antigos e novos valerem valores
// diferentes, então quem tem mais de um escolhe qual gastar. Escolher sozinho
// o de maior valor gastaria o melhor cupom numa cota barata sem ninguém pedir.
//
// E o desperdício é dito na cara antes de confirmar: cupom de R$ 5 numa cota
// de R$ 2 abate R$ 2 e os R$ 3 se perdem. Esconder isso é o tipo de coisa que
// vira reclamação com razão.

import { AlertTriangle, Check, Ticket } from "lucide-react";

import { descontoDoCupom } from "@/lib/afiliados";
import { formatBRL } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface CupomNoCheckout {
  id: string;
  valorEmCentavos: number;
}

export interface EntradaNoCheckout {
  ehAfiliado: boolean;
  cupons: CupomNoCheckout[];
  jaUsouNesteSorteio: boolean;
  campanhaAceita: boolean;
  precoDaCotaEmCentavos: number;
  podeUsar: boolean;
}

export function CartaoDeEntradaGratis({
  situacao,
  usar,
  aoMudar,
  cupomEscolhido,
  aoEscolher,
  desabilitado,
}: {
  situacao: EntradaNoCheckout;
  usar: boolean;
  aoMudar: (v: boolean) => void;
  cupomEscolhido: string | null;
  aoEscolher: (id: string) => void;
  desabilitado?: boolean;
}) {
  // Quem não é afiliado não vê nada: o checkout já é a tela mais cheia do
  // site, e um cartão sobre um programa do qual a pessoa não participa só
  // atrapalha quem está pagando.
  if (!situacao.ehAfiliado) return null;

  if (situacao.jaUsouNesteSorteio) {
    return (
      <Aviso icone={<Check className="h-4 w-4 shrink-0 text-emerald-500" />}>
        <b className="font-semibold">
          Cupom de Entrada já utilizado neste sorteio
        </b>
        <span className="mt-1 block text-[11px] leading-relaxed">
          {situacao.cupons.length > 0
            ? `Você ainda tem ${situacao.cupons.length} ${
                situacao.cupons.length === 1 ? "cupom" : "cupons"
              } para usar em outras campanhas.`
            : "Seus próximos cupons valem em outras campanhas."}
        </span>
      </Aviso>
    );
  }

  if (!situacao.campanhaAceita && situacao.cupons.length > 0) {
    return (
      <Aviso icone={<Ticket className="h-4 w-4 shrink-0" />}>
        <b className="font-semibold">Esta campanha não aceita Cupom de Entrada</b>
        <span className="mt-1 block text-[11px] leading-relaxed">
          Seus cupons continuam valendo nas campanhas participantes.
        </span>
      </Aviso>
    );
  }

  if (situacao.cupons.length === 0) {
    return (
      <Aviso icone={<Ticket className="h-4 w-4 shrink-0" />}>
        <b className="font-semibold">Você ainda não tem Cupons de Entrada</b>
        <span className="mt-1 block text-[11px] leading-relaxed">
          A cada R$ 10,00 pagos pelas pessoas que você indicar, você ganha um
          Cupom de Entrada.
        </span>
      </Aviso>
    );
  }

  const escolhido =
    situacao.cupons.find((c) => c.id === cupomEscolhido) ?? situacao.cupons[0]!;
  const { descontoEmCentavos, desperdicioEmCentavos } = descontoDoCupom({
    precoDaCotaEmCentavos: situacao.precoDaCotaEmCentavos,
    valorDoCupomEmCentavos: escolhido.valorEmCentavos,
  });

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border px-4 py-3 transition-colors",
        usar
          ? "border-emerald-500/40 bg-emerald-500/[0.08]"
          : "border-border bg-muted/30",
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
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
                -{formatBRL(descontoEmCentavos / 100)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
            Você tem{" "}
            <b className="font-semibold text-foreground">
              {situacao.cupons.length}
            </b>{" "}
            {situacao.cupons.length === 1 ? "cupom" : "cupons"}. Ele abate até o
            valor de face em UMA cota, é consumido por inteiro e cada campanha
            aceita um.
          </span>
        </span>
      </label>

      {/* A escolha só aparece com mais de um cupom, e só quando vai ser usado:
          com um cupom só não há o que decidir. */}
      {usar && situacao.cupons.length > 1 && (
        <div className="space-y-1.5 pl-11">
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Qual cupom usar
          </p>
          <div className="flex flex-wrap gap-1.5">
            {situacao.cupons.map((c) => {
              const marcado = c.id === escolhido.id;
              const conta = descontoDoCupom({
                precoDaCotaEmCentavos: situacao.precoDaCotaEmCentavos,
                valorDoCupomEmCentavos: c.valorEmCentavos,
              });
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={desabilitado}
                  onClick={() => aoEscolher(c.id)}
                  aria-pressed={marcado}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold transition-colors",
                    marcado
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-accent",
                  )}
                >
                  {formatBRL(c.valorEmCentavos / 100)}
                  <span className="mt-0.5 block font-medium opacity-80">
                    abate {formatBRL(conta.descontoEmCentavos / 100)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* O AVISO DA PERDA. Parte do cupom vai embora, e a pessoa confirma
          sabendo disso. */}
      {usar && desperdicioEmCentavos > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
          <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            O cupom será consumido por completo. Desconto aplicado:{" "}
            <b className="font-bold">
              {formatBRL(descontoEmCentavos / 100)}
            </b>
            . Valor não aproveitado:{" "}
            <b className="font-bold">
              {formatBRL(desperdicioEmCentavos / 100)}
            </b>
            , que não vira saldo nem troco.
          </span>
        </p>
      )}
    </div>
  );
}

function Aviso({
  icone,
  children,
}: {
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        {icone}
        <span className="min-w-0 flex-1">{children}</span>
      </p>
    </div>
  );
}
