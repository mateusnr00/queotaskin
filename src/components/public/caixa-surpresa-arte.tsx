import Image from "next/image";

import { cn } from "@/lib/utils";

// A arte da caixa surpresa, fechada e aberta.
//
// Substitui o ícone de presente do lucide onde a caixa aparece: a caixa
// fechada que a pessoa vai abrir no comprovante, o contador de caixas de
// cada degrau na campanha, e o resultado depois de aberta.
//
// Ela aguenta tamanho pequeno melhor do que um render 3D costuma aguentar,
// porque o que identifica a caixa é a cor, engradado laranja com laço
// vermelho, e cor sobrevive à redução. O que se perde a 28px é o fecho e o
// desgaste da tinta, que ninguém procura num contador.
//
// alt vazio de propósito. Em todo lugar onde ela aparece existe o texto
// "Caixa Surpresa" ao lado, e um alt repetiria a mesma palavra para quem usa
// leitor de tela.

const ARTES = {
  fechada: { src: "/caixa-surpresa.webp", largura: 512, altura: 359 },
  // Mais alta que a fechada: a tampa levantada ocupa a metade de cima do
  // arquivo. Por isso a altura sai da própria variante, e não de uma
  // proporção só para as duas, que espremeria a tampa.
  aberta: { src: "/caixa-surpresa-aberta.webp", largura: 512, altura: 429 },
} as const;

export function CaixaSurpresaArte({
  tamanho = 64,
  aberta = false,
  className,
  style,
}: {
  /** Largura em pixels. A altura sai da proporção da arte. */
  tamanho?: number;
  aberta?: boolean;
  className?: string;
  /** Para escalonar o balanço de várias caixas por animationDelay. */
  style?: React.CSSProperties;
}) {
  const arte = aberta ? ARTES.aberta : ARTES.fechada;
  return (
    <Image
      src={arte.src}
      alt=""
      aria-hidden
      width={tamanho}
      height={Math.round((tamanho * arte.altura) / arte.largura)}
      className={cn("shrink-0 select-none", className)}
      style={style}
    />
  );
}

/**
 * A caixa que abre: as duas artes empilhadas, com a troca no tempo certo.
 *
 * As duas ficam montadas o tempo todo, e não só durante a animação. Montar
 * a aberta no clique faria o navegador ir buscar o arquivo no meio da
 * sequência, e a tampa abriria com atraso ou não abriria, dependendo da
 * conexão.
 *
 * Alinhadas pela base, e não centralizadas: a tampa cresce para cima, então
 * é o corpo da caixa que precisa ficar parado na troca. Centralizado, a
 * caixa daria um salto para baixo no instante em que abre.
 *
 * Quem dá o tempo é o CSS (`.caixa-abrindo`, `.tampa-fecha`, `.tampa-abre`
 * em globals.css), não um relógio no JavaScript: encadeado no CSS, uma aba
 * em segundo plano não deixa a caixa parada no meio do caminho.
 */
export function CaixaQueAbre({
  tamanho,
  abrindo,
}: {
  tamanho: number;
  abrindo: boolean;
}) {
  const altura = Math.round(
    (tamanho * ARTES.fechada.altura) / ARTES.fechada.largura
  );
  return (
    <span
      className={cn("relative block shrink-0", abrindo && "caixa-abrindo")}
      style={{ width: tamanho, height: altura }}
    >
      <CaixaSurpresaArte
        tamanho={tamanho}
        className={cn("absolute bottom-0 left-0", abrindo && "tampa-fecha")}
      />
      {/* opacity-0 na base porque sem a animação rodando esta arte cobriria
          a fechada. A animação tem fill both e ganha da classe enquanto vale. */}
      <CaixaSurpresaArte
        aberta
        tamanho={tamanho}
        className={cn(
          "absolute bottom-0 left-0 opacity-0",
          abrindo && "tampa-abre"
        )}
      />
    </span>
  );
}
