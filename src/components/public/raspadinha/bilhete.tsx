"use client";

// O bilhete da Raspadinha Premiada.
//
// A ideia é um objeto físico dentro da interface, não um cartão de UI. O que
// constrói isso, em ordem de importância:
//
//   a proporção            1.55:1, de bilhete e não de card
//   a borda em gradiente   ouro nasce de faixas claras e escuras, nunca de
//                          um amarelo chapado, que lê como plástico
//   o serrilhado           recortes nas duas pontas, como talão destacado
//   as camadas             prêmio embaixo, película por cima, e o gesto
//                          removendo a de cima de verdade
//   os microdetalhes       filete interno, número impresso, marcas laterais
//
// Nada de neon, nada de roxo, nada de emoji. O brilho em repouso é lento e
// discreto: é o que faz o papel parecer metálico sem virar letreiro.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { desenharChamada, desenharPelicula } from "./pelicula";
import { LIMITE_DE_RASPAGEM, useRaspagem } from "./use-raspagem";
import { Particulas, type ControleDeParticulas } from "./particulas";
import { cn } from "@/lib/utils";

export type EstadoDoBilhete =
  | "disponivel"
  | "raspando"
  | "revelando"
  | "premiada"
  | "sem-premio";

export interface PremioNoBilhete {
  tipo: "PIX" | "SKIN";
  rotulo: string;
  valor: number | null;
}

export function Bilhete({
  numero,
  posicao,
  estado,
  premio,
  aoRevelar,
  compacto = false,
}: {
  /** O número impresso, já formatado com zeros. */
  numero: string;
  /** A ordem na coleção: 01, 02, 03. */
  posicao: number;
  estado: EstadoDoBilhete;
  premio: PremioNoBilhete | null;
  /** Chamado quando o gesto passa do limite. Quem chama busca o resultado. */
  aoRevelar: () => void;
  /** Na grade os bilhetes são menores e o texto encolhe junto. */
  compacto?: boolean;
}) {
  const revelado = estado === "premiada" || estado === "sem-premio";
  const ganhou = estado === "premiada";
  const [saindo, setSaindo] = useState(false);
  const [impacto, setImpacto] = useState(false);
  const particulas = useRef<ControleDeParticulas | null>(null);
  const luz = useRef(0.5);
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Todo timer criado aqui morre com o componente. Sem isso, sair da página
  // no meio da revelação deixaria um setState apontando para o vazio.
  const depois = useCallback((ms: number, fn: () => void) => {
    relogios.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(
    () => () => {
      for (const r of relogios.current) clearTimeout(r);
    },
    [],
  );

  const pintar = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      desenharPelicula(ctx, w, h, luz.current);
      desenharChamada(ctx, w, h);
    },
    [],
  );

  const concluir = useCallback(() => {
    // A pausa antes de terminar sozinho. Sem ela a película some no mesmo
    // quadro em que o dedo cruza o limite, e o movimento parece um corte.
    setImpacto(true);
    depois(130, () => {
      setSaindo(true);
      aoRevelar();
    });
  }, [aoRevelar, depois]);

  const { refDoCanvas, comecou, concluiu, revelarSemGesto } = useRaspagem({
    ativo: estado === "disponivel" || estado === "raspando",
    aoConcluir: concluir,
    desenharPelicula: pintar,
    aoRaspar: (x, y) => particulas.current?.emitir(x, y),
  });

  // O reflexo da película acompanha o ponteiro no desktop. Em ref e sem
  // repintura por evento: só o próximo traço usa a posição nova.
  function seguirLuz(e: React.PointerEvent) {
    const caixa = e.currentTarget.getBoundingClientRect();
    luz.current = Math.min(1, Math.max(0, (e.clientX - caixa.left) / caixa.width));
  }

  const peliculaSaiu = saindo || revelado || concluiu;

  return (
    <figure
      className={cn(
        "group relative select-none",
        ganhou && !compacto && "bilhete-premiado",
      )}
    >
      <div
        className={cn(
          "bilhete-dourado bilhete-serrilha relative overflow-hidden rounded-2xl transition-transform duration-200",
          // A elevação no hover é do mouse; no toque não existe hover e o
          // bilhete não pode depender dela para parecer tocável.
          "md:group-hover:-translate-y-[3px]",
          impacto && "bilhete-impacto",
        )}
        style={{ aspectRatio: "1.55 / 1" }}
        onPointerMove={seguirLuz}
      >
        {/* O brilho em repouso, atravessando o bilhete devagar. */}
        {!revelado && (
          <span
            aria-hidden
            className="bilhete-reflexo pointer-events-none absolute -inset-y-8 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          />
        )}
        {/* A varredura de luz do momento da vitória. */}
        {ganhou && (
          <span
            aria-hidden
            className="bilhete-varredura pointer-events-none absolute -inset-y-8 left-0 z-30 w-1/3 bg-gradient-to-r from-transparent via-amber-100/50 to-transparent"
          />
        )}

        {/* Filete interno: o segundo fio de ouro, que é o que faz o papel
            parecer impresso e não recortado. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[6px] rounded-xl border border-[color:var(--ouro-medio)]/25"
        />

        <div className="relative flex h-full flex-col px-4 py-3 md:px-5">
          {/* ================= TOPO ================= */}
          <header className="flex items-start justify-between gap-2">
            <div className="leading-none">
              <p
                className={cn(
                  "font-black tracking-[0.18em] text-[color:var(--ouro-claro)]",
                  compacto ? "text-[9px]" : "text-[11px]",
                )}
              >
                QUÉ OTA?
              </p>
              <p
                className={cn(
                  "mt-0.5 font-black tracking-[0.32em] text-[color:var(--champanhe)]/70",
                  compacto ? "text-[8px]" : "text-[10px]",
                )}
              >
                SKIN
              </p>
            </div>
            <p
              className={cn(
                "shrink-0 rounded-full border border-[color:var(--ouro-medio)]/40 px-2 py-0.5 font-bold tabular-nums text-[color:var(--ouro-claro)]",
                compacto ? "text-[8px]" : "text-[9px]",
              )}
            >
              {posicao.toString().padStart(2, "0")}
            </p>
          </header>

          <p
            className={cn(
              "mt-1 font-bold uppercase tracking-[0.24em] text-[color:var(--champanhe)]/55",
              compacto ? "text-[7px]" : "text-[9px]",
            )}
          >
            Raspadinha Premiada
          </p>

          {/* ============== ÁREA RASPÁVEL ============== */}
          {/* min-h é piso de segurança, não estética. A área é flex-1 dentro
              de uma altura fechada pela proporção: se o cabeçalho e o rodapé
              crescerem (fonte maior do sistema, tradução mais longa), o
              flex-1 chega a zero e o canvas some sem erro nenhum. Foi o que
              aconteceu na primeira medição. */}
          <div className="relative mt-2 min-h-[72px] flex-1 overflow-hidden rounded-lg ring-1 ring-inset ring-black/40">
            {/* O prêmio fica atrás e está sempre desenhado: é ele que aparece
                conforme a película some. Só entra na árvore quando o servidor
                já respondeu, então antes disso não há o que espiar. */}
            <div className="absolute inset-0 bg-[#0d0f13]">
              <Conteudo estado={estado} premio={premio} compacto={compacto} />
            </div>

            {!peliculaSaiu && (
              <Particulas ref={particulas} className="absolute inset-0 z-10" />
            )}

            {/* A película. touch-none impede o navegador de tratar o arrasto
                como rolagem antes de o evento chegar aqui; a rolagem normal
                da página segue livre fora deste retângulo. */}
            <canvas
              ref={refDoCanvas}
              aria-hidden
              className={cn(
                "absolute inset-0 z-20 h-full w-full touch-none",
                peliculaSaiu && "pelicula-dissolve",
                !revelado && !comecou && "cursor-grab active:cursor-grabbing",
              )}
            />

            {/* A saída para quem não consegue arrastar. Discreta, mas sempre
                presente: raspar é gesto, e gesto exclui gente. */}
            {!revelado && !comecou && (
              <button
                type="button"
                onClick={revelarSemGesto}
                className="absolute bottom-1 right-1 z-30 rounded-md bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[color:var(--champanhe)] backdrop-blur-sm transition-colors hover:bg-black/70"
              >
                Revelar
              </button>
            )}
          </div>

          {/* ================= RODAPÉ ================= */}
          <footer className="mt-2 flex items-center justify-between gap-2">
            <span
              aria-hidden
              className="h-px flex-1 bg-gradient-to-r from-transparent to-[color:var(--ouro-medio)]/35"
            />
            <p
              className={cn(
                "shrink-0 font-mono tracking-wider text-[color:var(--champanhe)]/60",
                compacto ? "text-[8px]" : "text-[10px]",
              )}
            >
              TICKET Nº {numero}
            </p>
            <span
              aria-hidden
              className="h-px flex-1 bg-gradient-to-l from-transparent to-[color:var(--ouro-medio)]/35"
            />
          </footer>
        </div>
      </div>

      {/* O resultado precisa ser dito, e não só mostrado: quem usa leitor de
          tela não vê a película sair. */}
      <p className="sr-only" role="status" aria-live="polite">
        {estado === "premiada" && premio
          ? `Bilhete ${numero}: prêmio encontrado, ${premio.rotulo}.`
          : estado === "sem-premio"
            ? `Bilhete ${numero}: não foi dessa vez.`
            : ""}
      </p>
    </figure>
  );
}

/** O que aparece atrás da película. */
function Conteudo({
  estado,
  premio,
  compacto,
}: {
  estado: EstadoDoBilhete;
  premio: PremioNoBilhete | null;
  compacto: boolean;
}) {
  if (estado === "revelando") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ouro-claro)]" />
      </div>
    );
  }

  if (estado === "premiada" && premio) {
    return (
      <div className="premio-surge flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
        <p
          className={cn(
            "font-bold uppercase tracking-[0.2em] text-[color:var(--ouro-claro)]",
            compacto ? "text-[8px]" : "text-[10px]",
          )}
        >
          Prêmio encontrado
        </p>
        <p
          className={cn(
            "font-black leading-tight text-[color:var(--ouro-brilho)]",
            compacto ? "text-base" : "text-2xl",
          )}
        >
          {premio.tipo === "PIX" && premio.valor != null
            ? premio.valor.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                minimumFractionDigits: 0,
              })
            : premio.rotulo}
        </p>
        {premio.tipo === "PIX" && (
          <p
            className={cn(
              "font-bold uppercase tracking-[0.28em] text-[color:var(--champanhe)]/70",
              compacto ? "text-[8px]" : "text-[10px]",
            )}
          >
            no Pix
          </p>
        )}
      </div>
    );
  }

  if (estado === "sem-premio") {
    // Sem vermelho, sem cara triste, sem animação de fracasso. O bilhete só
    // assume o estado final: não deu, e ninguém errou nada.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
        <p
          className={cn(
            "font-bold uppercase tracking-[0.18em] text-[color:var(--champanhe)]/75",
            compacto ? "text-[9px]" : "text-xs",
          )}
        >
          Não foi dessa vez
        </p>
        {!compacto && (
          <p className="text-[10px] leading-relaxed text-[color:var(--champanhe)]/45">
            Essa raspadinha não possui prêmio.
          </p>
        )}
      </div>
    );
  }

  // Antes de raspar não há nada atrás: o resultado ainda não foi sorteado no
  // servidor, e não existe nem aqui nem na resposta que montou esta página.
  return null;
}

export { LIMITE_DE_RASPAGEM };
