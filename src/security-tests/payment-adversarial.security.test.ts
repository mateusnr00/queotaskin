// FASE 4.5 - testes ADVERSARIAIS: tentam QUEBRAR o P0.
import { afterEach, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import { chaveDeEvento } from "@/lib/pagamentos/idempotencia";
import type { ProviderResolution } from "@/server/services/payment-provider";

function fakeProvider(status: "PENDING" | "APPROVED" | "REJECTED", opts: { valor?: number | null } = {}) {
  const resolver = async (): Promise<ProviderResolution> => ({
    ok: true,
    provider: {
      name: "SYNCPAY", webhookPath: "syncpay",
      createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
      getStatus: async () => ({ status, raw: opts.valor != null ? { amount: opts.valor } : {} }),
    },
  });
  return { resolverProvider: resolver, extrairValor: opts.valor !== undefined ? () => opts.valor ?? null : () => null };
}

suiteDeIntegracao("ADVERSARIAL · quebrar o P0", () => {
  let tenantId = "", donoId = "";
  beforeAll(async () => {
    if (!integracaoLiberada) return;
    tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });
  const criados: string[] = [];
  afterEach(async () => {
    for (const rid of criados.splice(0)) {
      await prisma.xpEntry.deleteMany({ where: { reservationId: rid } });
      await prisma.movimentoDeAfiliado.deleteMany({ where: { reservationId: rid } }).catch(() => {});
      await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { startsWith: `ADV-${rid}` } } });
      await prisma.ticket.deleteMany({ where: { reservationId: rid } });
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
    }
  });
  async function cenario(amount = 50) {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `ADV ${sx}`, slug: `adv-${sx}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true, phone: true, cpf: true, email: false },
      totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    const reserva = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "Alvo", totalAmount: amount,
      status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    const externalId = `ADV-${reserva.id}`;
    await prisma.payment.create({ data: {
      reservationId: reserva.id, provider: "SYNCPAY", externalId, status: "PENDING", amount, method: "PIX",
    }});
    criados.push(reserva.id);
    return { reservationId: reserva.id, externalId };
  }
  const forjar = (externalId: string, status = "APPROVED") => ({
    evento: { provider: "SYNCPAY" as const, externalId, statusAfirmado: status, eventoOficial: null },
    corpoCru: JSON.stringify({ idTransaction: externalId, status: "paid" }),
    payload: { idTransaction: externalId, status: "paid" },
    assinaturaValida: null,
  });
  const st = async (rid: string, ext: string) => ({
    reserva: (await prisma.reservation.findUnique({ where: { id: rid }, select: { status: true } }))?.status,
    pagamento: (await prisma.payment.findFirst({ where: { externalId: ext }, select: { status: true } }))?.status,
  });

  // §7 - CRASH RECOVERY: evento logado, processo morre, gateway reenvia.
  it("idempotency-crash-recovery: evento logado sem processar NÃO prende o pagamento", async () => {
    const { reservationId, externalId } = await cenario();
    // Simula "primeira entrega logou o evento e morreu antes de aprovar":
    // grava a linha de evento à mão, com a MESMA chave canônica.
    const chave = chaveDeEvento({ provider: "SYNCPAY", transacao: externalId, status: "APPROVED" });
    await prisma.paymentWebhookEvent.create({ data: {
      provider: "SYNCPAY", externalId, providerEventId: chave, payload: {},
    }});
    expect((await st(reservationId, externalId)).pagamento).toBe("PENDING"); // não aprovou ainda

    // Gateway REENVIA o mesmo evento; agora o gateway confirma de verdade.
    const r = await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 50 }));
    // ESPERADO: o retry conclui. Se vier JA_PROCESSADO com pagamento PENDING, o dinheiro ficou preso.
    expect((await st(reservationId, externalId)).pagamento, `desfecho=${r.desfecho}`).toBe("APPROVED");
  });

  // §5/§15 - CONFUSED DEPUTY: confirmação de uma transação não aprova outra.
  it("confirmar a transação Y não aprova o Payment X", async () => {
    const a = await cenario(10);   // Payment A = R$ 10
    const b = await cenario(1000); // Payment B = R$ 1.000
    // Webhook chega com o externalId de B (que o gateway confirma), mas o
    // atacante quer aprovar A. O handler resolve o Payment PELO externalId do
    // webhook (B), então A jamais é tocado.
    await processarWebhookDePagamento(forjar(b.externalId), fakeProvider("APPROVED", { valor: 1000 }));
    expect((await st(a.reservationId, a.externalId)).pagamento).toBe("PENDING"); // A intacto
    expect((await st(b.reservationId, b.externalId)).pagamento).toBe("APPROVED"); // só B
  });

  it("provider trocado: webhook diz SYNCPAY para um Payment de outro provider → não aprova", async () => {
    const { reservationId, externalId } = await cenario();
    await prisma.payment.update({ where: { externalId }, data: { provider: "HORSEPAY" } });
    const r = await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 50 }));
    expect(r.verificacao).toBe("INVALID"); // provider da rota != provider do Payment
    expect((await st(reservationId, externalId)).pagamento).toBe("PENDING");
  });

  // §3G - só status explicitamente APPROVED aprova. PENDING/lixo não.
  it("gateway devolvendo status não-aprovado nunca vira APPROVED", async () => {
    for (const s of ["PENDING", "REJECTED"] as const) {
      const { reservationId, externalId } = await cenario();
      await processarWebhookDePagamento(forjar(externalId), fakeProvider(s));
      // O critério de segurança é: NUNCA vira APPROVED. PENDING fica PENDING;
      // REJECTED vira REJECTED (não-aprovação legítima).
      expect((await st(reservationId, externalId)).pagamento).not.toBe("APPROVED");
    }
  });

  // §6 - valor: divergência (inclusive centavo, negativo, zero, gigante) bloqueia.
  it("valor divergente do gateway em qualquer forma bloqueia", async () => {
    for (const v of [49.99, 50.01, 0, -1, 5000, Number.NaN]) {
      const { reservationId, externalId } = await cenario(50);
      await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: v }));
      const e = await st(reservationId, externalId);
      expect(e.pagamento, `valor ${v} não podia aprovar`).toBe("PENDING");
    }
  });
  it("valor exatamente igual aprova (centavos, sem float solto)", async () => {
    const { reservationId, externalId } = await cenario(50);
    await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 50 }));
    expect((await st(reservationId, externalId)).pagamento).toBe("APPROVED");
  });

  // §10 - corrida MISTA: APPROVED e PENDING juntos. Nunca regride.
  it("corrida de 10 APPROVED + 10 PENDING simultâneos termina APPROVED", async () => {
    const { reservationId, externalId } = await cenario(50);
    const chamadas = [
      ...Array.from({ length: 10 }, () => processarWebhookDePagamento(forjar(externalId, "APPROVED"), fakeProvider("APPROVED", { valor: 50 }))),
      ...Array.from({ length: 10 }, () => processarWebhookDePagamento(forjar(externalId, "PENDING"), fakeProvider("PENDING"))),
    ];
    await Promise.allSettled(chamadas);
    expect((await st(reservationId, externalId)).pagamento).toBe("APPROVED"); // não regrediu
    const xp = await prisma.xpEntry.count({ where: { reservationId, reason: "PURCHASE" } });
    expect(xp).toBeLessThanOrEqual(1);
  });


  // §12 - reserva expirada + número revendido: A NÃO toma o número de B, e
  // nunca existem dois tickets com o mesmo número.
  it("expirada+revendida: pagamento tardio de A não duplica cota nem toma a de B", async () => {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `EXP ${sx}`, slug: `exp-${sx}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true, phone: true, cpf: true, email: false },
      totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    // A reserva/tem o 777... a rifa tem 100 números, uso o 7.
    const NUM = 7;
    const ra = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "A", totalAmount: 10,
      status: "EXPIRED", expiresAt: new Date(Date.now() - 1000),
    }, select: { id: true } });
    const extA = `ADV-${ra.id}`;
    await prisma.payment.create({ data: { reservationId: ra.id, provider: "SYNCPAY", externalId: extA, status: "PENDING", amount: 10, method: "PIX" } });
    // B comprou e tem o número 7 (PAID).
    const rb = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "B", totalAmount: 10, status: "PAID", paidAt: new Date(), expiresAt: new Date(Date.now() + 3600000),
    }, select: { id: true } });
    await prisma.ticket.create({ data: { raffleId: raffle.id, number: NUM, status: "PAID", reservationId: rb.id, paidAt: new Date() } });
    criados.push(ra.id, rb.id);

    // Gateway confirma o PIX de A DEPOIS da expiração.
    await processarWebhookDePagamento(forjar(extA), fakeProvider("APPROVED", { valor: 10 }));

    // Invariantes obrigatórios:
    const doNumero7 = await prisma.ticket.count({ where: { raffleId: raffle.id, number: NUM } });
    expect(doNumero7).toBe(1); // nunca dois tickets com o mesmo número
    const de7 = await prisma.ticket.findFirst({ where: { raffleId: raffle.id, number: NUM }, select: { reservationId: true } });
    expect(de7?.reservationId).toBe(rb.id); // B mantém o 7
    // Limpeza extra desta rifa
    await prisma.ticket.deleteMany({ where: { raffleId: raffle.id } });
    await prisma.payment.deleteMany({ where: { reservationId: { in: [ra.id, rb.id] } } });
    await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: extA } });
    await prisma.raffle.deleteMany({ where: { id: raffle.id } }).catch(() => {});
  });

});
