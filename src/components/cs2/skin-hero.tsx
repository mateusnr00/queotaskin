import {
  RarityBadge,
  SouvenirBadge,
  StatTrakBadge,
  WearBadge,
} from "@/components/cs2/rarity-badge";
import { type SkinPrize } from "@/components/cs2/skin-card";
import { formatFloat, fullSkinName, hasSkinData, rarityColor } from "@/lib/cs2";
import { formatBRL } from "@/lib/format";

/**
 * Ficha da skin principal, exibida na página da campanha quando o admin liga
 * `showSkinSpecs`.
 *
 * Compacta de propósito: a versão anterior era uma tabela de seis células que
 * empurrava o botão de compra para baixo da dobra no celular, de onde vem a
 * maior parte do tráfego. Aqui os dados viram uma linha de chips que quebra
 * naturalmente, e só aparecem os campos preenchidos.
 */
export function SkinHero({
  prize,
  extraPrizes = 0,
}: {
  prize: SkinPrize;
  extraPrizes?: number;
}) {
  if (!hasSkinData(prize)) return null;

  const accent = rarityColor(prize.skinRarity);

  const chips: { rotulo: string; valor: string }[] = [];
  if (prize.skinFloat != null) {
    chips.push({ rotulo: "Float", valor: formatFloat(prize.skinFloat) });
  }
  if (prize.skinCollection) {
    chips.push({ rotulo: "Coleção", valor: prize.skinCollection });
  }

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      style={prize.skinRarity ? { borderColor: `${accent}40` } : undefined}
    >
      <div
        className="space-y-2 px-4 py-3"
        style={
          prize.skinRarity
            ? { background: `linear-gradient(90deg, ${accent}14, transparent)` }
            : undefined
        }
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Você está concorrendo a
          </p>
          {prize.skinValueBrl != null && prize.skinValueBrl > 0 && (
            <p className="text-xs text-muted-foreground">
              Avaliada em{" "}
              <b className="font-bold text-foreground">
                {formatBRL(prize.skinValueBrl)}
              </b>
            </p>
          )}
        </div>

        <h2 className="text-base leading-tight font-bold text-balance">
          {fullSkinName(prize)}
        </h2>

        <div className="flex flex-wrap items-center gap-1.5">
          {prize.skinRarity && <RarityBadge rarity={prize.skinRarity} />}
          {prize.skinWear && <WearBadge wear={prize.skinWear} />}
          {prize.skinStatTrak && <StatTrakBadge />}
          {prize.skinSouvenir && <SouvenirBadge />}

          {chips.map((chip) => (
            <span
              key={chip.rotulo}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {chip.rotulo}
              <span className="font-mono font-semibold text-foreground">
                {chip.valor}
              </span>
            </span>
          ))}

          {extraPrizes > 0 && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              +{extraPrizes} prêmio{extraPrizes > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
