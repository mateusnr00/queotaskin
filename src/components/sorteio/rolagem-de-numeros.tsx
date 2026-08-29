"use client";

// Os números girando no painel central.
//
// NADA AQUI DECIDE COISA ALGUMA. Os dígitos que passam são enfeite: o número
// de verdade foi escolhido pelo servidor, gravado no banco e assinado antes de
// o primeiro dígito aparecer. Esta animação existe para dar ao resultado o
// tempo de chegar, não para produzi-lo.
//
// A separação é literal no código: enquanto `numeroFinal` é nulo, o painel
// gira; quando ele chega, o painel para nele. Não existe caminho em que o que
// está na tela vire o resultado.
//
// DESEMPENHO
//
// A troca de dígito escreve direto no DOM, por ref, e não por estado do
// React. São vinte e cinco trocas por segundo no começo, e cada uma passando
// pelo React seria uma renderização da árvore inteira da transmissão a cada
// quarenta milissegundos, num celular que também está rodando o resto da
// página.

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** Quantos dígitos o painel mostra, pelo tamanho da campanha. */
function casas(totalNumbers: number): number {
  return Math.max(2, String(Math.max(1, totalNumbers)).length);
}

function preencher(numero: number, casasDoPainel: number): string {
  return String(numero).padStart(casasDoPainel, "0");
}

/**
 * A desaceleração.
 *
 * Começa em quarenta milissegundos entre trocas e chega perto de meio segundo
 * no fim. A curva é quadrática: quase nada muda no primeiro terço e a freada
 * concentra-se no final, que é onde ela é percebida como tensão. Linear parece
 * defeito, como se estivesse travando.
 */
function intervaloDaTroca(decorrido: number, duracao: number): number {
  const progresso = Math.min(1, Math.max(0, decorrido / duracao));
  return 40 + 430 * progresso * progresso;
}

export function RolagemDeNumeros({
  totalNumbers,
  /**
   * Instantes ABSOLUTOS, em milissegundos, e não "segundos decorridos": o
   * laço da animação precisa de uma referência que não mude a cada
   * renderização, senão ele seria recriado quatro vezes por segundo e a
   * desaceleração recomeçaria do zero em cada uma.
   */
  inicioMs,
  revelacaoMs,
  /** O número real. Enquanto nulo, o painel gira. */
  numeroFinal,
  /** Chamado a cada troca de dígito, para o efeito sonoro. */
  aoTrocar,
  className,
}: {
  totalNumbers: number;
  inicioMs: number;
  revelacaoMs: number;
  numeroFinal: number | null;
  aoTrocar?: () => void;
  className?: string;
}) {
  const painel = useRef<HTMLSpanElement>(null);
  const casasDoPainel = casas(totalNumbers);
  const duracao = Math.max(1, (revelacaoMs - inicioMs) / 1000);

  // O som troca de identidade a cada renderização, e o laço não pode
  // depender dele: guardado numa ref atualizada por efeito, o laço chama
  // sempre a versão mais recente sem precisar reiniciar.
  const trocaRef = useRef(aoTrocar);
  useEffect(() => {
    trocaRef.current = aoTrocar;
  });

  useEffect(() => {
    if (numeroFinal != null) return;
    const alvo = painel.current;
    if (!alvo) return;

    // Quem pediu menos movimento vê um marcador parado no lugar dos dígitos
    // girando. O TEMPO do sorteio não muda: a revelação continua no mesmo
    // segundo para todo mundo, com ou sem animação.
    const menosMovimento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (menosMovimento) {
      alvo.textContent = "".padStart(casasDoPainel, "•");
      return;
    }

    let quadro = 0;
    let ultimaTroca = 0;

    const laco = () => {
      const decorridoMs = Date.now() - inicioMs;
      const espera = intervaloDaTroca(decorridoMs / 1000, duracao);
      if (decorridoMs - ultimaTroca >= espera) {
        ultimaTroca = decorridoMs;
        const sorteado = 1 + Math.floor(Math.random() * Math.max(1, totalNumbers));
        alvo.textContent = preencher(sorteado, casasDoPainel);
        trocaRef.current?.();
      }
      quadro = requestAnimationFrame(laco);
    };
    quadro = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(quadro);
  }, [numeroFinal, totalNumbers, casasDoPainel, inicioMs, duracao]);

  return (
    <span
      ref={painel}
      // O número que passa é ruído para quem ouve a página: sessenta leituras
      // por minuto de um valor que não quer dizer nada. O resultado é
      // anunciado uma vez, no bloco da revelação.
      aria-hidden
      className={cn(
        "font-mono text-5xl font-black tabular-nums tracking-tight text-white sm:text-7xl md:text-8xl",
        numeroFinal == null && "sorteio-tremor",
        className,
      )}
    >
      {numeroFinal != null
        ? preencher(numeroFinal, casasDoPainel)
        : "".padStart(casasDoPainel, "0")}
    </span>
  );
}

/** O mesmo formato do painel, para o resto da tela falar a mesma língua. */
export function numeroFormatado(numero: number, totalNumbers: number): string {
  return preencher(numero, casas(totalNumbers));
}
