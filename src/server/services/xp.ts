// Créditos de XP do sistema de rank.
//
// O extrato (XpEntry) é a fonte da verdade; UserProgress.xp é só o total
// desnormalizado, para o ranking ordenar sem varrer o extrato inteiro.
//
// Concorrência: creditar é `insere no extrato → recalcula o total`. Feito em
// duas idas ao banco sem trava, dois pagamentos simultâneos do mesmo usuário
// leem o mesmo total antigo e o segundo sobrescreve o primeiro — o XP de uma
// das compras some. Por isso todo crédito roda dentro de uma transação com
// `pg_advisory_xact_lock` por (usuário, tenant), e o total é RECALCULADO a
// partir do extrato depois do insert, nunca incrementado a partir de uma
// leitura anterior.

import type { Prisma, XpReason } from "@prisma/client";

import { prisma } from "@/lib/db";
import { xpForPurchase } from "@/lib/rank";

// Idempotência é resolvida com "consulta antes de inserir", nunca capturando
// a violação do índice único: no Postgres, um statement que falha aborta a
// transação inteira (SQLSTATE 25P02) e todo comando seguinte é recusado até o
// rollback — então não dá para capturar o erro e continuar somando o extrato.
// Consultar antes é seguro porque já estamos dentro do advisory lock: nenhuma
// outra transação consegue inserir para o mesmo (usuário, tenant) no meio do
// caminho. O índice único fica como rede de segurança.

export interface CreditResult {
  /** false quando o crédito já existia (reentrega de webhook). */
  credited: boolean;
  amount: number;
  /** Total de XP do usuário no tenant depois da operação. */
  totalXp: number;
}

/**
 * Trava consultiva por (usuário, tenant) válida até o fim da transação.
 *
 * `hashtext` devolve int4; usamos a variante de dois inteiros para reduzir a
 * chance de dois pares diferentes colidirem na mesma trava.
 */
async function lockUser(
  tx: Prisma.TransactionClient,
  userId: string,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${tenantId}))
  `;
}

/** Soma o extrato e grava o total. Sempre chamado dentro do lock. */
async function recomputeTotal(
  tx: Prisma.TransactionClient,
  userId: string,
  tenantId: string,
): Promise<number> {
  const sum = await tx.xpEntry.aggregate({
    where: { userId, tenantId },
    _sum: { amount: true },
  });
  // Um estorno maior que o saldo não pode deixar o rank negativo.
  const total = Math.max(0, sum._sum.amount ?? 0);

  await tx.userProgress.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: { xp: total },
    create: { userId, tenantId, xp: total },
  });

  return total;
}

/**
 * Credita XP de uma reserva paga. Idempotente: o índice único
 * (userId, reason, reservationId) faz a segunda chamada virar no-op.
 *
 * Nunca lança — XP é efeito colateral do pagamento, e falhar aqui não pode
 * derrubar a confirmação de uma compra que o cliente já pagou.
 */
export async function awardXpForReservation(
  reservationId: string,
): Promise<CreditResult | null> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        userId: true,
        status: true,
        totalAmount: true,
        raffle: { select: { tenantId: true, title: true } },
      },
    });

    // Reserva de convidado (sem conta) não tem para quem creditar.
    if (!reservation?.userId) return null;
    if (reservation.status !== "PAID") return null;

    const tenant = await prisma.tenant.findUnique({
      where: { id: reservation.raffle.tenantId },
      select: { xpPerBrl: true, rankEnabled: true },
    });
    if (!tenant?.rankEnabled) return null;

    const amount = xpForPurchase(Number(reservation.totalAmount), tenant.xpPerBrl);
    if (amount <= 0) return null;

    const userId = reservation.userId;
    const tenantId = reservation.raffle.tenantId;

    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId, tenantId);

      const existing = await tx.xpEntry.findFirst({
        where: { reservationId, reason: "PURCHASE" },
        select: { id: true },
      });
      if (existing) {
        // Já creditado numa entrega anterior do webhook.
        const totalXp = await recomputeTotal(tx, userId, tenantId);
        return { credited: false, amount: 0, totalXp };
      }

      await tx.xpEntry.create({
        data: {
          userId,
          tenantId,
          amount,
          reason: "PURCHASE",
          reservationId,
          description: reservation.raffle.title,
        },
      });

      const totalXp = await recomputeTotal(tx, userId, tenantId);
      return { credited: true, amount, totalXp };
    });
  } catch (err) {
    console.error("[awardXpForReservation]", err);
    return null;
  }
}

/**
 * Estorna o XP de uma reserva reembolsada, lançando o valor negativo. Também
 * idempotente: um só estorno por reserva.
 *
 * AINDA SEM CHAMADOR AUTOMÁTICO: a plataforma tem o status REFUNDED no enum,
 * mas nenhum fluxo que o aplique. Quando o estorno for implementado, chame
 * esta função no mesmo ponto em que a reserva vira REFUNDED — é para isso que
 * o extrato existe. Até lá, dá para chamá-la manualmente num script.
 */
export async function reverseXpForReservation(
  reservationId: string,
): Promise<CreditResult | null> {
  try {
    const purchase = await prisma.xpEntry.findFirst({
      where: { reservationId, reason: "PURCHASE" },
      select: { userId: true, tenantId: true, amount: true, description: true },
    });
    if (!purchase || purchase.amount <= 0) return null;

    const { userId, tenantId } = purchase;

    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId, tenantId);

      const existing = await tx.xpEntry.findFirst({
        where: { reservationId, reason: "REFUND" },
        select: { id: true },
      });
      if (existing) {
        const totalXp = await recomputeTotal(tx, userId, tenantId);
        return { credited: false, amount: 0, totalXp };
      }

      await tx.xpEntry.create({
        data: {
          userId,
          tenantId,
          amount: -purchase.amount,
          reason: "REFUND",
          reservationId,
          description: `Estorno — ${purchase.description ?? "compra"}`,
        },
      });

      const totalXp = await recomputeTotal(tx, userId, tenantId);
      return { credited: true, amount: -purchase.amount, totalXp };
    });
  } catch (err) {
    console.error("[reverseXpForReservation]", err);
    return null;
  }
}

/**
 * Lançamento manual pelo painel (bônus de evento, compensação, correção).
 * Sem reservationId, então pode repetir — cada chamada é um lançamento novo.
 * Diferente dos créditos automáticos, este LANÇA em caso de erro: o admin
 * precisa saber que o ajuste não foi aplicado.
 */
export async function adjustXp(params: {
  userId: string;
  tenantId: string;
  amount: number;
  description: string;
  reason?: Extract<XpReason, "ADMIN_ADJUST" | "BONUS">;
}): Promise<CreditResult> {
  const { userId, tenantId, amount, description } = params;
  const reason = params.reason ?? "ADMIN_ADJUST";

  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("O ajuste de XP precisa ser um inteiro diferente de zero.");
  }

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId, tenantId);
    await tx.xpEntry.create({
      data: { userId, tenantId, amount, reason, reservationId: null, description },
    });
    const totalXp = await recomputeTotal(tx, userId, tenantId);
    return { credited: true, amount, totalXp };
  });
}

/** XP do usuário no tenant. Zero quando ainda não pontuou. */
export async function getUserXp(userId: string, tenantId: string): Promise<number> {
  const progress = await prisma.userProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { xp: true },
  });
  return progress?.xp ?? 0;
}

export interface LeaderboardRow {
  position: number;
  userId: string;
  name: string;
  phone: string | null;
  xp: number;
  /** Total pago pelo participante neste tenant. */
  spent: number;
  paidReservations: number;
  lastPurchaseAt: Date | null;
}

/**
 * Ranking do tenant, do maior XP para o menor.
 *
 * É uma ferramenta de operação, não uma vitrine: por isso traz telefone,
 * gasto e última compra junto do XP. A tela vive só no painel administrativo
 * — expor publicamente quem gasta mais é convite a engenharia social.
 */
export async function leaderboard(
  tenantId: string,
  take = 100,
): Promise<LeaderboardRow[]> {
  const rows = await prisma.userProgress.findMany({
    where: { tenantId, xp: { gt: 0 } },
    orderBy: [{ xp: "desc" }, { updatedAt: "asc" }],
    take,
    select: {
      userId: true,
      xp: true,
      user: { select: { name: true, phone: true } },
    },
  });
  if (rows.length === 0) return [];

  const userIds = rows.map((row) => row.userId);

  // Gasto e volume de cada um, numa agregação só — restrita ao tenant, para
  // o admin não ver somatório de compras feitas em outro operador.
  const stats = await prisma.reservation.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
      status: "PAID",
      raffle: { tenantId },
    },
    _sum: { totalAmount: true },
    _count: { _all: true },
    _max: { paidAt: true },
  });

  const byUser = new Map(
    stats.map((stat) => [
      stat.userId!,
      {
        spent: Number(stat._sum.totalAmount ?? 0),
        paidReservations: stat._count._all,
        lastPurchaseAt: stat._max.paidAt,
      },
    ]),
  );

  return rows.map((row, index) => {
    const stat = byUser.get(row.userId);
    return {
      position: index + 1,
      userId: row.userId,
      name: row.user.name,
      phone: row.user.phone,
      xp: row.xp,
      spent: stat?.spent ?? 0,
      paidReservations: stat?.paidReservations ?? 0,
      lastPurchaseAt: stat?.lastPurchaseAt ?? null,
    };
  });
}

/** Últimos lançamentos do extrato, para a tela "como ganhei meu XP". */
export async function xpHistory(userId: string, tenantId: string, take = 20) {
  return prisma.xpEntry.findMany({
    where: { userId, tenantId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      amount: true,
      reason: true,
      description: true,
      createdAt: true,
    },
  });
}
