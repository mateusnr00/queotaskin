// Sistema de rank do QuéOta Skin.
//
// A progressão copia a escada que o público brasileiro de CS já conhece: os
// níveis 0–21 da Gamers Club e, acima do 21, três patentes de prestígio
// tiradas da carreira de um jogador profissional.
//
// XP só entra por compra paga (10 XP por real, ajustável por tenant). XP não
// é gasto nem expira: o nível é permanente. Isso é proposital, um rank que
// pode cair pune quem parou de comprar, e o objetivo é o contrário.

import { DEFAULT_XP_PER_BRL, GOAT_MIN_TOTAL_SPENT, xpPorReal } from "@/lib/xp/config";

/**
 * Reexportado com o nome antigo por conveniência de quem já importava daqui.
 * O valor mora em `xp/config.ts`, junto do resto da economia de XP: duas
 * constantes de 10 em arquivos diferentes foi exatamente o que criou a
 * divergência entre o que a barra prometia e o que o crédito pagava.
 */
export const XP_PER_BRL_DEFAULT = DEFAULT_XP_PER_BRL;

/** Último nível numérico. Acima disso começam as patentes de prestígio. */
export const MAX_LEVEL = 21;

/**
 * XP acumulado para ALCANÇAR cada nível. O índice é o próprio nível.
 *
 * Tabela, não fórmula. Uma curva fechada obriga a escada a caber na equação;
 * aqui os degraus foram escolhidos um a um, e o começo é de propósito bem
 * mais barato que o topo, nível 1 sai por R$ 100 e o 21 pede R$ 30 mil
 * acumulados.
 *
 * Os valores estão em XP. A tabela foi definida em reais na régua padrão de
 * XP_PER_BRL_DEFAULT (10 XP por real): a coluna em reais ao lado só vale
 * enquanto o tenant não mudar essa régua em Admin → Ranking.
 */
export const XP_POR_NIVEL: readonly number[] = [
  0, //          nível 0 , R$ 0
  1_000, //      nível 1 , R$ 100
  2_500, //      nível 2 , R$ 250
  5_000, //      nível 3 , R$ 500
  8_000, //      nível 4 , R$ 800
  12_000, //     nível 5 , R$ 1.200
  17_000, //     nível 6 , R$ 1.700
  23_000, //     nível 7 , R$ 2.300
  30_000, //     nível 8 , R$ 3.000
  38_000, //     nível 9 , R$ 3.800
  47_000, //     nível 10, R$ 4.700
  57_000, //     nível 11, R$ 5.700
  70_000, //     nível 12, R$ 7.000
  85_000, //     nível 13, R$ 8.500
  100_000, //    nível 14, R$ 10.000
  120_000, //    nível 15, R$ 12.000
  145_000, //    nível 16, R$ 14.500
  170_000, //    nível 17, R$ 17.000
  200_000, //    nível 18, R$ 20.000
  230_000, //    nível 19, R$ 23.000
  260_000, //    nível 20, R$ 26.000
  300_000, //    nível 21, R$ 30.000
];

export function xpForLevel(level: number): number {
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
  return XP_POR_NIVEL[L]!;
}

/** Nível (0–21) correspondente a um total de XP. */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 0;
  // Varre de cima para baixo: o nível é o maior degrau já pago por inteiro.
  for (let L = MAX_LEVEL; L >= 0; L--) {
    if (xp >= XP_POR_NIVEL[L]!) return L;
  }
  return 0;
}

// ---------------------------------------------------------------- prestígio

export type PrestigeKey = "PRO_PLAYER" | "MVP" | "GOAT";

export interface PrestigeRank {
  key: PrestigeKey;
  label: string;
  /** XP acumulado para alcançar a patente. */
  xp: number;
  color: string;
}

/**
 * Patentes acima do nível 21, em ordem crescente de prestígio.
 *
 * A lista precisa ficar em ordem crescente de XP: prestigeFromXp percorre de
 * ponta a ponta e guarda a última alcançada. Reordenar é só mexer aqui, a UI
 * e os cálculos derivam tudo desta lista.
 *
 * Sem descrição. Cada uma tinha uma frase embaixo ("melhor jogador da
 * partida", "assinou com uma organização", "o maior de todos os tempos"), e
 * elas explicavam a metáfora, não o degrau: não diziam nada sobre o que a
 * pessoa ganha nem sobre como chegar lá. O nome e o XP dizem.
 */
export const PRESTIGE_RANKS: readonly PrestigeRank[] = [
  {
    key: "MVP",
    label: "MVP",
    xp: 350_000, // R$ 35.000
    color: "#7c6cf0",
  },
  {
    key: "PRO_PLAYER",
    // "PRO", e não "Pro Player": é como a cena chama, e o selo tem espaço para
    // três letras, não para duas palavras.
    label: "PRO",
    xp: 425_000, // R$ 42.500
    color: "#3fc9d6",
  },
  {
    key: "GOAT",
    label: "GOAT",
    xp: 500_000, // R$ 50.000
    color: "#f2d059",
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
 * O nome de cada nível, do 0 ao 21.
 *
 * Fonte única: nenhum componente escreve nome de patente à mão. Trocar aqui
 * troca no site inteiro, e é por isso que a lista vive no mesmo arquivo das
 * regras em vez de virar string espalhada.
 *
 * O vocabulário é o do competitivo brasileiro de CS, e não a tradução oficial
 * da Valve. Quem joga fala "AK Cruzada" e "Xerife", não "Mestre Guardião"
 * nem "Nova de Ouro": a lista abaixo é a que o jogador reconhece sem ler
 * duas vezes.
 */
export const NOMES_DE_NIVEL: readonly string[] = [
  "Recruta", // 0
  "Prata I",
  "Prata II",
  "Prata III",
  "Prata IV",
  "Prata Elite", // 5
  "Ouro I",
  "Ouro II",
  "Ouro III",
  "Ouro Mestre", // 9
  "AK I",
  "AK II",
  "AK Elite",
  "AK Cruzada", // 13
  "Xerife", // 14
  "Águia",
  "Águia Mestre", // 16
  "Supremo", // 17
  "Global",
  "Global Elite",
  "Lendário",
  "Lenda Global", // 21
] as const;

/** O nome do nível, protegido contra valor fora da escada. */
export function nomeDoNivel(level: number): string {
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
  return NOMES_DE_NIVEL[L];
}

/**
 * As cores dos níveis, por faixa.
 *
 * Separado dos grupos DE PROPÓSITO. Os grupos mudaram de recorte quando as
 * patentes foram renomeadas, mas a paleta é a mesma de antes e cada nível
 * continua exatamente com a cor que sempre teve. Fundir as duas coisas de
 * novo faria a renomeação repintar a escada inteira de tabela.
 */
const FAIXAS_DE_COR: readonly { from: number; color: string }[] = [
  { from: 0, color: "#7d8894" },
  { from: 1, color: "#5b8fc7" },
  { from: 4, color: "#6d7fd6" },
  { from: 8, color: "#9a72d1" },
  { from: 12, color: "#c06ab8" },
  { from: 16, color: "#d4694f" },
  { from: 20, color: "#d8a53c" },
] as const;

/**
 * Os grupos da escada, como aparecem na tela de patentes.
 *
 * Recruta, Prata, Ouro, AK, Xerife, Águia, Supremo e Global: é a progressão
 * que um jogador de CS lê de cima a baixo sem precisar de legenda.
 */
export const TIERS: readonly Tier[] = [
  { from: 0, name: "Recruta", color: "#7d8894" },
  { from: 1, name: "Prata", color: "#5b8fc7" },
  { from: 6, name: "Ouro", color: "#6d7fd6" },
  { from: 10, name: "AK", color: "#9a72d1" },
  { from: 14, name: "Xerife", color: "#c06ab8" },
  { from: 15, name: "Águia", color: "#c06ab8" },
  { from: 17, name: "Supremo", color: "#d4694f" },
  { from: 18, name: "Global", color: "#d8a53c" },
] as const;

export function tierForLevel(level: number): Tier {
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
  let found = TIERS[0];
  for (const tier of TIERS) {
    if (L >= tier.from) found = tier;
  }
  return found;
}

/**
 * A cor do nível. Vem de FAIXAS_DE_COR, e não do grupo: assim os grupos podem
 * ser recortados por nome sem repintar a escada.
 */
export function levelColor(level: number): string {
  const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
  let cor = FAIXAS_DE_COR[0].color;
  for (const faixa of FAIXAS_DE_COR) {
    if (L >= faixa.from) cor = faixa.color;
  }
  return cor;
}

// ---------------------------------------------------------------- rank

export interface Rank {
  /** Nível numérico 0–21. Fica em 21 depois que o prestígio começa. */
  level: number;
  /** Patente de prestígio alcançada, ou null se ainda está na escada 0–21. */
  prestige: PrestigeRank | null;
  /** Nome exibido: "Xerife" ou "Campeão de Major". */
  label: string;
  /** Grupo do nível ("AK"), ou o nome da patente no prestígio. */
  tierName: string;
  /** Conteúdo do selo: "14" nos níveis, romano ("III") nas patentes. */
  numeral: string;
  color: string;
  xp: number;
}

/**
 * Patente de prestígio mais alta alcançada, ou null.
 *
 * O GOAT é a única exceção da escada: exige XP E gasto acumulado. Sem isso,
 * um multiplicador alto levaria alguém ao topo do prestígio da plataforma sem
 * ter sustentado nada, e o degrau que deveria ser o mais difícil viraria o
 * mais fácil de forçar.
 *
 * `totalSpent` é opcional para não quebrar quem chama só com XP; quando não
 * vem, o GOAT simplesmente não é concedido, que é o lado seguro do erro.
 */
export function prestigeFromXp(
  xp: number,
  totalSpent = 0,
): PrestigeRank | null {
  let found: PrestigeRank | null = null;
  for (const rank of PRESTIGE_RANKS) {
    if (xp < rank.xp) continue;
    if (rank.key === "GOAT" && totalSpent < GOAT_MIN_TOTAL_SPENT) continue;
    found = rank;
  }
  return found;
}

/**
 * O rank de UMA patente de prestígio, sem passar pela escada de XP.
 *
 * Existe por causa de um selo errado: a lista de patentes desenhava cada linha
 * com rankFromXp(prestigio.xp), e rankFromXp aplica a regra de gasto do GOAT.
 * Com o gasto padrão em zero, os 500 mil XP da linha do GOAT caíam para a
 * patente de baixo, e a lista mostrava o selo do PRO ao lado do nome GOAT.
 *
 * A lista é uma LEGENDA do que existe, não uma avaliação de quem olha: cada
 * linha tem que desenhar o seu próprio selo, e a regra de quem chegou lá é
 * outra pergunta, respondida por prestigeFromXp.
 */
export function rankDoPrestigio(prestige: PrestigeRank): Rank {
  return {
    level: MAX_LEVEL,
    prestige,
    label: prestige.label,
    tierName: prestige.label,
    numeral: prestige.label,
    color: prestige.color,
    xp: prestige.xp,
  };
}

export function rankFromXp(xp: number, totalSpent = 0): Rank {
  const total = Math.max(0, Math.floor(xp));
  const prestige = prestigeFromXp(total, totalSpent);

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
    label: nomeDoNivel(level),
    tierName: tier.name,
    // Um dígito só, como nos desenhos: o selo é o mesmo do "0" ao "9", e o
    // zero à esquerda encolhia a fonte de 82 para 74 sem ganhar nada.
    numeral: String(level),
    // A cor vem do nível, e não do grupo: os grupos foram recortados de novo
    // na renomeação, e a paleta por nível continua a mesma de sempre.
    color: levelColor(level),
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
 * Progresso até o próximo degrau, seja o próximo nível numérico ou a
 * próxima patente de prestígio.
 */
/**
 * A régua é OBRIGATÓRIA aqui, e isso é a correção.
 *
 * Ela já foi opcional com padrão 10, e foi assim que `rank-card` passou a
 * calcular `brlToNext` na régua errada sem ninguém perceber: esquecer um
 * argumento opcional não dá erro nenhum. Sem valor padrão, todo lugar que
 * converte XP em reais precisa DIZER em que régua está, e onde não houver
 * painel o `DEFAULT_XP_PER_BRL` aparece escrito, não escondido.
 */
export function rankProgress(xp: number, xpPerBrl: number): RankProgress {
  const total = Math.max(0, Math.floor(xp));
  // A BARRA MEDE SÓ A ESCADA DE XP.
  //
  // Por isso o rank aqui é calculado sem o gasto: quem tem 500 mil XP está no
  // topo da escada de XP, e a barra tem de dizer isso. A exigência financeira
  // do GOAT vive no selo, que sai de rankFromXp com o gasto. Misturar as duas
  // faria a barra parar em 99% sem poder explicar por quê, já que o requisito
  // em reais não pode aparecer na tela.
  const rank = rankFromXp(total, GOAT_MIN_TOTAL_SPENT);

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
  const perBrl = xpPorReal(xpPerBrl);

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
      return {
        floorXp: rank.prestige.xp,
        ceilXp: rank.prestige.xp,
        nextLabel: null,
      };
    }
    return {
      floorXp: rank.prestige.xp,
      ceilXp: next.xp,
      nextLabel: next.label,
    };
  }

  // No nível 21 o próximo degrau é a primeira patente de prestígio.
  if (rank.level >= MAX_LEVEL) {
    const first = PRESTIGE_RANKS[0];
    return {
      floorXp: xpForLevel(MAX_LEVEL),
      ceilXp: first.xp,
      nextLabel: first.label,
    };
  }

  return {
    floorXp: xpForLevel(rank.level),
    ceilXp: xpForLevel(rank.level + 1),
    nextLabel: `Nível ${rank.level + 1}`,
  };
}

// ------------------------------------------------- escada de exigência
//
// A campanha exclusiva guarda um número em `Raffle.minLevel`, e esse número
// precisava passar do 21 para a ideia de "exclusiva do GOAT" existir. Antes
// parava no 21 e, pior, meetsMinLevel deixava QUALQUER patente de prestígio
// entrar em qualquer exigência numérica: não havia como pedir prestígio,
// porque o próprio prestígio era o curinga que dispensava a checagem.
//
// As patentes continuam acima do 21, agora com posição própria na mesma
// escada. O valor é fixo por chave, e não pelo índice de PRESTIGE_RANKS: se
// alguém reordenar aquela lista, campanha já publicada mudaria de exigência
// em silêncio.

export const NIVEL_DE_PRESTIGIO: Record<PrestigeKey, number> = {
  MVP: 22,
  PRO_PLAYER: 23,
  GOAT: 24,
};

/** Maior valor aceito em `minLevel`. */
export const MAX_MIN_LEVEL = NIVEL_DE_PRESTIGIO.GOAT;

export interface DegrauDaEscada {
  /** O que vai gravado em Raffle.minLevel. */
  valor: number;
  /** "Xerife" ou "GOAT". */
  label: string;
  /** XP acumulado necessário para alcançar este degrau. */
  xp: number;
  color: string;
}

/**
 * A escada inteira, do nível 1 ao GOAT, na ordem em que o admin escolhe.
 *
 * Deriva de XP_POR_NIVEL e de PRESTIGE_RANKS, então mexer numa das duas
 * tabelas não deixa esta lista para trás.
 */
export const ESCADA_DE_RANK: readonly DegrauDaEscada[] = [
  ...XP_POR_NIVEL.map((xp, nivel) => ({
    valor: nivel,
    label: nomeDoNivel(nivel),
    xp,
    color: levelColor(nivel),
  })).slice(1),
  ...PRESTIGE_RANKS.map((p) => ({
    valor: NIVEL_DE_PRESTIGIO[p.key],
    label: p.label,
    xp: p.xp,
    color: p.color,
  })),
];

/** O degrau correspondente a um valor de `minLevel`, ou null. */
export function degrauDoRank(minLevel: number | null): DegrauDaEscada | null {
  if (minLevel == null || minLevel <= 0) return null;
  return ESCADA_DE_RANK.find((d) => d.valor === minLevel) ?? null;
}

/** XP acumulado que a campanha exige. Zero quando ela é aberta a todos. */
export function xpMinimoParaRank(minLevel: number | null): number {
  return degrauDoRank(minLevel)?.xp ?? 0;
}

/**
 * True quando o rank do usuário libera uma campanha exclusiva.
 *
 * Comparar XP acumulado, e não o número do nível, é o que faz a regra valer
 * para os dois trechos da escada com uma linha só: patente exige mais XP que
 * qualquer nível numérico, então quem é GOAT continua entrando em campanha de
 * nível 10 sem precisar de caso especial, e campanha de GOAT deixa de fora
 * quem está no nível 21.
 */
export function meetsMinLevel(xp: number, minLevel: number | null): boolean {
  const exigido = xpMinimoParaRank(minLevel);
  if (exigido <= 0) return true;
  return Math.max(0, Math.floor(xp)) >= exigido;
}
