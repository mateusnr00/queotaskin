import Image from "next/image";

import { podeOtimizar } from "@/lib/image-src";
import { ExternalLink } from "lucide-react";

import {
  RarityBadge,
  SouvenirBadge,
  StatTrakBadge,
  WearBadge,
} from "@/components/cs2/rarity-badge";
import { formatBRL } from "@/lib/format";
import {
  WEAR_LABEL,
  fullSkinName,
  formatFloat,
  hasSkinData,
  rarityColor,
} from "@/lib/cs2";
import { cn } from "@/lib/utils";
import type { SkinRarity, SkinWear } from "@prisma/client";

export interface SkinPrize {
  position: number;
  description: string;
  imageUrl: string | null;
  skinName: string | null;
  skinRarity: SkinRarity | null;
  skinWear: SkinWear | null;
  skinFloat: number | null;
  skinStatTrak: boolean;
  skinSouvenir: boolean;
  skinValueBrl: number | null;
  skinCollection: string | null;
  skinInspectUrl: string | null;
}

/**
 * Card de um prêmio. Quando o prêmio tem metadados de skin, ganha a moldura
 * na cor da raridade e a ficha técnica; senão cai num card neutro, que é o
 * caso de prêmios que não são skin (saldo, periférico, kit físico).
 */
export function SkinCard({
  prize,
  showPosition = true,
  className,
}: {
  prize: SkinPrize;
  showPosition?: boolean;
  className?: string;
}) {
  const isSkin = hasSkinData(prize);
  const accent = rarityColor(prize.skinRarity);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card transition-colors",
        className,
      )}
      style={
        isSkin && prize.skinRarity
          ? {
              borderColor: rarityColor(prize.skinRarity, 0.4),
              boxShadow: `inset 0 -2px 0 0 ${rarityColor(prize.skinRarity, 0.85)}`,
            }
          : undefined
      }
    >
      <div className="flex gap-3 p-3">
        <div
          className="relative h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-muted"
          style={
            isSkin && prize.skinRarity
              ? {
                  backgroundImage: `radial-gradient(circle at 50% 120%, ${rarityColor(
                    prize.skinRarity,
                    0.35,
                  )}, transparent 70%)`,
                }
              : undefined
          }
        >
          {prize.imageUrl ? (
            <Image
              src={prize.imageUrl}
              alt={fullSkinName(prize)}
              fill
              sizes="96px"
              unoptimized={!podeOtimizar(prize.imageUrl)}
              className="object-contain"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl">
              🎁
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            {showPosition && (
              <span
                className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[0.65rem] font-extrabold tabular-nums"
                style={{
                  color: accent,
                  backgroundColor: rarityColor(prize.skinRarity, 0.15),
                }}
              >
                {prize.position}º
              </span>
            )}
            <h3 className="text-sm leading-snug font-semibold">
              {fullSkinName(prize)}
            </h3>
          </div>

          {isSkin && (
            <div className="flex flex-wrap items-center gap-1.5">
              {prize.skinRarity && <RarityBadge rarity={prize.skinRarity} />}
              {prize.skinWear && <WearBadge wear={prize.skinWear} />}
              {prize.skinStatTrak && <StatTrakBadge />}
              {prize.skinSouvenir && <SouvenirBadge />}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {prize.skinFloat != null && (
              <span>
                Float{" "}
                <span className="font-mono text-foreground">
                  {formatFloat(prize.skinFloat)}
                </span>
              </span>
            )}
            {prize.skinValueBrl != null && prize.skinValueBrl > 0 && (
              <span>
                Avaliada em{" "}
                <span className="font-semibold text-foreground">
                  {formatBRL(prize.skinValueBrl)}
                </span>
              </span>
            )}
            {prize.skinCollection && <span>{prize.skinCollection}</span>}
          </div>

          {prize.skinInspectUrl && (
            <a
              href={prize.skinInspectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Inspecionar no jogo
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/** Ficha técnica completa, para a página de detalhe da campanha. */
export function SkinSpecs({ prize }: { prize: SkinPrize }) {
  if (!hasSkinData(prize)) return null;

  const specs: { label: string; value: React.ReactNode }[] = [];

  if (prize.skinName) specs.push({ label: "Skin", value: prize.skinName });
  if (prize.skinWear) {
    specs.push({ label: "Desgaste", value: WEAR_LABEL[prize.skinWear] });
  }
  if (prize.skinRarity) {
    specs.push({
      label: "Raridade",
      value: <RarityBadge rarity={prize.skinRarity} />,
    });
  }
  if (prize.skinFloat != null) {
    specs.push({
      label: "Float",
      value: <span className="font-mono">{formatFloat(prize.skinFloat)}</span>,
    });
  }
  if (prize.skinStatTrak) specs.push({ label: "StatTrak™", value: "Sim" });
  if (prize.skinSouvenir) specs.push({ label: "Souvenir", value: "Sim" });
  if (prize.skinCollection) {
    specs.push({ label: "Coleção", value: prize.skinCollection });
  }
  if (prize.skinValueBrl != null && prize.skinValueBrl > 0) {
    specs.push({ label: "Valor de mercado", value: formatBRL(prize.skinValueBrl) });
  }

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
      {specs.map((spec) => (
        <div key={spec.label} className="bg-card px-3 py-2">
          <dt className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
            {spec.label}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}
