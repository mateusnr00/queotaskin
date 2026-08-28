"use client";

// A raspagem de verdade, em canvas.
//
// POR QUE NADA DISSO PASSA POR ESTADO DO REACT
//
// pointermove dispara dezenas de vezes por segundo. Um setState por evento
// re-renderizaria a arvore inteira a cada milimetro de dedo, e numa grade de
// oito bilhetes isso trava o aparelho. Aqui tudo de alta frequencia vive em
// ref, o desenho acontece direto no contexto do canvas, e o React so e
// avisado quando algo que a tela precisa mostrar muda de verdade: comecou a
// raspar, e passou do limite.
//
// O PROGRESSO NAO E CONTADO A CADA MOVIMENTO
//
// Contar pixel transparente e varrer o bitmap inteiro. Fazer isso a cada
// pointermove seria varrer centenas de milhares de pixels por segundo. Em
// vez disso conta a cada 120ms, e por amostragem: le um pixel a cada quatro
// em cada eixo, ou seja um em dezesseis. O erro dessa amostra e muito menor
// que a folga do limite de 65%, e o custo cai na mesma proporcao.

import { useCallback, useEffect, useRef, useState } from "react";

/** A partir daqui o bilhete se revela sozinho. */
export const LIMITE_DE_RASPAGEM = 0.65;

/** De quanto em quanto tempo medir o quanto ja foi raspado. */
const INTERVALO_DE_MEDIDA = 120;

/** Um pixel a cada quatro, nos dois eixos. */
const PASSO_DA_AMOSTRA = 4;

export interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  tamanho: number;
}

export interface UseRaspagem {
  refDoCanvas: React.RefObject<HTMLCanvasElement | null>;
  /** Verdadeiro assim que o primeiro traco acontece. */
  comecou: boolean;
  /** Verdadeiro quando passou do limite. */
  concluiu: boolean;
  /** Raspa tudo de uma vez, para o botao acessivel e para "raspar todas". */
  revelarSemGesto: () => void;
}

export function useRaspagem({
  ativo,
  aoComecar,
  aoConcluir,
  desenharPelicula,
  aoRaspar,
}: {
  /** Falso trava o gesto: bilhete ja revelado ou revelando. */
  ativo: boolean;
  aoComecar?: () => void;
  aoConcluir: () => void;
  /** Pinta a pelicula. Chamado no monte e a cada mudanca de tamanho. */
  desenharPelicula: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Avisa onde o dedo passou, para as particulas. */
  aoRaspar?: (x: number, y: number) => void;
}): UseRaspagem {
  const refDoCanvas = useRef<HTMLCanvasElement | null>(null);
  const [comecou, setComecou] = useState(false);
  const [concluiu, setConcluiu] = useState(false);

  // Tudo o que muda a cada evento fica aqui, fora do ciclo de render.
  const raspando = useRef(false);
  const ultimoPonto = useRef<{ x: number; y: number } | null>(null);
  const ultimaMedida = useRef(0);
  const jaConcluiu = useRef(false);
  const jaComecou = useRef(false);

  /** Pinta a pelicula no tamanho atual, respeitando a densidade da tela. */
  const prepararCanvas = useCallback(() => {
    const canvas = refDoCanvas.current;
    if (!canvas) return;
    const caixa = canvas.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) return;

    // devicePixelRatio, senao a pelicula fica borrada em tela Retina. O teto
    // de 2 e proposital: acima disso o bitmap quadruplica e o ganho visual
    // e nulo para uma textura metalica.
    const densidade = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(caixa.width * densidade);
    canvas.height = Math.round(caixa.height * densidade);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(densidade, 0, 0, densidade, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, caixa.width, caixa.height);
    desenharPelicula(ctx, caixa.width, caixa.height);
  }, [desenharPelicula]);

  useEffect(() => {
    prepararCanvas();
    const canvas = refDoCanvas.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    // Redesenha ao mudar de tamanho: girar o telefone com o bilhete pela
    // metade deixaria a pelicula esticada sobre um canvas de outro tamanho.
    // Só repinta enquanto ninguem raspou, senao o giro devolveria a pelicula
    // inteira e apagaria o que a pessoa ja tinha tirado.
    const observador = new ResizeObserver(() => {
      if (!jaComecou.current) prepararCanvas();
    });
    observador.observe(canvas);
    return () => observador.disconnect();
  }, [prepararCanvas]);

  /** Quanto da pelicula ja saiu, por amostragem. */
  const medirProgresso = useCallback((): number => {
    const canvas = refDoCanvas.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return 0;

    const { width, height } = canvas;
    if (width === 0 || height === 0) return 0;
    const dados = ctx.getImageData(0, 0, width, height).data;

    let vistos = 0;
    let vazios = 0;
    for (let y = 0; y < height; y += PASSO_DA_AMOSTRA) {
      for (let x = 0; x < width; x += PASSO_DA_AMOSTRA) {
        // +3 é o canal alfa. Meio transparente ja conta como raspado: a borda
        // do pincel e suave, e exigir alfa zero subestimaria o progresso.
        vazios += dados[(y * width + x) * 4 + 3] < 128 ? 1 : 0;
        vistos++;
      }
    }
    return vistos === 0 ? 0 : vazios / vistos;
  }, []);

  /** Apaga a pelicula ao longo do traco, e nao em circulos soltos. */
  const raspar = useCallback(
    (x: number, y: number) => {
      const canvas = refDoCanvas.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const caixa = canvas.getBoundingClientRect();
      // O pincel acompanha o tamanho do bilhete: fixo em pixels, ficaria
      // grosso demais no cartao pequeno da grade e fino demais no grande.
      const raio = Math.max(14, Math.min(24, caixa.width * 0.055));

      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = raio * 2;

      const anterior = ultimoPonto.current;
      if (anterior) {
        // A linha entre os dois pontos: o dedo anda mais rapido que os
        // eventos, e so circulos deixariam buracos separados no rastro.
        ctx.beginPath();
        ctx.moveTo(anterior.x, anterior.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, raio, 0, Math.PI * 2);
        ctx.fill();
      }
      ultimoPonto.current = { x, y };
      aoRaspar?.(x, y);

      const agora = performance.now();
      if (agora - ultimaMedida.current < INTERVALO_DE_MEDIDA) return;
      ultimaMedida.current = agora;

      if (medirProgresso() >= LIMITE_DE_RASPAGEM && !jaConcluiu.current) {
        jaConcluiu.current = true;
        raspando.current = false;
        setConcluiu(true);
        aoConcluir();
      }
    },
    [aoConcluir, aoRaspar, medirProgresso],
  );

  const pontoLocal = (e: PointerEvent | React.PointerEvent) => {
    const canvas = refDoCanvas.current;
    if (!canvas) return null;
    const caixa = canvas.getBoundingClientRect();
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
  };

  useEffect(() => {
    const canvas = refDoCanvas.current;
    if (!canvas || !ativo) return;

    function comecar(e: PointerEvent) {
      if (jaConcluiu.current) return;
      raspando.current = true;
      ultimoPonto.current = null;
      // Captura o ponteiro: sem isso, arrastar o dedo para fora do bilhete
      // interrompe a raspagem no meio e o traco volta cortado.
      canvas?.setPointerCapture?.(e.pointerId);
      if (!jaComecou.current) {
        jaComecou.current = true;
        setComecou(true);
        aoComecar?.();
      }
      const p = pontoLocal(e);
      if (p) raspar(p.x, p.y);
    }

    function mover(e: PointerEvent) {
      if (!raspando.current) return;
      // A pagina so para de rolar ENQUANTO o dedo esta raspando dentro do
      // bilhete. Bloquear sempre prenderia a pessoa na tela ao tentar so
      // passar por cima da area para chegar no resto do conteudo.
      e.preventDefault();
      const p = pontoLocal(e);
      if (p) raspar(p.x, p.y);
    }

    function parar(e: PointerEvent) {
      raspando.current = false;
      ultimoPonto.current = null;
      canvas?.releasePointerCapture?.(e.pointerId);
    }

    canvas.addEventListener("pointerdown", comecar);
    // passive: false porque o preventDefault acima precisa valer; com o
    // padrao do navegador em touch, ele seria ignorado.
    canvas.addEventListener("pointermove", mover, { passive: false });
    canvas.addEventListener("pointerup", parar);
    canvas.addEventListener("pointercancel", parar);
    canvas.addEventListener("pointerleave", parar);

    return () => {
      canvas.removeEventListener("pointerdown", comecar);
      canvas.removeEventListener("pointermove", mover);
      canvas.removeEventListener("pointerup", parar);
      canvas.removeEventListener("pointercancel", parar);
      canvas.removeEventListener("pointerleave", parar);
    };
  }, [ativo, aoComecar, raspar]);

  /** Sem gesto: o botao acessivel e o "raspar todas" entram por aqui. */
  const revelarSemGesto = useCallback(() => {
    if (jaConcluiu.current) return;
    jaConcluiu.current = true;
    jaComecou.current = true;
    setComecou(true);
    setConcluiu(true);
    aoConcluir();
  }, [aoConcluir]);

  return { refDoCanvas, comecou, concluiu, revelarSemGesto };
}
