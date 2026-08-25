import {
  RarityBadge,
  SouvenirBadge,
  StatTrakBadge,
  WearBadge,
} from "@/components/cs2/rarity-badge";
import { SkinSpecs, type SkinPrize } from "@/components/cs2/skin-card";
import { fullSkinName, hasSkinData, rarityColor } from "@/lib/cs2";
import { formatBRL } from "@/lib/format";

/**
 * Ficha da skin principal, exibida direto na página da campanha (sem
 * precisar abrir o modal de prêmios). É o bloco que diferencia o QuéOta
 * Skin de uma rifa genérica: o comprador vê raridade, float e valor de
 * mercado antes de decidir.
 */
export function SkinHero({
  prize,
  extraPrizes = 0,
}: {
  prize: SkinPrize;
  extraPrizes?: number;
}) {
  if (!hasSkinData(prize)) return null;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      style={
        prize.skinRarity
          ? { borderColor: rarityColor(prize.skinRarity, 0.45) }
          : undefined
      }
    >
      <div
        className="px-4 py-3"
        style={
          prize.skinRarity
            ? {
                background: `linear-gradient(90deg, ${rarityColor(
                  prize.skinRarity,
                  0.16,
                )}, transparent)`,
              }
            : undefined
        }
      >
        <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Você está concorrendo a
        </p>
        <h2 className="mt-0.5 text-lg leading-tight font-bold">
          {fullSkinName(prize)}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {prize.skinRarity && <RarityBadge rarity={prize.skinRarity} />}
          {prize.skinWear && <WearBadge wear={prize.skinWear} />}
          {prize.skinStatTrak && <StatTrakBadge />}
          {prize.skinSouvenir && <SouvenirBadge />}
          {extraPrizes > 0 && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              +{extraPrizes} prêmio{extraPrizes > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {prize.skinValueBrl != null && prize.skinValueBrl > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Avaliada em{" "}
            <span className="font-bold text-foreground">
              {formatBRL(prize.skinValueBrl)}
            </span>
          </p>
        )}
      </div>

      <div className="border-t p-3">
        <SkinSpecs prize={prize} />
      </div>
    </section>
  );
}
