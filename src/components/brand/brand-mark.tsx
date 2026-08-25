// A marca do site, desenhada de um jeito só.
//
// Recebe os dados prontos em vez de consultar o banco: assim serve tanto às
// telas de servidor quanto ao shell do painel, que é componente de cliente.
// Quem monta a tela chama getBrand() (src/lib/brand.ts).
//
// A regra de recorte é a mesma do cabeçalho: faixa aparece inteira e dispensa
// o texto (a imagem já traz o nome escrito); emblema é recortado em círculo e
// leva o nome ao lado.

import { TicketCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Marca } from "@/lib/brand";

export function BrandMark({
  marca,
  className,
  alturaDaFaixa = "h-8",
  ladoDoEmblema = "h-8 w-8",
  larguraMaxima = "max-w-[170px] sm:max-w-[220px]",
  classeDoNome = "text-sm sm:text-base",
  fallbackClassName,
}: {
  marca: Marca;
  className?: string;
  /** Altura da logo em faixa; a largura acompanha a proporção. */
  alturaDaFaixa?: string;
  ladoDoEmblema?: string;
  larguraMaxima?: string;
  classeDoNome?: string;
  /** Cores do quadrado que aparece quando não há logo cadastrada. */
  fallbackClassName?: string;
}) {
  const emFaixa = marca.logoShape === "RECTANGLE";

  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      {marca.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={marca.logoUrl}
          alt={marca.name}
          className={cn(
            emFaixa
              ? cn(alturaDaFaixa, "w-auto object-contain", larguraMaxima)
              : cn(ladoDoEmblema, "rounded-full object-cover")
          )}
        />
      ) : (
        <span
          className={cn(
            "flex items-center justify-center rounded-lg",
            ladoDoEmblema,
            fallbackClassName ?? "bg-foreground text-background"
          )}
        >
          <TicketCheck className="h-4 w-4" />
        </span>
      )}

      {/* Faixa já traz o nome desenhado; repetir ao lado duplica a leitura. */}
      {!(marca.logoUrl && emFaixa) && (
        <span className={classeDoNome}>{marca.name}</span>
      )}
    </span>
  );
}
