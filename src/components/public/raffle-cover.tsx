import Image from "next/image";

import { podeOtimizar } from "@/lib/image-src";

import { RARITY_LABEL, rarityColor } from "@/lib/cs2";
import { cn } from "@/lib/utils";
import type { SkinRarity } from "@prisma/client";

/**
 * Capa da campanha.
 *
 * Quando não há imagem cadastrada, em vez do ícone genérico, que deixava
 * todos os cards idênticos e mortos, desenha uma vitrine a partir dos dados
 * da própria skin: o brilho na cor da raridade, o nome tipografado e o selo.
 * Cada campanha fica visualmente distinta mesmo antes de alguém subir a arte.
 */
/**
 * Abreviação da arma para a miniatura: "★ AK-47 | Redline" -> "AK-47".
 * Na miniatura o título já está do lado, então repetir o nome inteiro só
 * gera quebra de linha em três, o que interessa ali é identificar de relance.
 */
function siglaDaArma(nome: string): string {
  const semEstrela = nome.replace(/^[^A-Za-z0-9]+/, "");
  const arma = semEstrela.split("|")[0].trim();
  return arma.length > 12 ? arma.split(/\s+/)[0] : arma;
}

export function RaffleCover({
  url,
  title,
  skinName,
  rarity,
  variant = "hero",
  ajuste = "cobrir",
  className,
  sizes = "(min-width: 768px) 640px, 100vw",
  priority = false,
}: {
  url: string | null;
  title: string;
  skinName?: string | null;
  rarity?: SkinRarity | null;
  /** "hero" mostra o nome completo; "thumb" só a sigla e o brilho. */
  variant?: "hero" | "thumb";
  /**
   * "cobrir" preenche a moldura cortando o que sobra, bom para card em
   * grade, onde uniformidade vale mais que ver a arte inteira. "conter"
   * mostra a arte toda, que é o certo na página do sorteio: ali a imagem é
   * o produto, e cortar o topo come a logo e o nome da skin.
   */
  ajuste?: "cobrir" | "conter";
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (url) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <Image
          src={url}
          alt={title}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={!podeOtimizar(url)}
          quality={92}
          className={ajuste === "conter" ? "object-contain" : "object-cover"}
        />
      </div>
    );
  }

  const accent = rarityColor(rarity ?? null);
  const nome = (skinName ?? title).replace(/^\W+/, "");
  const thumb = variant === "thumb";

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        background: `radial-gradient(120% 90% at 50% 115%, ${accent}38, transparent 62%), linear-gradient(180deg, #0e1015, #15181e)`,
      }}
    >
      {/* Hachura diagonal fina, textura de painel, quase imperceptível. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 9px)",
        }}
      />

      {thumb ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-lg leading-none font-extrabold tracking-tight sm:text-xl"
            style={{ color: `${accent}`, textShadow: "0 2px 10px rgba(0,0,0,.5)" }}
          >
            {siglaDaArma(nome)}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p
            className="text-2xl leading-tight font-extrabold tracking-tight text-balance text-white/90 sm:text-3xl"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,.6)" }}
          >
            {nome}
          </p>

          {rarity && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[0.1em] uppercase"
              style={{
                color: accent,
                borderColor: `${accent}66`,
                backgroundColor: `${accent}14`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: accent }}
              />
              {RARITY_LABEL[rarity]}
            </span>
          )}
        </div>
      )}

      {/* Fio na cor da raridade fechando a base. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />
    </div>
  );
}
