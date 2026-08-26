// Teste de integração do serviço de XP contra um Postgres real.
//
// A lógica pura da curva está em src/lib/rank.test.ts. Aqui testamos o que só
// aparece com banco de verdade: idempotência do índice único e a corrida de
// dois pagamentos simultâneos do mesmo usuário, o bug que o advisory lock
// existe para fechar.
//
// Pulado quando não há DATABASE_URL apontando para um Postgres acessível.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  adjustXp,
  awardXpForReservation,
  getUserXp,
  reverseXpForReservation,
} from "@/server/services/xp";

/**
 * Só roda contra um Postgres LOCAL. O teste cria usuários e reservas de
 * verdade; apontar DATABASE_URL para produção e rodar `npm test` encheria o
 * banco real de lixo. Para forçar em outro host, exporte
 * XP_INTEGRATION_ALLOW_REMOTE=1 conscientemente.
 */
function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  if (process.env.XP_INTEGRATION_ALLOW_REMOTE === "1") return true;
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

const suite = isLocalDatabase() ? describe : describe.skip;

suite("serviço de XP (integração)", () => {
  let tenantId: string;
  let raffleId: string;
  let userId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) throw new Error("Rode `npm run db:seed` antes deste teste.");
    tenantId = tenant.id;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { rankEnabled: true, xpPerBrl: 10 },
    });

    const raffle = await prisma.raffle.findFirst({
      where: { tenantId },
      select: { id: true },
    });
    if (!raffle) throw new Error("Nenhuma campanha no tenant de teste.");
    raffleId = raffle.id;

    const user = await prisma.user.create({
      data: {
        name: "Usuario Teste XP",
        phone: `1190000${Math.floor(Math.random() * 9000 + 1000)}`,
        role: "PARTICIPANT",
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  async function paidReservation(amount: number): Promise<string> {
    const reservation = await prisma.reservation.create({
      data: {
        raffleId,
        userId,
        participantName: "Usuario Teste XP",
        totalAmount: amount,
        status: "PAID",
        paidAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });
    return reservation.id;
  }

  it("credita 10 XP por real de uma reserva paga", async () => {
    const id = await paidReservation(150);
    const result = await awardXpForReservation(id);

    expect(result?.credited).toBe(true);
    expect(result?.amount).toBe(1500);
    expect(await getUserXp(userId, tenantId)).toBe(1500);
  });

  it("é idempotente: reentrega do webhook não credita de novo", async () => {
    const before = await getUserXp(userId, tenantId);
    const id = await paidReservation(100);

    const first = await awardXpForReservation(id);
    const second = await awardXpForReservation(id);
    const third = await awardXpForReservation(id);

    expect(first?.credited).toBe(true);
    expect(second?.credited).toBe(false);
    expect(third?.credited).toBe(false);
    expect(await getUserXp(userId, tenantId)).toBe(before + 1000);
  });

  it("não perde crédito com pagamentos simultâneos do mesmo usuário", async () => {
    const before = await getUserXp(userId, tenantId);

    // Dez reservas de R$ 10 creditadas ao mesmo tempo. Sem o advisory lock,
    // várias leem o mesmo total antigo e o último escritor apaga os demais.
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => paidReservation(10)),
    );
    const results = await Promise.all(ids.map((id) => awardXpForReservation(id)));

    expect(results.every((r) => r?.credited)).toBe(true);
    expect(await getUserXp(userId, tenantId)).toBe(before + 10 * 100);
  });

  it("a mesma reserva creditada em paralelo entra uma vez só", async () => {
    const before = await getUserXp(userId, tenantId);
    const id = await paidReservation(50);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => awardXpForReservation(id)),
    );

    expect(results.filter((r) => r?.credited).length).toBe(1);
    expect(await getUserXp(userId, tenantId)).toBe(before + 500);
  });

  it("ignora reserva não paga e reserva de convidado", async () => {
    const pending = await prisma.reservation.create({
      data: {
        raffleId,
        userId,
        participantName: "Usuario Teste XP",
        totalAmount: 90,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });
    const guest = await prisma.reservation.create({
      data: {
        raffleId,
        userId: null,
        participantName: "Convidado",
        totalAmount: 90,
        status: "PAID",
        paidAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });

    expect(await awardXpForReservation(pending.id)).toBeNull();
    expect(await awardXpForReservation(guest.id)).toBeNull();
  });

  it("estorna o XP da compra e não estorna duas vezes", async () => {
    const before = await getUserXp(userId, tenantId);
    const id = await paidReservation(200);
    await awardXpForReservation(id);
    expect(await getUserXp(userId, tenantId)).toBe(before + 2000);

    const first = await reverseXpForReservation(id);
    const second = await reverseXpForReservation(id);

    expect(first?.credited).toBe(true);
    expect(first?.amount).toBe(-2000);
    expect(second?.credited).toBe(false);
    expect(await getUserXp(userId, tenantId)).toBe(before);
  });

  it("ajuste manual soma e nunca deixa o total negativo", async () => {
    const before = await getUserXp(userId, tenantId);

    const bonus = await adjustXp({
      userId,
      tenantId,
      amount: 500,
      description: "Bônus de teste",
      reason: "BONUS",
    });
    expect(bonus.totalXp).toBe(before + 500);

    // Débito maior que o saldo: o rank não pode ficar negativo.
    const huge = await adjustXp({
      userId,
      tenantId,
      amount: -(before + 5_000_000),
      description: "Correção de teste",
    });
    expect(huge.totalXp).toBe(0);
  });

  it("rejeita ajuste de zero", async () => {
    await expect(
      adjustXp({ userId, tenantId, amount: 0, description: "nada" }),
    ).rejects.toThrow();
  });
});
