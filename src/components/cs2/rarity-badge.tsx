import type { SkinRarity, SkinWear } from "@prisma/client";

import { RARITY_LABEL, WEAR_SHORT, rarityColor } from "@/lib/cs2";
import { cn } from "@/lib/utils";

/**
 * Selo de raridade pintado com a cor oficial da Valve. A cor entra por
 * `style` porque é dado do banco, não dá pra mapear em classe do Tailwind
 * sem gerar as 8 variantes na mão.
 */
export function RarityBadge({
  rarity,
  className,
}: {
  rarity: SkinRarity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
        className,
      )}
      style={{
        color: rarityColor(rarity),
        borderColor: rarityColor(rarity, 0.45),
        backgroundColor: rarityColor(rarity, 0.12),
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: rarityColor(rarity) }}
      />
      {RARITY_LABEL[rarity]}
    </span>
  );
}

/** Sigla do desgaste (FN, MW, FT…), compacta o suficiente para o card. */
export function WearBadge({ wear, className }: { wear: SkinWear; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground",
        className,
      )}
      title={wear}
    >
      {WEAR_SHORT[wear]}
    </span>
  );
}

export function StatTrakBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-xs font-bold text-orange-500",
        className,
      )}
    >
      StatTrak™
    </span>
  );
}

export function SouvenirBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-xs font-bold text-yellow-600 dark:text-yellow-400",
        className,
      )}
    >
      Souvenir
    </span>
  );
}
