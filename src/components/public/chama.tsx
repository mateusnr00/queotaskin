// O fogo da promoção em dobro, desenhado em CSS.
//
// Quatro camadas: a chama da esquerda, a do centro, a da direita e a base
// borrada que dá volume. Cada uma com a própria duração, e é a diferença entre
// elas que faz o fogo parecer vivo: 2s numa lateral, 3s na outra, 3s no centro
// e 2s no brilho da base. Nenhuma repete junto com a outra, então o ciclo
// completo é longo demais para o olho fechar.
//
// Tudo aqui é enfeite: nenhuma informação da faixa depende do fogo. Por isso o
// bloco inteiro é `aria-hidden`, em vez de virar mais um "imagem" anunciado no
// meio do título.

import { cn } from "@/lib/utils";

export function Chama({
  /**
   * Escala do desenho. O medalhão sai com 210 vezes este valor, porque o
   * desenho pintado ocupa quase o dobro do palco depois das rotações.
   * 0,22 dá um disco de 46px, do tamanho de um título de faixa.
   */
  escala = 0.22,
  className,
}: {
  escala?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("chama", className)}
      style={{ "--escala": escala } as React.CSSProperties}
    >
      <span className="chama-palco">
        <span className="chama-esquerda">
          <span className="chama-corpo" />
          <span className="chama-fagulha" />
        </span>
        <span className="chama-centro">
          <span className="chama-corpo" />
          <span className="chama-fagulha" />
        </span>
        <span className="chama-direita">
          <span className="chama-corpo" />
          <span className="chama-fagulha" />
        </span>
        <span className="chama-base">
          <span className="chama-corpo" />
        </span>
      </span>
    </span>
  );
}
