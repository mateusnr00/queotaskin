import Image from "next/image";

import { cn } from "@/lib/utils";

// A arte da caixa surpresa.
//
// Substitui o ícone de presente do lucide onde a caixa é o objeto em si: a
// caixa fechada que a pessoa vai abrir no comprovante, e a vitrine dos
// degraus na campanha. O ícone genérico continua nos marcadores pequenos,
// dentro de título e de contador, porque esta arte é um render 3D com laço,
// fecho e desgaste na tinta: abaixo de uns 40px vira borrão colorido e fica
// pior que o traço simples do ícone.
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
