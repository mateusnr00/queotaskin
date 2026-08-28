"use client";

// A faixa da promoção em dobro, na página da campanha.
//
// O QUE ELA PRECISA DIZER, NESTA ORDEM
//
// O que você leva, quanto tempo tem, e o que fazer. O concorrente inverte:
// abre com "🔥 Chance em dobro! 🔥", que é adjetivo, e só depois conta o que
// acontece. Aqui a primeira linha é o mecanismo, "cada número vale 2", porque
// é a informação que muda a decisão de comprar.
//
// A CONTA APARECE
//
// Dizer "o dobro" é abstrato. Mostrar "10 pagos → 20 números" é a mesma frase
// com o resultado no lugar da promessa, e é o que faz a pessoa entender sem
// precisar acreditar.
//
// SOBRE O RELÓGIO
//
// Ele conta em horas, e não em dias: "encerra em 32:10:05" pressiona mais do
// que "falta 1 dia", que soa adiável. Ele é `aria-hidden` e a mesma informação
// é dita uma vez em texto, porque um número que muda a cada segundo dentro de
// uma região viva faria o leitor de tela interromper a leitura sessenta vezes
// por minuto.
//
// Só uma coisa se move: o pulso do ponto. O relógio troca o número, o resto
// fica parado, e nada pisca para quem pediu menos movimento no sistema.

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

import {
  contagemEmPalavras,
  contagemRegressiva,
  formatarContagem,
  type Contagem,
} from "@/lib/promocao-em-dobro";
import { cn } from "@/lib/utils";

export function FaixaDeDobro({
  /** Quando a promoção acaba. Nulo quer dizer "sem prazo". */
  fim,
  /** O que a pessoa tem selecionado agora, para a conta ficar concreta. */
  quantidadeEscolhida,
  className,
}: {
  fim: string | null;
  quantidadeEscolhida?: number;
  className?: string;
}) {
  const fimEmData = fim ? new Date(fim) : null;
  const [contagem, setContagem] = useState<Contagem | null>(() =>
    fimEmData ? contagemRegressiva(fimEmData, new Date()) : null,
  );

  useEffect(() => {
    if (!fimEmData) return;
    const alvo = fimEmData.getTime();
    const relogio = setInterval(() => {
      setContagem(contagemRegressiva(new Date(alvo), new Date()));
    }, 1000);
    return () => clearInterval(relogio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fim]);

  // Acabou enquanto a pessoa estava na página: a faixa some em vez de mentir.
  if (contagem && contagem.total <= 0) return null;

  const pagas = quantidadeEscolhida && quantidadeEscolhida > 0 ? quantidadeEscolhida : null;

  return (
    <section
      aria-labelledby="dobro-titulo"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-amber-400/40",
        "bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent",
        className,
      )}
    >
      {/* A barra lateral no lugar do fundo inteiro laranja: o bloco continua
          gritando sem cobrir o texto de cor, que é o que derruba o contraste
          na faixa do concorrente. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500"
      />

      <div className="p-4 pl-5 md:p-5 md:pl-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              Promoção no ar
            </p>

            <h2
              id="dobro-titulo"
              className="mt-1 text-xl font-extrabold leading-tight tracking-tight md:text-2xl"
            >
              Cada número vale{" "}
              <span className="text-amber-600 dark:text-amber-400">2</span>
            </h2>

            {/* A conta, e não a promessa. */}
            <p className="mt-1 text-sm text-muted-foreground">
              {pagas ? (
                <>
                  Você escolheu{" "}
                  <b className="font-semibold text-foreground">{pagas}</b> e vai
                  receber{" "}
                  <b className="font-semibold text-amber-600 dark:text-amber-400">
                    {pagas * 2} números
                  </b>
                  , pagando pelos {pagas}.
                </>
              ) : (
                <>
                  Compre 10 e leve{" "}
                  <b className="font-semibold text-amber-600 dark:text-amber-400">
                    20
                  </b>
                  . O preço é o mesmo, os números dobram.
                </>
              )}
            </p>
          </div>

          {contagem && (
            /* Ocupa a linha inteira quando quebra, e vai para a direita 
               quando cabe ao lado. Encolhido e alinhado à direita, o rótulo
               "Encerra em" flutuava deslocado sobre o número. */
            <div className="basis-full text-left sm:basis-auto sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Encerra em
              </p>
              {/* O relógio é enfeite para quem ouve: a frase abaixo diz o
                  mesmo, uma vez só. */}
              <p
                aria-hidden
                className="font-mono text-2xl font-bold tabular-nums leading-none text-foreground md:text-3xl"
              >
                {formatarContagem(contagem)}
              </p>
              <p className="sr-only" role="status">
                {contagemEmPalavras(contagem)}
              </p>
            </div>
          )}
        </div>

        {/* items-start: em três linhas no telefone, o ícone centralizado
            flutuava no meio do parágrafo em vez de marcar o começo dele. */}
        <p className="mt-3 flex items-start gap-1.5 border-t border-amber-400/20 pt-3 text-xs text-muted-foreground">
          <Zap aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          Os números extras são sorteados na hora da compra e aparecem no seu
          comprovante.
        </p>
      </div>
    </section>
  );
}
