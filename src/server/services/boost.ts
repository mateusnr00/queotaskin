// O serviço de boost: pontos, sequência, decaimento, missões e Boost de Sorte.
//
// As regras puras moram em lib/xp/regras. Aqui é a persistência: quem lê o
// estado, quem grava, e sobretudo quem garante que nada pontue duas vezes.
//
// IDEMPOTÊNCIA É O PONTO CENTRAL
//
// Todo crédito de boost passa por `concederBoost`, que exige uma chave. A
// chave carrega o limite da regra: "streak-3:2026-08" pontua uma vez por
// ciclo, "decay:2026-08-28" desconta uma vez por dia, "missao-explorador:
// 2026-08" concede uma vez por ciclo. Reprocessar um webhook, abrir a página
// dez vezes ou rodar o mesmo job de novo não muda nada.

import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  BOOST_DE_SORTE,
  BOOST_RULES,
  MAX_BOOST_POINTS,
} from "@/lib/xp/config";
import {
  aplicarParticipacao,
  calculateDecayedBoostPoints,
  cicloDe,
  diaOficial,
  diasEntre,
  faixaDoBoost,
  getLuckXpBonus,
  limitarBoost,
  podeGanharBoostDeSorte,
  proximaFaixa,
  type EstadoDaSequencia,
} from "@/lib/xp/regras";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Credita ou desconta pontos, uma única vez por chave.
 *
 * Ponto temporário não mexe no saldo permanente: ele vive no histórico com
 * validade e é somado na leitura. Assim, quando expira, o saldo base continua
 * exatamente o que era, sem precisar de job para "devolver".
 */
export async function concederBoost(
  tx: Tx,
  params: {
    userId: string;
    tenantId: string;
    type: "ACTIVITY" | "STREAK" | "MISSION" | "DECAY" | "TEMPORARY_BOOST" | "ADMIN_ADJUSTMENT";
    points: number;
    reason: string;
    idempotencyKey: string;
    expiresAt?: Date | null;
  },
): Promise<boolean> {
  const jaExiste = await tx.boostEntry.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    select: { id: true },
  });
  if (jaExiste) return false;

  await tx.boostEntry.create({
    data: {
      userId: params.userId,
      tenantId: params.tenantId,
      type: params.type,
      points: params.points,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      expiresAt: params.expiresAt ?? null,
    },
  });

  if (!params.expiresAt) {
    const progresso = await tx.userProgress.findUnique({
      where: { userId_tenantId: { userId: params.userId, tenantId: params.tenantId } },
      select: { boostPoints: true },
    });
    await tx.userProgress.update({
      where: { userId_tenantId: { userId: params.userId, tenantId: params.tenantId } },
      data: {
        boostPoints: limitarBoost((progresso?.boostPoints ?? 0) + params.points),
      },
    });
  }

  return true;
}

/** Pontos temporários ainda válidos. */
async function pontosTemporarios(
  tx: Tx,
  userId: string,
  tenantId: string,
  agora: Date,
): Promise<{ pontos: number; expiraEm: Date | null }> {
  const ativos = await tx.boostEntry.findMany({
    where: {
      userId,
      tenantId,
      expiresAt: { gt: agora },
    },
    select: { points: true, expiresAt: true },
  });
  if (ativos.length === 0) return { pontos: 0, expiraEm: null };
  return {
    pontos: ativos.reduce((soma, e) => soma + e.points, 0),
    expiraEm: ativos
      .map((e) => e.expiresAt!)
      .sort((a, b) => b.getTime() - a.getTime())[0]!,
  };
}

/**
 * Registra a participação de uma compra paga: sequência e pontos.
 *
 * Roda dentro da transação do XP porque o multiplicador usado na compra tem
 * de ser o de antes desta participação: creditar o ponto primeiro faria a
 * própria compra pagar o boost que ela mesma acabou de gerar.
 */
export async function registrarParticipacao(
  tx: Tx,
  params: {
    userId: string;
    tenantId: string;
    raffleId: string;
    reservationId: string;
    quando: Date;
  },
): Promise<void> {
  const chave = { userId: params.userId, tenantId: params.tenantId };
  const progresso = await tx.userProgress.findUnique({
    where: { userId_tenantId: chave },
    select: {
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true,
      streakProtectionAvailable: true,
      diasAtivosAposProtecao: true,
    },
  });
  if (!progresso) return;

  const dia = diaOficial(params.quando);
  const ciclo = cicloDe(params.quando);

  const antes: EstadoDaSequencia = {
    sequencia: progresso.currentStreak,
    recorde: progresso.longestStreak,
    ultimoDia: progresso.lastActiveDate,
    protecaoDisponivel: progresso.streakProtectionAvailable,
    diasAtivosAposProtecao: progresso.diasAtivosAposProtecao,
  };
  const depois = aplicarParticipacao(antes, dia);
  const diaNovo = depois.ultimoDia !== antes.ultimoDia;

  await tx.userProgress.update({
    where: { userId_tenantId: chave },
    data: {
      currentStreak: depois.sequencia,
      longestStreak: depois.recorde,
      lastActiveDate: depois.ultimoDia,
      lastParticipationAt: params.quando,
      streakProtectionAvailable: depois.protecaoDisponivel,
      diasAtivosAposProtecao: depois.diasAtivosAposProtecao,
      ...(antes.protecaoDisponivel && !depois.protecaoDisponivel
        ? { streakProtectionUsedAt: params.quando }
        : {}),
    },
  });

  // Nada mais pontua se a compra caiu num dia que já tinha participação: é o
  // que impede dez compras no mesmo dia de virarem dez vezes o ponto do dia.
  if (!diaNovo) return;

  await concederBoost(tx, {
    ...chave,
    type: "ACTIVITY",
    points: BOOST_RULES.PARTICIPATED_TODAY,
    reason: "Participou hoje",
    idempotencyKey: `atividade:${params.userId}:${params.tenantId}:${dia}`,
  });

  // Marcos de sequência: um por ciclo, cobrado pela chave.
  const marcos: [number, number][] = [
    [7, BOOST_RULES.STREAK_7_DAYS],
    [5, BOOST_RULES.STREAK_5_DAYS],
    [3, BOOST_RULES.STREAK_3_DAYS],
    [2, BOOST_RULES.STREAK_2_DAYS],
  ];
  for (const [dias, pontos] of marcos) {
    if (depois.sequencia === dias) {
      await concederBoost(tx, {
        ...chave,
        type: "STREAK",
        points: pontos,
        reason: `Sequência de ${dias} dias`,
        idempotencyKey: `streak-${dias}:${params.userId}:${params.tenantId}:${ciclo}`,
      });
    }
  }

  await avaliarMissoes(tx, { ...chave, ciclo, quando: params.quando });
}

/**
 * Missões do ciclo. Concedidas pelo backend, sem clique, e uma vez só.
 *
 * As quatro são calculáveis com o que existe: dias distintos e campanhas
 * distintas saem das reservas pagas. Nenhuma delas revela valor de compra.
 */
async function avaliarMissoes(
  tx: Tx,
  params: { userId: string; tenantId: string; ciclo: string; quando: Date },
): Promise<void> {
  const resumo = await resumoDoCiclo(tx, params.userId, params.tenantId, params.quando);

  const missoes: { id: string; ok: boolean; pontos: number; nome: string }[] = [
    {
      id: "de-volta",
      nome: "De volta ao jogo",
      ok: resumo.diasAtivos >= 1,
      pontos: BOOST_RULES.PARTICIPATED_TODAY,
    },
    {
      id: "em-sequencia",
      nome: "Em sequência",
      ok: resumo.sequencia >= 3,
      pontos: BOOST_RULES.STREAK_3_DAYS,
    },
    {
      id: "explorador",
      nome: "Explorador",
      ok: resumo.campanhasDistintas >= 2,
      pontos: BOOST_RULES.TWO_DIFFERENT_CAMPAIGNS,
    },
    {
      id: "semana-ativa",
      nome: "Semana ativa",
      ok: resumo.diasAtivos >= 5,
      pontos: BOOST_RULES.FIVE_ACTIVE_DAYS_IN_CYCLE,
    },
  ];

  for (const missao of missoes) {
    if (!missao.ok) continue;
    await concederBoost(tx, {
      userId: params.userId,
      tenantId: params.tenantId,
      type: "MISSION",
      points: missao.pontos,
      reason: missao.nome,
      idempotencyKey: `missao-${missao.id}:${params.userId}:${params.tenantId}:${params.ciclo}`,
    });
  }
}

/** Dias distintos e campanhas distintas com compra paga no ciclo. */
export async function resumoDoCiclo(
  tx: Tx,
  userId: string,
  tenantId: string,
  quando: Date,
): Promise<{
  diasAtivos: number;
  campanhasDistintas: number;
  sequencia: number;
}> {
  const ciclo = cicloDe(quando);
  const inicio = new Date(`${ciclo}-01T00:00:00.000Z`);

  const reservas = await tx.reservation.findMany({
    where: {
      userId,
      status: "PAID",
      paidAt: { gte: inicio },
      raffle: { tenantId },
    },
    select: { paidAt: true, raffleId: true },
  });

  const dias = new Set<string>();
  const campanhas = new Set<string>();
  for (const r of reservas) {
    if (r.paidAt) dias.add(diaOficial(r.paidAt));
    campanhas.add(r.raffleId);
  }

  const progresso = await tx.userProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { currentStreak: true },
  });

  return {
    diasAtivos: dias.size,
    campanhasDistintas: campanhas.size,
    sequencia: progresso?.currentStreak ?? 0,
  };
}

/**
 * Aplica o decaimento por inatividade, uma vez por dia no máximo.
 *
 * Chamado na leitura do progresso, e não por cron: a regra depende só de
 * "quantos dias desde a última participação", que é calculável a qualquer
 * momento. `lastDecayDay` é o que impede reabrir a página e descontar de novo.
 */
export async function aplicarDecaimento(
  userId: string,
  tenantId: string,
  agora = new Date(),
): Promise<void> {
  const progresso = await prisma.userProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: {
      boostPoints: true,
      lastActiveDate: true,
      lastDecayDay: true,
    },
  });
  if (!progresso?.lastActiveDate) return;
  if (progresso.boostPoints <= 0) return;

  const hoje = diaOficial(agora);
  if (progresso.lastDecayDay === hoje) return;

  const inativos = diasEntre(progresso.lastActiveDate, hoje);
  const novos = calculateDecayedBoostPoints(progresso.boostPoints, inativos);
  if (novos === progresso.boostPoints) return;

  const perda = novos - progresso.boostPoints;
  await prisma.$transaction(async (tx) => {
    await tx.userProgress.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: {
        boostPoints: novos,
        lastDecayAppliedAt: agora,
        lastDecayDay: hoje,
      },
    });
    await tx.boostEntry.create({
      data: {
        userId,
        tenantId,
        type: "DECAY",
        points: perda,
        reason: `${inativos} dias sem participar`,
        idempotencyKey: `decay:${userId}:${tenantId}:${hoje}`,
      },
    });
  }).catch((err) => {
    // Corrida entre duas leituras simultâneas: a segunda bate na chave única
    // e não desconta de novo, que é exatamente o comportamento desejado.
    if (String(err?.code) !== "P2002") throw err;
  });
}

/**
 * Destrava o Boost de Sorte quando cabe.
 *
 * Só XP. Não muda chance de ganhar, número de títulos, sorteio nem
 * distribuição de prêmio.
 */
export async function avaliarBoostDeSorte(
  userId: string,
  tenantId: string,
  agora = new Date(),
): Promise<void> {
  const progresso = await prisma.userProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { lastWinAt: true, lastParticipationAt: true, createdAt: true },
  });
  if (!progresso) return;

  const hoje = diaOficial(agora);
  const desdeVitoria = progresso.lastWinAt ?? progresso.createdAt;
  const diasSemPremio = diasEntre(diaOficial(desdeVitoria), hoje);
  const diasDesdeParticipacao = progresso.lastParticipationAt
    ? diasEntre(diaOficial(progresso.lastParticipationAt), hoje)
    : null;

  if (!podeGanharBoostDeSorte({ diasSemPremio, diasDesdeUltimaParticipacao: diasDesdeParticipacao })) {
    return;
  }

  // Uma instância por janela: a chave usa a faixa e o dia, então reabrir a
  // página não empilha vários boosts do mesmo tipo.
  const faixa = getLuckXpBonus(diasSemPremio);
  const expiresAt = new Date(
    agora.getTime() + BOOST_DE_SORTE.horasDeValidade * 3_600_000,
  );

  const jaAtivo = await prisma.boostEntry.findFirst({
    where: { userId, tenantId, type: "TEMPORARY_BOOST", expiresAt: { gt: agora } },
    select: { id: true },
  });
  if (jaAtivo) return;

  await concederBoost(prisma, {
    userId,
    tenantId,
    type: "TEMPORARY_BOOST",
    // Guarda a faixa em pontos só para o histórico ficar legível; o bônus de
    // XP em si é recalculado na compra a partir dos dias sem prêmio.
    points: Math.round(faixa * 100),
    reason: "Boost de Sorte",
    idempotencyKey: `sorte:${userId}:${tenantId}:${hoje}`,
    expiresAt,
  });
}

/** Encerra o Boost de Sorte e reinicia a contagem. Chamar ao registrar vitória. */
export async function registrarVitoria(
  userId: string,
  tenantId: string,
  quando = new Date(),
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.userProgress.updateMany({
      where: { userId, tenantId },
      data: { lastWinAt: quando },
    });
    // Expira o boost ativo: ganhou, o benefício de fidelidade se encerra.
    await tx.boostEntry.updateMany({
      where: { userId, tenantId, type: "TEMPORARY_BOOST", expiresAt: { gt: quando } },
      data: { expiresAt: quando },
    });
  });
}

// ------------------------------------------------------------- leitura

export interface EstadoDoBoost {
  boostPoints: number;
  multiplicador: number;
  faixaAtual: string;
  proximaFaixaNome: string | null;
  pontosParaProximaFaixa: number | null;
  sequencia: number;
  recorde: number;
  protecaoDisponivel: boolean;
  diasAtivosNoCiclo: number;
  campanhasNoCiclo: number;
  boostDeSorteAtivo: boolean;
  boostDeSorteExpiraEm: string | null;
  participouHoje: boolean;
}

/**
 * O estado que a página "Minha conta" mostra.
 *
 * Aplica decaimento e avalia o Boost de Sorte antes de ler, porque as duas
 * regras dependem só da passagem do tempo: sem isto a pessoa veria um estado
 * velho até a próxima compra.
 */
export async function estadoDoBoost(
  userId: string,
  tenantId: string,
  agora = new Date(),
): Promise<EstadoDoBoost> {
  await aplicarDecaimento(userId, tenantId, agora);
  await avaliarBoostDeSorte(userId, tenantId, agora);

  const progresso = await prisma.userProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: {
      boostPoints: true,
      currentStreak: true,
      longestStreak: true,
      lastActiveDate: true,
      streakProtectionAvailable: true,
    },
  });

  const temporarios = await pontosTemporarios(prisma, userId, tenantId, agora);
  const pontos = limitarBoost((progresso?.boostPoints ?? 0));
  const faixa = faixaDoBoost(pontos);
  const proxima = proximaFaixa(pontos);
  const ciclo = await resumoDoCiclo(prisma, userId, tenantId, agora);

  return {
    boostPoints: pontos,
    multiplicador: faixa.multiplier,
    faixaAtual: faixa.name,
    proximaFaixaNome: proxima?.name ?? null,
    pontosParaProximaFaixa: proxima ? proxima.minBoostPoints - pontos : null,
    sequencia: progresso?.currentStreak ?? 0,
    recorde: progresso?.longestStreak ?? 0,
    protecaoDisponivel: progresso?.streakProtectionAvailable ?? true,
    diasAtivosNoCiclo: ciclo.diasAtivos,
    campanhasNoCiclo: ciclo.campanhasDistintas,
    boostDeSorteAtivo: temporarios.expiraEm != null,
    boostDeSorteExpiraEm: temporarios.expiraEm?.toISOString() ?? null,
    participouHoje: progresso?.lastActiveDate === diaOficial(agora),
  };
}

/** O teto de pontos, exportado para a interface desenhar a barra. */
export const TETO_DE_BOOST = MAX_BOOST_POINTS;
