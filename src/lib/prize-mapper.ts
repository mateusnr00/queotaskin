import type { Prize } from "@prisma/client";

import type { SkinPrize } from "@/components/cs2/skin-card";

/**
 * Converte o Prize do Prisma para o formato aceito pelos componentes de
 * cliente. O `skinValueBrl` é Decimal e não atravessa a fronteira
 * servidor→cliente do React — vira número aqui.
 */
export function toSkinPrize(prize: Prize): SkinPrize {
  return {
    position: prize.position,
    description: prize.description,
    imageUrl: prize.imageUrl,
    skinName: prize.skinName,
    skinRarity: prize.skinRarity,
    skinWear: prize.skinWear,
    skinFloat: prize.skinFloat,
    skinStatTrak: prize.skinStatTrak,
    skinSouvenir: prize.skinSouvenir,
    skinValueBrl: prize.skinValueBrl == null ? null : Number(prize.skinValueBrl),
    skinCollection: prize.skinCollection,
    skinInspectUrl: prize.skinInspectUrl,
  };
}

/** Prize do banco → rascunho editável da aba "Prêmios" do admin. */
export function toPrizeDraft(prize: Prize) {
  return {
    description: prize.description,
    imageUrl: prize.imageUrl ?? "",
    skinName: prize.skinName ?? "",
    skinRarity: prize.skinRarity,
    skinWear: prize.skinWear,
    skinFloat: prize.skinFloat,
    skinStatTrak: prize.skinStatTrak,
    skinSouvenir: prize.skinSouvenir,
    skinValueBrl: prize.skinValueBrl == null ? null : Number(prize.skinValueBrl),
    skinCollection: prize.skinCollection ?? "",
    skinInspectUrl: prize.skinInspectUrl ?? "",
  };
}
