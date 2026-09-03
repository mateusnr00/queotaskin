// Toda a configuração do sistema de XP, num lugar só.
//
// Existe para que mudar uma regra seja mexer aqui, e não caçar número solto
// em componente. Nada neste arquivo pode ser importado por componente de
// cliente sem cuidado: as faixas de compra e a régua de XP por real são
// informação interna, e a interface não pode revelá-las.

/**
 * A régua de XP por real quando o painel não tem uma válida.
 *
 * DEFAULT, E NÃO A RÉGUA.
 *
 * Quem manda é `Tenant.xpPerBrl`. Esta constante existe só para o caso de a
 * coluna vir nula, zerada ou corrompida, e para os cálculos fora de um painel
 * (a tabela de níveis do `rank.ts` foi escrita nesta régua).
 *
 * Ela já foi `BASE_XP_PER_REAL` e era usada direto no crédito, enquanto a
 * barra de progresso usava `Tenant.xpPerBrl`: dois números para a mesma
 * pergunta. Com os dois valendo 10 ninguém notava, e no dia em que o painel
 * mudasse a régua a barra prometeria um "quanto falta" que o crédito não
 * cumpriria.
 */
export const DEFAULT_XP_PER_BRL = 10;

/**
 * A régua efetiva a partir do que está guardado no painel.
 *
 * Passa por aqui TODO mundo que converte dinheiro em XP, crédito e tela, para
 * que um valor estragado no banco não produza uma conta na tela e outra no
 * extrato. Régua não positiva, não finita ou fracionária não é corrigida pela
 * metade: vira o default.
 */
export function xpPorReal(valor: number | null | undefined): number {
  if (typeof valor !== "number") return DEFAULT_XP_PER_BRL;
  if (!Number.isFinite(valor) || !Number.isInteger(valor)) return DEFAULT_XP_PER_BRL;
  if (valor <= 0) return DEFAULT_XP_PER_BRL;
  return valor;
}

/**
 * O teto da régua configurável.
 *
 * Existe porque a escada de níveis é uma tabela fixa em XP: uma régua de mil
 * XP por real levaria alguém ao nível 21 com R$ 300, e a progressão inteira
 * perderia sentido sem que nada no sistema reclamasse.
 */
export const MAX_XP_PER_BRL = 100;

/** Teto do multiplicador somado. Nenhuma combinação de bônus passa disto. */
export const MAX_XP_MULTIPLIER = 2.5;

/** Fuso oficial. Dia de sequência é dia daqui, não do servidor. */
export const FUSO_OFICIAL = "America/Sao_Paulo";

// ----------------------------------------------------------- multiplicador

export const XP_MULTIPLIER_TIERS = [
  { name: "Base", minBoostPoints: 0, multiplier: 1.0 },
  { name: "Aquecido", minBoostPoints: 20, multiplier: 1.2 },
  { name: "Ativo", minBoostPoints: 40, multiplier: 1.5 },
  { name: "Turbo", minBoostPoints: 70, multiplier: 2.0 },
  { name: "Lendário", minBoostPoints: 100, multiplier: 2.5 },
] as const;

export type FaixaDeMultiplicador = (typeof XP_MULTIPLIER_TIERS)[number];

/** Teto dos pontos que contam para a faixa normal. */
export const MAX_BOOST_POINTS = 100;

// ------------------------------------------------------------ pontos de boost

export const BOOST_RULES = {
  PARTICIPATED_TODAY: 5,
  STREAK_2_DAYS: 5,
  STREAK_3_DAYS: 10,
  STREAK_5_DAYS: 15,
  STREAK_7_DAYS: 25,
  TWO_DIFFERENT_CAMPAIGNS: 10,
  FIVE_ACTIVE_DAYS_IN_CYCLE: 15,
  TEN_ACTIVE_DAYS_IN_CYCLE: 25,
  WEEKLY_MISSION_COMPLETED: 10,
} as const;

// -------------------------------------------------------------- inatividade

export const DECAIMENTO = {
  /** Dias de folga antes de qualquer perda. */
  diasDeCarencia: 2,
  /** Perda no primeiro dia que passa da carência. */
  penalidadeInicial: 10,
  /** Perda por dia adicional depois dessa. */
  penalidadePorDia: 5,
} as const;

// ------------------------------------------------------- bônus por compra
//
// Os limites são em REAIS e são INTERNOS. A interface diz "compra relevante",
// nunca a partir de quanto. Procurei ticket médio ou faixas já configuradas no
// projeto e não existe nenhuma: os degraus abaixo são a primeira definição,
// escolhidos a partir do preço por número das campanhas atuais (R$ 1 a R$ 15)
// e dos combos de até 50 números, e ficam aqui para serem ajustados com dado
// real depois.

export type FaixaDeCompra = "STANDARD" | "RELEVANT" | "HIGH" | "EXCEPTIONAL";

export const FAIXAS_DE_COMPRA: {
  faixa: FaixaDeCompra;
  minimoEmReais: number;
  bonus: number;
  rotulo: string;
}[] = [
  { faixa: "EXCEPTIONAL", minimoEmReais: 500, bonus: 0.5, rotulo: "Compra excepcional" },
  { faixa: "HIGH", minimoEmReais: 200, bonus: 0.25, rotulo: "Compra alta" },
  { faixa: "RELEVANT", minimoEmReais: 50, bonus: 0.1, rotulo: "Compra relevante" },
  { faixa: "STANDARD", minimoEmReais: 0, bonus: 0, rotulo: "Compra" },
];

// ------------------------------------------------------------ boost de sorte
//
// Aumenta SÓ o XP. Não encosta em chance de ganhar, quantidade de títulos,
// sorteio nem distribuição de prêmio.

export const BOOST_DE_SORTE = {
  faixas: [
    { diasSemPremio: 30, bonus: 0.3 },
    { diasSemPremio: 21, bonus: 0.2 },
    { diasSemPremio: 14, bonus: 0.1 },
  ],
  /** Quanto tempo o boost vale depois de destravado. */
  horasDeValidade: 72,
  /** Sem participação nesta janela, conta parada não ganha boost. */
  diasDeParticipacaoExigida: 30,
} as const;

// ------------------------------------------------------------------- GOAT
//
// O único degrau com exigência financeira. Não aparece na interface: para o
// usuário, GOAT é o prestígio máximo, e ponto.

export const GOAT_MIN_TOTAL_SPENT = 50_000;

// ---------------------------------------------------------------- sequência

export const SEQUENCIA = {
  /** Dias ativos para a proteção voltar depois de usada. */
  diasParaRecuperarProtecao: 7,
} as const;
