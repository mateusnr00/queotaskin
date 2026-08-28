"use client";

// Os fragmentos da película que soltam sob o dedo.
//
// Existem em canvas próprio, e não como elementos: são dezenas de partículas
// nascendo e morrendo por segundo, e criar dezenas de divs por segundo numa
// grade de oito bilhetes derruba o aparelho.
//
// O laço só roda enquanto há partícula viva. Sem isso, um requestAnimationFrame
// por bilhete ficaria girando para sempre em segundo plano, gastando bateria
// para desenhar nada.
//
// Quem pede as partículas é o gesto, por ref: passar por estado do React faria
// cada movimento do dedo re-renderizar o bilhete inteiro.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface ControleDeParticulas {
  emitir: (x: number, y: number) => void;
}

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  tamanho: number;
  claro: boolean;
}

/** Teto de partículas vivas. Passar disso não melhora nada e custa quadros. */
const MAXIMO = 90;

/** Quanto da vida some por quadro, a 60 por segundo. */
const DESGASTE = 0.055;

/** Teto de lado do canvas, em pixels de CSS. Rede de protecao contra medida
    absurda: nenhum bilhete chega perto disso, e um numero fora da escala vira
    canvas que o navegador nao aloca. */
const TETO_DE_LADO = 2000;

export const Particulas = forwardRef<
  ControleDeParticulas,
  { className?: string }
>(function Particulas({ className }, ref) {
  const refDoCanvas = useRef<HTMLCanvasElement | null>(null);
  const vivas = useRef<Particula[]>([]);
  const quadro = useRef<number | null>(null);
  const reduzirMovimento = useRef(false);

  useEffect(() => {
    reduzirMovimento.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Cancela o laço ao desmontar: sem isso, sair da página no meio da
  // raspagem deixaria o quadro agendado desenhando num canvas que já morreu.
  useEffect(
    () => () => {
      if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    },
    [],
  );

  function desenhar() {
    const canvas = refDoCanvas.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      quadro.current = null;
      return;
    }

    // A medida sai do PAI, nunca do proprio canvas. Canvas e elemento
    // substituido: posicionado com inset-0 mas largura automatica, o CSS
    // resolve o tamanho pelo atributo width e ignora o right, entao medir a si
    // mesmo e escrever o resultado de volta multiplicado pela densidade dobra
    // o canvas a cada quadro. Dezessete quadros levam de 300px a 33 milhoes, o
    // navegador desiste de alocar e desenha o icone de imagem quebrada.
    const pai = canvas.parentElement;
    const caixa = (pai ?? canvas).getBoundingClientRect();
    const densidade = Math.min(window.devicePixelRatio || 1, 2);
    const larguraDesejada = Math.round(
      Math.min(caixa.width, TETO_DE_LADO) * densidade,
    );
    const alturaDesejada = Math.round(
      Math.min(caixa.height, TETO_DE_LADO) * densidade,
    );
    if (larguraDesejada < 1 || alturaDesejada < 1) {
      quadro.current = null;
      return;
    }
    if (canvas.width !== larguraDesejada || canvas.height !== alturaDesejada) {
      canvas.width = larguraDesejada;
      canvas.height = alturaDesejada;
    }
    ctx.setTransform(densidade, 0, 0, densidade, 0, 0);
    ctx.clearRect(0, 0, caixa.width, caixa.height);

    const restantes: Particula[] = [];
    for (const p of vivas.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.14; // a gravidade que faz o fragmento cair, e não flutuar
      p.vida -= DESGASTE;
      if (p.vida <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.vida) * 0.85;
      ctx.fillStyle = p.claro ? "#efe7d2" : "#9c9484";
      ctx.fillRect(p.x, p.y, p.tamanho, p.tamanho);
      restantes.push(p);
    }
    ctx.globalAlpha = 1;
    vivas.current = restantes;

    quadro.current = restantes.length > 0 ? requestAnimationFrame(desenhar) : null;
  }

  useImperativeHandle(ref, () => ({
    emitir(x: number, y: number) {
      if (reduzirMovimento.current) return;
      if (vivas.current.length >= MAXIMO) return;
      // Poucas por chamada: o gesto chama isto dezenas de vezes por segundo,
      // e um punhado a cada vez já vira um rastro contínuo.
      const quantas = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < quantas; i++) {
        vivas.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 2.4,
          vy: -Math.random() * 1.6 - 0.2,
          vida: 0.7 + Math.random() * 0.3,
          tamanho: 1 + Math.round(Math.random() * 1.5),
          claro: Math.random() > 0.45,
        });
      }
      // Só liga o laço quando há o que desenhar.
      if (quadro.current === null) {
        quadro.current = requestAnimationFrame(desenhar);
      }
    },
  }));

  return (
    <canvas
      ref={refDoCanvas}
      aria-hidden
      className={`${className} pointer-events-none h-full w-full`}
    />
  );
});
