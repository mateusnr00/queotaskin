"use client";

// A roleta que revela o boost. Inspirada no ritmo de abertura do CS, não no
// asset dele: fita horizontal, arranque rápido, desaceleração longa, e os
// últimos itens passando devagar até parar.
//
// O PRÊMIO JÁ ESTÁ DECIDIDO ANTES DA FITA EXISTIR.
//
// O servidor sorteou, gravou e respondeu. A fita é montada DEPOIS, em volta
// de um resultado que já está no banco: os trinta e tantos badges são enfeite
// e não têm relação nenhuma com a probabilidade. Ver quatro 3.5x passando não
// muda a chance de nada, e fechar a aba no meio não muda o prêmio.
//
// O ALINHAMENTO É CALCULADO, NÃO ESTIMADO.
//
// A parada usa a largura real do badge, o espaçamento real e a metade real do
// container, medidos do DOM. "Parecer centralizado" quebra em 320px e em tela
// larga; a conta fecha em qualquer largura. O desvio final é de propósito e
// pequeno, para o badge não parar num alinhamento de régua, que parece
// programado.
//
// UM ELEMENTO ANIMADO, NÃO TRINTA.
//
// A fita inteira é um único `transform: translate3d` numa transição de CSS.
// Animar cada badge, ou mexer em estado do React a cada quadro, entregaria
// os mesmos seis segundos com o ventilador ligado.

import { useEffect, useMemo, useRef, useState } from "react";

import { XpBoostBadge } from "@/components/public/xp-boost-badge";
import { cn } from "@/lib/utils";

export interface ItemDaFita {
  multiplier: number;
  color: string;
}

/** Quantos badges a fita tem. Suficiente para a corrida ter fôlego. */
const TAMANHO_DA_FITA = 44;
/** A posição do vencedor: perto do fim, com alguns depois dele para a fita
 *  não terminar no ar quando ele para. */
const POSICAO_DO_VENCEDOR = TAMANHO_DA_FITA - 6;
const DURACAO_MS = 6200;

/**
 * Monta a fita em volta do vencedor.
 *
 * O sorteio decorativo usa `Math.random` de propósito: aqui ele não escolhe
 * prêmio nenhum, só a ordem visual dos que passam voando.
 *
 * A vizinhança do vencedor recebe um item raro DE VEZ EM QUANDO, não sempre:
 * tensão que acontece toda vez deixa de ser tensão e vira aviso de que o
 * prêmio bom está chegando.
 */
export function montarFita(
  vencedor: ItemDaFita,
  possiveis: readonly ItemDaFita[],
  sortear: () => number = Math.random,
): ItemDaFita[] {
  const pool = possiveis.length > 0 ? possiveis : [vencedor];
  const fita: ItemDaFita[] = Array.from({ length: TAMANHO_DA_FITA }, () => {
    const i = Math.floor(sortear() * pool.length) % pool.length;
    return pool[i]!;
  });
  fita[POSICAO_DO_VENCEDOR] = vencedor;

  // O vizinho de tensão, em cerca de um terço das aberturas.
  if (sortear() < 0.35 && pool.length > 1) {
    const raros = [...pool].sort((a, b) => b.multiplier - a.multiplier);
    const raro = raros[0]!;
    if (raro.multiplier !== vencedor.multiplier) {
      fita[POSICAO_DO_VENCEDOR + 1] = raro;
    }
  }
  return fita;
}

export function RoletaDeBoost({
  vencedor,
  possiveis,
  aoTerminar,
  className,
}: {
  vencedor: ItemDaFita;
  possiveis: readonly ItemDaFita[];
  aoTerminar: () => void;
  className?: string;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const janela = useRef<HTMLDivElement>(null);
  const [deslocamento, setDeslocamento] = useState(0);
  const [correndo, setCorrendo] = useState(false);
  // A corrida acontece UMA VEZ, e a trava é esta.
  //
  // Sem ela o efeito reiniciava a cada render, e havia um render por segundo:
  // o contador regressivo da revelação mora no mesmo modal. A cada tique o
  // relógio de término era cancelado e recriado, e a revelação nunca chegava.
  // O prêmio já estava certo no banco o tempo todo; o que não vinha era a tela.
  const jaCorreu = useRef(false);

  // O vencedor entra na fita por VALOR, não por referência: o pai monta o
  // objeto no JSX, e um objeto novo a cada render remontava a fita inteira.
  const fita = useMemo(
    () => montarFita(vencedor, possiveis),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vencedor.multiplier, vencedor.color, possiveis],
  );

  useEffect(() => {
    if (jaCorreu.current) return;
    jaCorreu.current = true;

    const j = janela.current;
    const t = trilho.current;
    if (!j || !t) return;

    const semMovimento = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // A conta do alinhamento: metade da janela, menos o centro do badge
    // vencedor dentro da fita. Tudo medido do DOM, então vale em 320px e em
    // tela larga sem número mágico.
    const primeiro = t.children[0] as HTMLElement | undefined;
    const segundo = t.children[1] as HTMLElement | undefined;
    if (!primeiro) return;
    const larguraDoItem = primeiro.offsetWidth;
    const passo = segundo ? segundo.offsetLeft - primeiro.offsetLeft : larguraDoItem;
    const centroDaJanela = j.clientWidth / 2;
    const centroDoVencedor = POSICAO_DO_VENCEDOR * passo + larguraDoItem / 2;
    // Um desvio pequeno para não parar na régua exata: parada perfeitamente
    // simétrica toda vez parece programada, e não sorteada.
    const desvio = semMovimento ? 0 : (Math.random() - 0.5) * larguraDoItem * 0.18;
    const alvo = centroDaJanela - centroDoVencedor - desvio;

    if (semMovimento) {
      // Sem animação: vai direto ao resultado. O prêmio é o mesmo.
      setDeslocamento(alvo);
      const t0 = setTimeout(aoTerminar, 400);
      return () => clearTimeout(t0);
    }

    // Um quadro parado no começo, para o navegador registrar a posição
    // inicial antes da transição: sem isso ele funde as duas e não anima.
    const inicio = requestAnimationFrame(() => {
      setCorrendo(true);
      setDeslocamento(alvo);
    });
    const fim = setTimeout(aoTerminar, DURACAO_MS + 250);
    return () => {
      cancelAnimationFrame(inicio);
      clearTimeout(fim);
    };
    // Roda na montagem e só. As dependências ficam de fora de propósito: a
    // trava acima é o que garante a passagem única, e listá-las aqui só
    // reintroduziria o reinício que o `jaCorreu` existe para impedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("relative", className)}>
      {/* A JANELA. As bordas desbotam em vez de cortar a seco: corte reto faz
          o badge sumir de repente e chama atenção para a moldura, não para a
          fita. */}
      <div
        ref={janela}
        className="relative overflow-hidden py-4"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <div
          ref={trilho}
          className="flex items-center gap-3 will-change-transform sm:gap-4"
          style={{
            transform: `translate3d(${deslocamento}px, 0, 0)`,
            // Desaceleração longa: arranca rápido e chega devagar, que é o
            // que cria o suspense no fim. Curva de saída, não linear.
            transition: correndo
              ? `transform ${DURACAO_MS}ms cubic-bezier(0.12, 0.78, 0.09, 1)`
              : undefined,
          }}
        >
          {fita.map((item, i) => (
            <div
              key={i}
              // A largura é escolhida pela QUANTIDADE VISÍVEL, não pelo que
              // parece bonito isolado: cerca de três badges no celular e
              // cinco ou seis no desktop. Menos que isso e a fita não parece
              // uma fita; mais e o vencedor fica pequeno demais para ler.
              className="shrink-0 [--w:70px] sm:[--w:86px] lg:[--w:96px]"
              style={{ width: "var(--w)" }}
            >
              <XpBoostBadge
                multiplier={item.multiplier}
                color={item.color}
                size="sm"
                decorativo
                className="h-auto w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* O MARCADOR. Dois triângulos pequenos, em cima e embaixo, e uma linha
          fina no meio. Fixo: quem se move é a fita. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 flex-col items-center justify-between"
      >
        <span
          className="h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent"
          style={{ borderTopColor: vencedor.color }}
        />
        <span
          className="w-px flex-1 opacity-25"
          style={{ backgroundColor: vencedor.color }}
        />
        <span
          className="h-0 w-0 border-x-[7px] border-b-[9px] border-x-transparent"
          style={{ borderBottomColor: vencedor.color }}
        />
      </div>
    </div>
  );
}
