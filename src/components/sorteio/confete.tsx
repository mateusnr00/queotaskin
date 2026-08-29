"use client";

// O confete da revelação.
//
// Quarenta pedaços caindo uma vez só, sem repetir. Confete perpétuo vira papel
// de parede em cinco segundos e come bateria de celular a troco de nada; este
// cai, some, e a tela fica com o nome do ganhador, que é o que importa.
//
// Feito de `div` com transform e opacity, as duas propriedades que o navegador
// anima sem recalcular layout. Some inteiro para quem pediu menos movimento.

import { useMemo } from "react";

const PEDACOS = 40;
const CORES = ["#fbbf24", "#f59e0b", "#fde68a", "#ffffff", "#fb923c"];

interface Pedaco {
  id: number;
  esquerda: number;
  atraso: number;
  duracao: number;
  cor: string;
  largura: number;
  altura: number;
}

/**
 * Espalhamento determinístico a partir do índice.
 *
 * `Math.random` seria o caminho óbvio e está errado aqui por duas razões: ela
 * é impura durante a renderização, então servidor e cliente sorteariam
 * posições diferentes e a hidratação brigaria; e o compilador do React recusa,
 * com razão. A parte fracionária de um seno grande espalha tão bem quanto para
 * um punhado de quadradinhos caindo, e é a mesma em todo lugar.
 */
function espalhar(semente: number): number {
  const x = Math.sin(semente * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function Confete() {
  // Calculado uma vez. Recalcular a cada renderização faria os pedaços
  // saltarem de posição no meio da queda.
  const pedacos: Pedaco[] = useMemo(
    () =>
      Array.from({ length: PEDACOS }, (_, i) => ({
        id: i,
        esquerda: espalhar(i + 1) * 100,
        atraso: espalhar(i + 41) * 0.9,
        duracao: 2.4 + espalhar(i + 83) * 1.6,
        cor: CORES[i % CORES.length],
        largura: 6 + espalhar(i + 127) * 5,
        altura: 9 + espalhar(i + 173) * 7,
      })),
    [],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pedacos.map((p) => (
        <span
          key={p.id}
          className="confete absolute top-0 block rounded-[2px]"
          style={{
            left: `${p.esquerda}%`,
            width: p.largura,
            height: p.altura,
            background: p.cor,
            animationDelay: `${p.atraso}s`,
            animationDuration: `${p.duracao}s`,
          }}
        />
      ))}
    </div>
  );
}
