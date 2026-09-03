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
  // Só depois que a fita para. Durante a corrida o marcador fica neutro:
  // pintado da cor do prêmio, ele entregaria o resultado antes da hora.
  const [parou, setParou] = useState(false);
  // A reta final: os últimos instantes antes de a fita encostar. O destaque
  // do vencedor começa aqui, de leve, em vez de aparecer de uma vez no fim.
  const [retaFinal, setRetaFinal] = useState(false);
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
      setRetaFinal(true);
      setParou(true);
      const t0 = setTimeout(aoTerminar, 400);
      return () => clearTimeout(t0);
    }

    // Um quadro parado no começo, para o navegador registrar a posição
    // inicial antes da transição: sem isso ele funde as duas e não anima.
    const inicio = requestAnimationFrame(() => {
      setCorrendo(true);
      setDeslocamento(alvo);
    });
    const reta = setTimeout(() => setRetaFinal(true), DURACAO_MS - 600);
    const parada = setTimeout(() => setParou(true), DURACAO_MS - 120);
    const fim = setTimeout(aoTerminar, DURACAO_MS + 420);
    return () => {
      cancelAnimationFrame(inicio);
      clearTimeout(reta);
      clearTimeout(parada);
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
          // O DESVANECIMENTO É PROPOSITAL, E MAIS LARGO QUE ANTES.
          //
          // Corte reto faz o badge sumir de repente e chama atenção para a
          // moldura em vez da fita. Com a passagem longa, o item das pontas
          // parece entrar e sair da luz, e não ser cortado por falta de
          // espaço. As paradas intermediárias suavizam o meio do caminho.
          maskImage:
            "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 8%, black 26%, black 74%, rgba(0,0,0,0.35) 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 8%, black 26%, black 74%, rgba(0,0,0,0.35) 92%, transparent 100%)",
        }}
      >
        <div
          ref={trilho}
          className="flex items-center gap-5 will-change-transform sm:gap-6 lg:gap-7"
          style={{
            transform: `translate3d(${deslocamento}px, 0, 0)`,
            // Desaceleração longa: arranca rápido e chega devagar, que é o
            // que cria o suspense no fim. Curva de saída, não linear.
            transition: correndo
              ? `transform ${DURACAO_MS}ms cubic-bezier(0.12, 0.78, 0.09, 1)`
              : undefined,
          }}
        >
          {fita.map((item, i) => {
            const ehVencedor = i === POSICAO_DO_VENCEDOR;
            return (
            <div
              key={i}
              // O FOCO ACONTECE UMA VEZ, NA PARADA.
              //
              // Não é animação por quadro: é uma troca de estilo única quando
              // a fita para. O vencedor cresce um fio e o resto recua em
              // opacidade, o suficiente para o olho saber onde pousar sem
              // desfoque, 3D nem perspectiva.
              style={{
                width: "var(--w)",
                // Dois tempos: um fio de destaque nos últimos 600ms, e o
                // resto quando a fita encosta. Subir tudo de uma vez no fim
                // parecia um estalo; assim o olho já está no lugar certo
                // quando o vencedor para.
                transform: ehVencedor
                  ? parou
                    ? "scale(1.07)"
                    : retaFinal
                      ? "scale(1.03)"
                      : undefined
                  : undefined,
                opacity: ehVencedor ? 1 : parou ? 0.4 : retaFinal ? 0.72 : 1,
                transition:
                  "transform 600ms cubic-bezier(0.32,0.72,0,1), opacity 600ms ease-out",
              }}
              // A largura sai da QUANTIDADE VISÍVEL, não do que parece bonito
              // isolado: três badges no celular, seis no desktop. Menos e a
              // fita não parece fita; mais e o multiplicador deixa de ser
              // legível enquanto os itens desaceleram, que é justamente
              // quando alguém está tentando ler.
              className="shrink-0 [--w:80px] sm:[--w:98px] lg:[--w:110px]"
            >
              <XpBoostBadge
                multiplier={item.multiplier}
                color={item.color}
                size="sm"
                decorativo
                className="h-auto w-full"
              />
            </div>
            );
          })}
        </div>
      </div>

      {/* O MARCADOR.
          Um fio de cabelo e dois indicadores pequenos, e nada mais. A versão
          anterior era uma linha cheia atravessando a área inteira, que num
          fundo escuro lia como elemento de depuração e brigava com a fita
          pela atenção.

          Neutro durante a corrida: pintado da cor do prêmio, ele entregaria
          o resultado antes da hora. A cor entra quando a fita para. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 flex-col items-center"
      >
        <span
          className="h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent transition-colors duration-500"
          style={{ borderTopColor: parou ? vencedor.color : "rgba(255,255,255,0.38)" }}
        />
        <span
          className="w-px flex-1 transition-all duration-500"
          style={{
            backgroundColor: parou ? vencedor.color : "rgba(255,255,255,0.5)",
            opacity: parou ? 0.28 : 0.09,
          }}
        />
        <span
          className="h-0 w-0 border-x-[4px] border-b-[5px] border-x-transparent transition-colors duration-500"
          style={{ borderBottomColor: parou ? vencedor.color : "rgba(255,255,255,0.38)" }}
        />
      </div>

    </div>
  );
}
