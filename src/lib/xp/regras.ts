// As regras do XP: multiplicador, sequência, decaimento, bônus e o cálculo
// final de uma compra.
//
// Funções puras de propósito. Elas decidem, o serviço persiste. É o que
// permite testar a regra sem banco, e é o que impede a regra de se espalhar
// por componente: nenhum lugar da interface recalcula multiplicador.

import {
  BOOST_DE_SORTE,
  xpPorReal,
  DECAIMENTO,
  FAIXAS_DE_COMPRA,
  FUSO_OFICIAL,
  MAX_BOOST_POINTS,
  MAX_XP_MULTIPLIER,
  XP_MULTIPLIER_TIERS,
  type FaixaDeCompra,
  type FaixaDeMultiplicador,
} from "./config";

// ----------------------------------------------------------------- datas

/**
 * O dia no fuso oficial, como "2026-08-28".
 *
 * Sequência é contada em dias diferentes, e "dia" tem de ser o do comprador.
 * Usando a data do servidor, uma compra às 22h de Brasília cairia no dia
 * seguinte em UTC e a sequência quebraria sozinha.
 */
export function diaOficial(momento: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_OFICIAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(momento);
}

/** Diferença em dias entre dois dias oficiais no formato "AAAA-MM-DD". */
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** O ciclo do boost: mês-calendário no fuso oficial, como "2026-08". */
export function cicloDe(momento: Date): string {
  return diaOficial(momento).slice(0, 7);
}

// ---------------------------------------------------------- multiplicador

/** A faixa correspondente aos pontos. Nunca abaixo de Base. */
export function faixaDoBoost(boostPoints: number): FaixaDeMultiplicador {
  const pontos = limitarBoost(boostPoints);
  let atual: FaixaDeMultiplicador = XP_MULTIPLIER_TIERS[0];
  for (const faixa of XP_MULTIPLIER_TIERS) {
    if (pontos >= faixa.minBoostPoints) atual = faixa;
  }
  return atual;
}

/** O multiplicador de atividade. Mínimo 1,0. */
export function getActivityMultiplier(boostPoints: number): number {
  return faixaDoBoost(boostPoints).multiplier;
}

/** Pontos válidos: nunca negativo, nunca acima do teto da faixa normal. */
export function limitarBoost(pontos: number): number {
  if (!Number.isFinite(pontos)) return 0;
  return Math.max(0, Math.min(MAX_BOOST_POINTS, Math.floor(pontos)));
}

/** A próxima faixa, ou null quando já está na maior. */
export function proximaFaixa(
  boostPoints: number,
): FaixaDeMultiplicador | null {
  const pontos = limitarBoost(boostPoints);
  return (
    XP_MULTIPLIER_TIERS.find((f) => f.minBoostPoints > pontos) ?? null
  );
}

// ------------------------------------------------------------- decaimento

/**
 * Os pontos depois de N dias sem participar.
 *
 * Quem persiste é o serviço, e ele guarda a data da última aplicação: sem
 * isso, abrir a página cinco vezes descontaria cinco vezes.
 */
export function calculateDecayedBoostPoints(
  currentPoints: number,
  inactiveDays: number,
): number {
  const pontos = limitarBoost(currentPoints);
  if (inactiveDays <= DECAIMENTO.diasDeCarencia) return pontos;

  const adicionais = Math.max(0, inactiveDays - (DECAIMENTO.diasDeCarencia + 1));
  const perda =
    DECAIMENTO.penalidadeInicial + adicionais * DECAIMENTO.penalidadePorDia;
  return Math.max(0, pontos - perda);
}

// -------------------------------------------------------- bônus da compra

/** A faixa interna da compra. Os limites em reais nunca vão para a tela. */
export function faixaDaCompra(valorEmReais: number): {
  faixa: FaixaDeCompra;
  bonus: number;
  rotulo: string;
} {
  const valor = Number.isFinite(valorEmReais) ? valorEmReais : 0;
  const achada =
    FAIXAS_DE_COMPRA.find((f) => valor >= f.minimoEmReais) ??
    FAIXAS_DE_COMPRA[FAIXAS_DE_COMPRA.length - 1]!;
  return { faixa: achada.faixa, bonus: achada.bonus, rotulo: achada.rotulo };
}

// ------------------------------------------------------- boost de sorte

/**
 * O bônus por tempo sem prêmio. Só XP: não muda chance, nem número de
 * títulos, nem sorteio, nem distribuição de prêmio.
 */
export function getLuckXpBonus(daysSinceLastWin: number): number {
  if (!Number.isFinite(daysSinceLastWin)) return 0;
  for (const faixa of BOOST_DE_SORTE.faixas) {
    if (daysSinceLastWin >= faixa.diasSemPremio) return faixa.bonus;
  }
  return 0;
}

/**
 * Se o boost de sorte pode ser destravado.
 *
 * Exige participação recente: conta parada há dois anos não vira "sortudo"
 * por inatividade, que seria premiar quem não está jogando.
 */
export function podeGanharBoostDeSorte(params: {
  diasSemPremio: number;
  diasDesdeUltimaParticipacao: number | null;
}): boolean {
  if (params.diasDesdeUltimaParticipacao == null) return false;
  if (
    params.diasDesdeUltimaParticipacao >
    BOOST_DE_SORTE.diasDeParticipacaoExigida
  ) {
    return false;
  }
  return getLuckXpBonus(params.diasSemPremio) > 0;
}

// ------------------------------------------------------------- sequência

export interface EstadoDaSequencia {
  /** Dias seguidos. */
  sequencia: number;
  /** Maior já alcançada. */
  recorde: number;
  /** Último dia oficial com participação, ou null. */
  ultimoDia: string | null;
  protecaoDisponivel: boolean;
  /** Dias ativos desde que a proteção foi gasta. */
  diasAtivosAposProtecao: number;
}

/**
 * Aplica uma participação e devolve o novo estado da sequência.
 *
 * Duas compras no mesmo dia não mexem em nada: sequência é dia diferente, e
 * não quantidade de compras. Uma ausência é perdoada pela proteção, que
 * apenas evita a perda, sem aumentar a sequência.
 */
export function aplicarParticipacao(
  estado: EstadoDaSequencia,
  dia: string,
): EstadoDaSequencia {
  if (estado.ultimoDia === dia) return estado;

  if (estado.ultimoDia === null) {
    return {
      sequencia: 1,
      recorde: Math.max(1, estado.recorde),
      ultimoDia: dia,
      protecaoDisponivel: estado.protecaoDisponivel,
      diasAtivosAposProtecao: estado.protecaoDisponivel
        ? estado.diasAtivosAposProtecao
        : estado.diasAtivosAposProtecao + 1,
    };
  }

  const distancia = diasEntre(estado.ultimoDia, dia);
  // Data anterior à última registrada: reprocessamento fora de ordem, ignora.
  if (distancia <= 0) return estado;

  let sequencia: number;
  let protecaoDisponivel = estado.protecaoDisponivel;
  let diasAtivosAposProtecao = estado.diasAtivosAposProtecao;

  if (distancia === 1) {
    sequencia = estado.sequencia + 1;
  } else if (distancia === 2 && estado.protecaoDisponivel) {
    // A ausência foi perdoada. A sequência continua de onde estava, mas não
    // ganha o dia que não houve: proteger não é participar.
    sequencia = estado.sequencia + 1;
    protecaoDisponivel = false;
    diasAtivosAposProtecao = 0;
  } else {
    sequencia = 1;
  }

  if (!protecaoDisponivel) {
    diasAtivosAposProtecao += 1;
    if (diasAtivosAposProtecao >= 7) {
      protecaoDisponivel = true;
      diasAtivosAposProtecao = 0;
    }
  }

  return {
    sequencia,
    recorde: Math.max(sequencia, estado.recorde),
    ultimoDia: dia,
    protecaoDisponivel,
    diasAtivosAposProtecao,
  };
}

// -------------------------------------------------------- cálculo do XP

export interface ComposicaoDoXp {
  baseXp: number;
  /** A régua usada nesta conta, em XP por real. Vai para a auditoria. */
  xpPerBrl: number;
  activityMultiplier: number;
  purchaseBonus: number;
  luckBonus: number;
  eventBonus: number;
  finalMultiplier: number;
  bonusXp: number;
  earnedXp: number;
}

/**
 * O XP de uma compra, decomposto.
 *
 * Uma função só, no servidor. O resultado inteiro é gravado no extrato, e é
 * ele que a página mostra: regra que mudar amanhã não pode reescrever o que
 * já foi creditado ontem.
 */
export function calculatePurchaseXp({
  purchaseAmount,
  activityMultiplier,
  purchaseBonus,
  luckBonus,
  eventBonus = 0,
  xpPerBrl,
}: {
  /** Valor pago, em reais. */
  purchaseAmount: number;
  activityMultiplier: number;
  purchaseBonus: number;
  luckBonus: number;
  eventBonus?: number;
  /**
   * A régua do painel, em XP por real. Ausente vale o default do projeto,
   * que é o mesmo que a barra de progresso usa quando não há painel.
   *
   * Entra por parâmetro, e não por importação de constante: é o que faz esta
   * função ter UMA régua, a que quem chama resolveu, em vez de uma régua
   * própria discordando da tela.
   */
  xpPerBrl?: number | null;
}): ComposicaoDoXp {
  // Trunca no real cheio, como o projeto já fazia: R$ 19,90 rende o mesmo que
  // R$ 19,00, o que evita XP fracionado e mantém a conta legível.
  // O TRUNCAMENTO NO REAL CHEIO É REGRA, E CONTINUA SENDO.
  //
  // R$ 19,90 rende o mesmo que R$ 19,00. Está aqui desde antes, é o que
  // mantém o XP inteiro e a conta explicável para quem compra, e não muda
  // por causa da régua: o que a régua troca é o quanto cada real vale.
  const porReal = xpPorReal(xpPerBrl);
  const baseXp = Math.max(0, Math.floor(Math.floor(purchaseAmount) * porReal));

  const finalMultiplier = Math.min(
    activityMultiplier + purchaseBonus + luckBonus + eventBonus,
    MAX_XP_MULTIPLIER,
  );

  const earnedXp = Math.floor(baseXp * finalMultiplier);

  return {
    baseXp,
    xpPerBrl: porReal,
    activityMultiplier,
    purchaseBonus,
    luckBonus,
    eventBonus,
    finalMultiplier,
    bonusXp: earnedXp - baseXp,
    earnedXp,
  };
}
