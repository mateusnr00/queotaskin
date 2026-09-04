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
import { integracaoLiberada } from "@/test/integration-setup";

const __suiteIntegra = integracaoLiberada ? describe : describe.skip;
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


__suiteIntegra("serviço de XP (integração)", () => {
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

    // Ordenado, e não "a primeira que vier". Sem ordem explícita o Postgres
    // devolve qualquer linha, e outro arquivo de teste rodando em paralelo
    // (o do sorteio ao vivo cria e apaga campanhas) podia entregar uma
    // campanha que sumia no meio desta suíte. A mais antiga é a do seed.
    const raffle = await prisma.raffle.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
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

  // R$ 150 rende 1.500 de base e entra na faixa "relevante", que soma 10%.
  // O bônus por faixa de compra é interno: existe no cálculo, nunca na tela.
  it("credita a base mais o bônus da faixa da compra", async () => {
    const id = await paidReservation(150);
    const result = await awardXpForReservation(id);

    expect(result?.credited).toBe(true);
    expect(result?.amount).toBe(1650);
    expect(await getUserXp(userId, tenantId)).toBe(1650);

    // A decomposição fica gravada: é ela que o extrato mostra, e é o que
    // impede uma mudança de regra de reescrever o que já foi creditado.
    const lancamento = await prisma.xpEntry.findFirst({
      where: { reservationId: id, reason: "PURCHASE" },
      select: { baseXp: true, bonusXp: true, multiplier: true },
    });
    expect(lancamento?.baseXp).toBe(1500);
    expect(lancamento?.bonusXp).toBe(150);
    expect(Number(lancamento?.multiplier)).toBeCloseTo(1.1, 5);
  });

  // Compra pequena não ganha faixa: dez por real e nada mais.
  it("compra abaixo da primeira faixa recebe só a base", async () => {
    const antes = await getUserXp(userId, tenantId);
    const id = await paidReservation(10);
    const result = await awardXpForReservation(id);

    expect(result?.amount).toBe(100);
    expect(await getUserXp(userId, tenantId)).toBe(antes + 100);
  });

  it("o gasto acumulado sobe junto, para o GOAT poder exigi-lo", async () => {
    const antes = await prisma.userProgress.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { totalSpent: true },
    });
    const id = await paidReservation(40);
    await awardXpForReservation(id);
    const depois = await prisma.userProgress.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { totalSpent: true },
    });
    expect(Number(depois?.totalSpent ?? 0) - Number(antes?.totalSpent ?? 0)).toBe(40);
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
    expect(await getUserXp(userId, tenantId)).toBe(before + 1100);
  });

  it("não perde crédito com pagamentos simultâneos do mesmo usuário", async () => {
    const before = await getUserXp(userId, tenantId);

    // Dez reservas de R$ 10 creditadas ao mesmo tempo. Sem o advisory lock,
    // várias leem o mesmo total antigo e o último escritor apaga os demais.
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => paidReservation(10)),
    );
    const results = await Promise.all(ids.map((id) => awardXpForReservation(id)));

    // A soma dos creditados, e não um número fixo: o que este teste prova é
    // que nenhum crédito se perde, e o valor de cada um pode variar conforme
    // o boost sobe durante a própria execução.
    const creditado = results.reduce((soma, r) => soma + (r?.amount ?? 0), 0);
    expect(results.every((r) => r?.credited)).toBe(true);
    expect(creditado).toBeGreaterThanOrEqual(10 * 100);
    expect(await getUserXp(userId, tenantId)).toBe(before + creditado);
  });

  it("a mesma reserva creditada em paralelo entra uma vez só", async () => {
    const before = await getUserXp(userId, tenantId);
    const id = await paidReservation(50);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => awardXpForReservation(id)),
    );

    expect(results.filter((r) => r?.credited).length).toBe(1);
    expect(await getUserXp(userId, tenantId)).toBe(before + 550);
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
    const gastoAntes = await prisma.userProgress.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { totalSpent: true },
    });

    const id = await paidReservation(200);
    // O valor creditado depende do boost e da faixa da compra, então o teste
    // usa o que foi de fato creditado: o que ele prova é que o estorno desfaz
    // exatamente aquilo, e não um número escolhido a mão.
    const credito = await awardXpForReservation(id);
    expect(await getUserXp(userId, tenantId)).toBe(before + credito!.amount);

    const first = await reverseXpForReservation(id);
    const second = await reverseXpForReservation(id);

    expect(first?.credited).toBe(true);
    expect(first?.amount).toBe(-credito!.amount);
    expect(second?.credited).toBe(false);
    expect(await getUserXp(userId, tenantId)).toBe(before);

    // O gasto volta junto: compra estornada não pode continuar contando para
    // o GOAT, que é o único degrau que exige gasto.
    const gastoDepois = await prisma.userProgress.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { totalSpent: true },
    });
    expect(Number(gastoDepois?.totalSpent ?? 0)).toBeCloseTo(
      Number(gastoAntes?.totalSpent ?? 0),
      2,
    );

    // O lançamento original continua no extrato: o estorno é uma linha nova.
    const compra = await prisma.xpEntry.findFirst({
      where: { reservationId: id, reason: "PURCHASE" },
    });
    expect(compra).not.toBeNull();
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
  // ------------------------------------------------ a régua do painel

  describe("a régua de XP do painel manda no crédito", () => {
    // Cada caso devolve a régua ao padrão: as outras suítes deste arquivo
    // contam com 10, e teste que deixa configuração pendurada quebra vizinho.
    async function comRegua<T>(valor: number, corpo: () => Promise<T>): Promise<T> {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { xpPerBrl: valor },
      });
      try {
        return await corpo();
      } finally {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { xpPerBrl: 10 },
        });
      }
    }

    it("régua 10 credita 1.000 XP por R$ 100, como sempre creditou", async () => {
      await comRegua(10, async () => {
        const id = await paidReservation(100);
        const r = await awardXpForReservation(id);
        // R$ 100 cai na faixa "compra relevante", que soma 10%: a régua
        // manda na BASE, e os multiplicadores de sempre agem sobre ela.
        expect(r?.amount).toBe(1_100);
        const l = await prisma.xpEntry.findFirst({
          where: { reservationId: id, reason: "PURCHASE" },
          select: { baseXp: true, metadata: true },
        });
        expect(l?.baseXp).toBe(1_000);
        expect((l?.metadata as { xpPerBrlUsed?: number })?.xpPerBrlUsed).toBe(10);
      });
    });

    it("régua 12 credita 1.200 XP pelos mesmos R$ 100", async () => {
      await comRegua(12, async () => {
        const id = await paidReservation(100);
        const r = await awardXpForReservation(id);
        // 1.200 de base, e os mesmos 10% da faixa por cima.
        expect(r?.amount).toBe(1_320);
        const l = await prisma.xpEntry.findFirst({
          where: { reservationId: id, reason: "PURCHASE" },
          select: { baseXp: true, metadata: true },
        });
        expect(l?.baseXp).toBe(1_200);
        expect((l?.metadata as { xpPerBrlUsed?: number })?.xpPerBrlUsed).toBe(12);
      });
    });

    // O ponto que faz a auditoria valer: mudar a régua não reescreve nada.
    it("mudar a régua depois não mexe no que já foi creditado", async () => {
      const id = await comRegua(10, async () => {
        const r = await paidReservation(100);
        await awardXpForReservation(r);
        return r;
      });

      const antes = await prisma.xpEntry.findFirst({
        where: { reservationId: id, reason: "PURCHASE" },
        select: { baseXp: true, amount: true, metadata: true },
      });

      await comRegua(12, async () => {
        // Uma compra nova na régua nova, para provar que a troca valeu.
        const nova = await paidReservation(100);
        const r = await awardXpForReservation(nova);
        expect(r?.amount).toBe(1_320);
      });

      const depois = await prisma.xpEntry.findFirst({
        where: { reservationId: id, reason: "PURCHASE" },
        select: { baseXp: true, amount: true, metadata: true },
      });
      expect(depois).toEqual(antes);
      expect((depois?.metadata as { xpPerBrlUsed?: number })?.xpPerBrlUsed).toBe(10);
    });

    it("a idempotência continua de pé com a régua trocada no meio", async () => {
      const id = await comRegua(12, async () => {
        const r = await paidReservation(100);
        expect((await awardXpForReservation(r))?.amount).toBe(1_320);
        return r;
      });

      // Segunda chamada, régua já de volta em 10: nada de novo é creditado, e
      // o lançamento original continua com a régua dele.
      const total = await getUserXp(userId, tenantId);
      const repetida = await awardXpForReservation(id);
      expect(repetida?.credited).toBe(false);
      expect(await getUserXp(userId, tenantId)).toBe(total);

      const lancamentos = await prisma.xpEntry.count({
        where: { reservationId: id, reason: "PURCHASE" },
      });
      expect(lancamentos).toBe(1);
    });

    it("régua estragada no banco não estraga o crédito", async () => {
      // A coluna é inteira e a action recusa zero, mas o crédito não confia
      // nisso: banco tocado à mão é o caso que sobra.
      await comRegua(0, async () => {
        const id = await paidReservation(100);
        const r = await awardXpForReservation(id);
        expect(r?.amount).toBe(1_100);
        const l = await prisma.xpEntry.findFirst({
          where: { reservationId: id, reason: "PURCHASE" },
          select: { baseXp: true, metadata: true },
        });
        expect(l?.baseXp).toBe(1_000);
        expect((l?.metadata as { xpPerBrlUsed?: number })?.xpPerBrlUsed).toBe(10);
      });
    });
  });

});
