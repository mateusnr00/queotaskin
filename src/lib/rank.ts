// Sistema de rank do QuéOta Skin.
//
// A progressão copia a escada que o público brasileiro de CS já conhece: os
// níveis 0–21 da Gamers Club e, acima do 21, quatro patentes de prestígio
// tiradas da carreira de um jogador profissional.
//
// XP só entra por compra paga (10 XP por real, ajustável por tenant). XP não
// é gasto nem expira: o nível é permanente. Isso é proposital — um rank que
// pode cair pune quem parou de comprar, e o objetivo é o contrário.

export const XP_PER_BRL_DEFAULT = 10;

/** Último nível numérico. Acima disso começam as patentes de prestígio. */
export const MAX_LEVEL = 21;

/**
 * XP acumulado necessário para ALCANÇAR o nível L.
 *
 * Curva quadrática: `XP_STEP * L * (L + 1) / 2`. Cada nível custa um pouco
 * mais que o anterior, então o começo é rápido (nível 1 com R$ 10) e o topo
 * é um objetivo de longo prazo (nível 21 com R$ 2.310 acumulados).
 */
const XP_STEP = 100;

export function xpForLevel(level: number): number {
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
  return (XP_STEP * L * (L + 1)) / 2;
}

/** Nível (0–21) correspondente a um total de XP. */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 0;
  // Inverso de xpForLevel: resolve XP_STEP * L * (L+1) / 2 = xp.
  const L = Math.floor((-1 + Math.sqrt(1 + (8 * xp) / XP_STEP)) / 2);
  return Math.max(0, Math.min(MAX_LEVEL, L));
}

// ---------------------------------------------------------------- prestígio

export type PrestigeKey = "PRO_PLAYER" | "MVP" | "GOAT";

export interface PrestigeRank {
  key: PrestigeKey;
  label: string;
  /** XP acumulado para alcançar a patente. */
  xp: number;
  color: string;
  description: string;
}

/**
 * Patentes acima do nível 21, em ordem crescente de prestígio.
 *
 * A ordem segue a carreira real: primeiro você vira profissional, depois
 * é eleito o melhor da partida e, no fim, entra pra história. Reordenar é só
 * mexer aqui — a UI e os cálculos derivam tudo desta lista.
 */
export const PRESTIGE_RANKS: readonly PrestigeRank[] = [
  {
    key: "PRO_PLAYER",
    label: "Pro Player",
    xp: 40_000,
    color: "#3fc9d6",
    description: "Assinou com uma organização.",
  },
  {
    key: "MVP",
    label: "MVP",
    xp: 80_000,
    color: "#7c6cf0",
    description: "Melhor jogador da partida.",
  },
  {
    key: "GOAT",
    label: "GOAT",
    xp: 300_000,
    color: "#f2d059",
    description: "O maior de todos os tempos.",
  },
] as const;

// ---------------------------------------------------------------- faixas

export interface Tier {
  /** Nome da faixa, no vocabulário das patentes do Counter-Strike. */
  name: string;
  color: string;
  /** Primeiro nível da faixa. */
  from: number;
}

/**
 * Faixas dos níveis 0–21, nomeadas como as patentes do competitivo do CS.
 *
 * A cor é o único elemento cromático de cada componente de rank — por isso é
 * dessaturada de propósito. Uma lista de ranking com sete cores neon vira
 * ruído; puxada para o sóbrio, ela informa sem gritar.
 */
export const TIERS: readonly Tier[] = [
  { from: 0, name: "Prata", color: "#7d8894" },
  { from: 1, name: "Prata Elite", color: "#5b8fc7" },
  { from: 4, name: "Nova de Ouro", color: "#6d7fd6" },
  { from: 8, name: "Mestre Guardião", color: "#9a72d1" },
  { from: 12, name: "Águia Lendária", color: "#c06ab8" },
  { from: 16, name: "Supremo", color: "#d4694f" },
  { from: 20, name: "Global Elite", color: "#d8a53c" },
] as const;

export function tierForLevel(level: number): Tier {
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
  let found = TIERS[0];
  for (const tier of TIERS) {
    if (L >= tier.from) found = tier;
  }
  return found;
}

export function levelColor(level: number): string {
  return tierForLevel(level).color;
}

// ---------------------------------------------------------------- rank

export interface Rank {
  /** Nível numérico 0–21. Fica em 21 depois que o prestígio começa. */
  level: number;
  /** Patente de prestígio alcançada, ou null se ainda está na escada 0–21. */
  prestige: PrestigeRank | null;
  /** Nome exibido: "Nível 14" ou "Campeão de Major". */
  label: string;
  /** Faixa do nível ("Águia Lendária"), ou o nome da patente no prestígio. */
  tierName: string;
  /** Conteúdo do selo: "14" nos níveis, romano ("III") nas patentes. */
  numeral: string;
  color: string;
  xp: number;
}

/** Patente de prestígio mais alta alcançada com esse XP, ou null. */
export function prestigeFromXp(xp: number): PrestigeRank | null {
  let found: PrestigeRank | null = null;
  for (const rank of PRESTIGE_RANKS) {
    if (xp >= rank.xp) found = rank;
  }
  return found;
}

export function rankFromXp(xp: number): Rank {
  const total = Math.max(0, Math.floor(xp));
  const prestige = prestigeFromXp(total);

  if (prestige) {
    return {
      level: MAX_LEVEL,
      prestige,
      label: prestige.label,
      tierName: prestige.label,
      numeral: prestige.label,
      color: prestige.color,
      xp: total,
    };
  }

  const level = levelFromXp(total);
  const tier = tierForLevel(level);
  return {
    level,
    prestige: null,
    label: `Nível ${level}`,
    tierName: tier.name,
    // Dois dígitos deixam a coluna de selos alinhada na lista de ranking.
    numeral: String(level).padStart(2, "0"),
    color: tier.color,
    xp: total,
  };
}

// ---------------------------------------------------------------- progresso

export interface RankProgress {
  rank: Rank;
  /** Nome do próximo degrau, ou null quando já é GOAT. */
  nextLabel: string | null;
  /** XP que falta para o próximo degrau. */
  xpToNext: number;
  /** Reais que faltam, no `xpPerBrl` informado. */
  brlToNext: number;
  /** Progresso dentro do degrau atual, de 0 a 100. */
  percent: number;
  atMax: boolean;
}

/**
 * Progresso até o próximo degrau — seja o próximo nível numérico ou a
 * próxima patente de prestígio.
 */
export function rankProgress(
  xp: number,
  xpPerBrl: number = XP_PER_BRL_DEFAULT,
): RankProgress {
  const total = Math.max(0, Math.floor(xp));
  const rank = rankFromXp(total);

  const { floorXp, ceilXp, nextLabel } = nextStep(total, rank);

  if (nextLabel === null) {
    return {
      rank,
      nextLabel: null,
      xpToNext: 0,
      brlToNext: 0,
      percent: 100,
      atMax: true,
    };
  }

  const span = ceilXp - floorXp;
  const into = Math.max(0, total - floorXp);
  const xpToNext = Math.max(0, ceilXp - total);
  const perBrl = xpPerBrl > 0 ? xpPerBrl : XP_PER_BRL_DEFAULT;

  return {
    rank,
    nextLabel,
    xpToNext,
    brlToNext: Math.ceil(xpToNext / perBrl),
    percent: span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 0,
    atMax: false,
  };
}

/** Limites do degrau atual e o nome do próximo. */
function nextStep(
  xp: number,
  rank: Rank,
): { floorXp: number; ceilXp: number; nextLabel: string | null } {
  // Já em prestígio: o próximo degrau é a patente seguinte da lista.
  if (rank.prestige) {
    const index = PRESTIGE_RANKS.findIndex((r) => r.key === rank.prestige!.key);
    const next = PRESTIGE_RANKS[index + 1];
    if (!next) {
      return { floorXp: rank.prestige.xp, ceilXp: rank.prestige.xp, nextLabel: null };
    }
    return { floorXp: rank.prestige.xp, ceilXp: next.xp, nextLabel: next.label };
  }

  // No nível 21 o próximo degrau é a primeira patente de prestígio.
  if (rank.level >= MAX_LEVEL) {
    const first = PRESTIGE_RANKS[0];
    return { floorXp: xpForLevel(MAX_LEVEL), ceilXp: first.xp, nextLabel: first.label };
  }

  return {
    floorXp: xpForLevel(rank.level),
    ceilXp: xpForLevel(rank.level + 1),
    nextLabel: `Nível ${rank.level + 1}`,
  };
}

// ---------------------------------------------------------------- créditos

/**
 * XP ganho por uma compra. Trunca para o real cheio: R$ 19,90 rende os
 * mesmos 190 XP que R$ 19,00. Mesma regra do SKNRS — evita que centavos
 * virem XP fracionado e mantém a conta legível pro comprador.
 */
export function xpForPurchase(
  amountBrl: number,
  xpPerBrl: number = XP_PER_BRL_DEFAULT,
): number {
  if (!Number.isFinite(amountBrl) || amountBrl <= 0) return 0;
  const perBrl = xpPerBrl > 0 ? xpPerBrl : XP_PER_BRL_DEFAULT;
  return Math.floor(amountBrl) * perBrl;
}

/** True quando o nível do usuário libera uma campanha exclusiva. */
export function meetsMinLevel(xp: number, minLevel: number | null): boolean {
  if (minLevel == null || minLevel <= 0) return true;
  const rank = rankFromXp(xp);
  // Prestígio está acima de qualquer nível numérico exigido.
  if (rank.prestige) return true;
  return rank.level >= minLevel;
}
