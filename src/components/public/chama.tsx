// O fogo da promoção em dobro, desenhado em CSS.
//
// Quatro camadas e três fagulhas. Cada uma com a própria duração, e é a
// diferença entre elas que faz o fogo parecer vivo: nenhuma repete junto com
// outra, então o ciclo completo é longo demais para o olho fechar.
//
// O que separa este fogo de uma gota girando é o contorno mudar junto com o
// movimento: `border-radius` entra nos keyframes, não só o `transform`.
//
// Tudo aqui é enfeite: nenhuma informação da faixa depende do fogo. Por isso o
// bloco inteiro é `aria-hidden`, em vez de virar mais um "imagem" anunciado no
// meio do título.

import { cn } from "@/lib/utils";

export function Chama({
  /**
   * Escala do palco de 72px. 0,55 dá uma chama de 40px, do tamanho de um
   * título de faixa.
   */
  escala = 0.55,
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
        <span className="chama-parte chama-esquerda">
          <span className="chama-corpo" />
        </span>
        <span className="chama-parte chama-centro">
          <span className="chama-corpo" />
        </span>
        <span className="chama-parte chama-direita">
          <span className="chama-corpo" />
        </span>
        <span className="chama-parte chama-base">
          <span className="chama-corpo" />
        </span>
        <span className="chama-fagulha chama-fagulha-1" />
        <span className="chama-fagulha chama-fagulha-2" />
        <span className="chama-fagulha chama-fagulha-3" />
      </span>
    </span>
  );
}
