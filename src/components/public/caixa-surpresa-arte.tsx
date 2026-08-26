import Image from "next/image";

import { cn } from "@/lib/utils";

// A arte da caixa surpresa.
//
// Substitui o ícone de presente do lucide onde a caixa aparece: a caixa
// fechada que a pessoa vai abrir no comprovante, e o contador de caixas de
// cada degrau na campanha.
//
// Ela aguenta tamanho pequeno melhor do que um render 3D costuma aguentar,
// porque o que identifica a caixa é a cor, engradado laranja com laço
// vermelho, e cor sobrevive à redução. O que se perde a 28px é o fecho e o
// desgaste da tinta, que ninguém procura num contador.
//
// alt vazio de propósito. Em todo lugar onde ela aparece existe o texto
// "Caixa Surpresa" ao lado, e um alt repetiria a mesma palavra para quem usa
// leitor de tela.

const ARTE = {
  src: "/caixa-surpresa.webp",
  largura: 512,
  altura: 359,
} as const;

export function CaixaSurpresaArte({
  tamanho = 64,
  className,
}: {
  /** Largura em pixels. A altura sai da proporção da arte. */
  tamanho?: number;
  className?: string;
}) {
  return (
    <Image
      src={ARTE.src}
      alt=""
      aria-hidden
      width={tamanho}
      height={Math.round((tamanho * ARTE.altura) / ARTE.largura)}
      className={cn("shrink-0 select-none", className)}
    />
  );
}
