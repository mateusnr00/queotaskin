// Domínio Counter-Strike 2: rótulos, cores e helpers de skin.
//
// As cores de raridade são as oficiais da Valve (mesmas do inventário do
// jogo). Elas aparecem na borda/glow dos cards de prêmio, então o usuário
// reconhece de longe se a campanha é de uma Covert vermelha ou de uma faca
// dourada — a leitura é a mesma que ele já tem dentro do jogo.

import type { SkinRarity, SkinWear } from "@prisma/client";

export const RARITY_LABEL: Record<SkinRarity, string> = {
  CONSUMER: "Consumidor",
  INDUSTRIAL: "Industrial",
  MIL_SPEC: "Mil-Spec",
  RESTRICTED: "Restrita",
  CLASSIFIED: "Secreta",
  COVERT: "Oculta",
  CONTRABAND: "Contrabando",
  EXTRAORDINARY: "Extraordinária",
};

/** Cores oficiais das raridades do CS2, em hex. */
export const RARITY_COLOR: Record<SkinRarity, string> = {
  CONSUMER: "#b0c3d9",
  INDUSTRIAL: "#5e98d9",
  MIL_SPEC: "#4b69ff",
  RESTRICTED: "#8847ff",
  CLASSIFIED: "#d32ce6",
  COVERT: "#eb4b4b",
  CONTRABAND: "#e4ae39",
  EXTRAORDINARY: "#ffd700",
};

/** Ordem crescente de valor — usada para achar o prêmio "principal". */
export const RARITY_ORDER: Record<SkinRarity, number> = {
  CONSUMER: 0,
  INDUSTRIAL: 1,
  MIL_SPEC: 2,
  RESTRICTED: 3,
  CLASSIFIED: 4,
  COVERT: 5,
  CONTRABAND: 6,
  EXTRAORDINARY: 7,
};

export const WEAR_LABEL: Record<SkinWear, string> = {
  FACTORY_NEW: "Nova de Fábrica",
  MINIMAL_WEAR: "Pouco Usada",
  FIELD_TESTED: "Testada em Campo",
  WELL_WORN: "Bem Desgastada",
  BATTLE_SCARRED: "Veterana de Guerra",
};

/** Sigla usada pela comunidade (FN, MW, FT, WW, BS). */
export const WEAR_SHORT: Record<SkinWear, string> = {
  FACTORY_NEW: "FN",
  MINIMAL_WEAR: "MW",
  FIELD_TESTED: "FT",
  WELL_WORN: "WW",
  BATTLE_SCARRED: "BS",
};

/** Faixas de float de cada desgaste, conforme a Valve. */
export const WEAR_RANGE: Record<SkinWear, [number, number]> = {
  FACTORY_NEW: [0, 0.07],
  MINIMAL_WEAR: [0.07, 0.15],
  FIELD_TESTED: [0.15, 0.38],
  WELL_WORN: [0.38, 0.45],
  BATTLE_SCARRED: [0.45, 1],
};

/** Desgaste correspondente a um float — usado para validar o cadastro. */
export function wearFromFloat(value: number): SkinWear | null {
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  const found = (Object.entries(WEAR_RANGE) as [SkinWear, [number, number]][]).find(
    ([, [min, max]]) => value >= min && value < max,
  );
  // 1.0 exato cai fora de todo intervalo semiaberto: é Battle-Scarred.
  return found?.[0] ?? "BATTLE_SCARRED";
}

/** Float formatado como a comunidade escreve (0.0123456789). */
export function formatFloat(value: number): string {
  return value.toFixed(10).replace(/0+$/, "").replace(/\.$/, ".0");
}

export type SkinLike = {
  skinName?: string | null;
  skinRarity?: SkinRarity | null;
  skinWear?: SkinWear | null;
  skinFloat?: number | null;
  skinStatTrak?: boolean;
  skinSouvenir?: boolean;
  skinCollection?: string | null;
};

/** True quando o prêmio tem dados de skin suficientes para exibir a ficha. */
export function hasSkinData(prize: SkinLike): boolean {
  return Boolean(
    prize.skinName ||
      prize.skinRarity ||
      prize.skinWear ||
      prize.skinFloat != null ||
      prize.skinStatTrak ||
      prize.skinSouvenir,
  );
}

/**
 * Nome completo como aparece no inventário:
 * "StatTrak™ AK-47 | Redline (Field-Tested)".
 */
export function fullSkinName(prize: SkinLike & { description?: string }): string {
  const base = prize.skinName?.trim() || prize.description?.trim() || "";
  const prefix = prize.skinStatTrak ? "StatTrak™ " : prize.skinSouvenir ? "Souvenir " : "";
  const alreadyPrefixed = /^(StatTrak™|Souvenir)/i.test(base);
  const wear = prize.skinWear ? ` (${WEAR_LABEL[prize.skinWear]})` : "";
  const alreadyHasWear = /\(.+\)\s*$/.test(base);

  return `${alreadyPrefixed ? "" : prefix}${base}${alreadyHasWear ? "" : wear}`;
}

/** Prêmio de maior raridade da lista — é ele que define a cor do card. */
export function headlineSkin<T extends SkinLike>(prizes: T[]): T | null {
  const withRarity = prizes.filter((p) => p.skinRarity);
  if (withRarity.length === 0) return prizes[0] ?? null;
  return withRarity.reduce((best, current) =>
    RARITY_ORDER[current.skinRarity!] > RARITY_ORDER[best.skinRarity!] ? current : best,
  );
}

/** Cor da raridade com alfa, para bordas e brilhos suaves. */
export function rarityColor(rarity: SkinRarity | null | undefined, alpha = 1): string {
  if (!rarity) return alpha === 1 ? "#64748b" : `rgba(100, 116, 139, ${alpha})`;
  const hex = RARITY_COLOR[rarity];
  if (alpha === 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------- Steam

const TRADE_URL_PATTERN =
  /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[A-Za-z0-9_-]+$/;

/**
 * Valida o link de troca da Steam. Só aceita o formato exato que a Steam
 * gera — um link truncado ou de outro domínio faz a entrega falhar
 * silenciosamente depois do sorteio, que é o pior momento pra descobrir.
 */
export function isValidTradeUrl(url: string): boolean {
  return TRADE_URL_PATTERN.test(url.trim());
}

/** SteamID64 do parceiro, derivado do `partner` do link de troca. */
export function steamIdFromTradeUrl(url: string): string | null {
  const match = url.match(/[?&]partner=(\d+)/);
  if (!match) return null;
  // A Steam usa o accountId (32 bits) no link; o SteamID64 soma a base fixa.
  return (BigInt(match[1]) + BigInt("76561197960265728")).toString();
}

export const STEAM_DELIVERY_NOTICE =
  "A skin é enviada por oferta de troca na Steam. Mantenha o Steam Guard Mobile " +
  "ativo há pelo menos 7 dias — sem isso a Valve retém a troca por até 15 dias.";
