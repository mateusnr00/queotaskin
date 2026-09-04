// GATE 10G: HorsePay STRONG de ponta a ponta contra Postgres real (via a
// barreira de ambiente). Prova que, com HorsePay agora STRONG, a aprovação
// automática passa pelo mesmo choke point (webhook -> verifyPayment S2S -> FSM)
// e SÓ acontece com status=paid + value(centavos) exato + id == externalId.
// NÃO habilitamos PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL: HorsePay aprova por
// ser STRONG, não por opt-in de STATUS_ONLY.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import type { ProviderResolution } from "@/server/services/payment-provider";

// Provider HorsePay falso: getStatus com a FORMA REAL do STRONG (amountBrl vem
// de `value`, identity.id vem do `id` da consulta). Nada toca rede.
function fakeHorse(
  status: "PENDING" | "APPROVED" | "REJECTED",
  opts: { amountBrl?: number | null; id?: string | null } = {},
): { resolverProvider: () => Promise<ProviderResolution> } {
  return {
    resolverProvider: async () => ({
      ok: true,
      provider: {
        name: "HORSEPAY",
        webhookPath: "horsepay",
        createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
        getStatus: async () => ({
          status,
          raw: {},
          amountBrl: opts.amountBrl === undefined ? null : opts.amountBrl,
          identity: { id: opts.id === undefined ? null : opts.id, txid: null, externalId: null },
        }),
      },
    }),
  };
}

suiteDeIntegracao("GATE 10G · HorsePay STRONG ponta a ponta (DB real)", () => {
  // Sem opt-in de STATUS_ONLY: HorsePay aprova por STRONG ou não aprova.
  beforeAll(() => { delete process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL; });
  afterAll(() => { delete process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL; });

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
      await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { startsWith: "HG-" } } });
      await prisma.ticket.deleteMany({ where: { reservationId: rid } });
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
    }
  });

  // externalId NUMÉRICO (como a HorsePay usa). value R$50 = 5 cotas de R$10.
  async function cenario(): Promise<{ reservationId: string; externalId: string }> {
    const externalId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`; // só dígitos
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `HG ${externalId}`, slug: `hg-${externalId}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true, phone: true, cpf: true, email: false },
      totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    const reserva = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "Alvo", totalAmount: 50,
      status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    await prisma.ticket.createMany({ data: [1, 2, 3, 4, 5].map((n) => ({
      raffleId: raffle.id, number: n, status: "RESERVED" as const, reservationId: reserva.id,
    })) });
    await prisma.payment.create({ data: {
      reservationId: reserva.id, provider: "HORSEPAY", externalId, status: "PENDING", amount: 50, method: "PIX",
    } });
    criados.push(reserva.id);
    return { reservationId: reserva.id, externalId };
  }

  const forjar = (externalId: string) => ({
    evento: { provider: "HORSEPAY" as const, externalId, statusAfirmado: "APPROVED", eventoOficial: null },
    corpoCru: JSON.stringify({ external_id: externalId, status: true }),
    payload: { external_id: externalId, status: true },
    assinaturaValida: true as boolean | null,
  });

  async function estado(reservationId: string, externalId: string) {
    const p = await prisma.payment.findFirst({ where: { externalId }, select: { status: true } });
    const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });
    const ticketsPagos = await prisma.ticket.count({ where: { reservationId, status: "PAID" } });
    return { pagamento: p?.status, reserva: r?.status, ticketsPagos };
  }

  it("1/2/17. paid + value=50 + id==externalId => APPROVED + Reservation PAID + 5 tickets PAID (sem opt-in)", async () => {
    const { reservationId, externalId } = await cenario();
    await processarWebhookDePagamento(forjar(externalId), fakeHorse("APPROVED", { amountBrl: 50, id: externalId }));
    const e = await estado(reservationId, externalId);
    expect(e.pagamento).toBe("APPROVED");
    expect(e.reserva).toBe("PAID");
    expect(e.ticketsPagos).toBe(5);
    // exatamente 1 Payment APPROVED para esta reserva
    expect(await prisma.payment.count({ where: { reservationId, status: "APPROVED" } })).toBe(1);
  });

  it("6/7. underpayment (value=49) e overpayment (value=51) => NÃO aprova, nada entregue", async () => {
    for (const value of [49, 51]) {
      const { reservationId, externalId } = await cenario();
      await processarWebhookDePagamento(forjar(externalId), fakeHorse("APPROVED", { amountBrl: value, id: externalId }));
      const e = await estado(reservationId, externalId);
      expect(e.pagamento, `value ${value}`).toBe("PENDING");
      expect(e.reserva).not.toBe("PAID");
      expect(e.ticketsPagos).toBe(0);
    }
  });

  it("8. id divergente (confused-deputy) => NÃO aprova", async () => {
    const { reservationId, externalId } = await cenario();
    await processarWebhookDePagamento(forjar(externalId), fakeHorse("APPROVED", { amountBrl: 50, id: "999999999" }));
    expect((await estado(reservationId, externalId)).pagamento).toBe("PENDING");
  });

  it("8b. id ausente na consulta => NÃO aprova", async () => {
    const { reservationId, externalId } = await cenario();
    await processarWebhookDePagamento(forjar(externalId), fakeHorse("APPROVED", { amountBrl: 50, id: null }));
    expect((await estado(reservationId, externalId)).pagamento).toBe("PENDING");
  });

  it("9. webhook diz pago mas GET pending => continua PENDING", async () => {
    const { reservationId, externalId } = await cenario();
    await processarWebhookDePagamento(forjar(externalId), fakeHorse("PENDING", { amountBrl: 50, id: externalId }));
    expect((await estado(reservationId, externalId)).pagamento).toBe("PENDING");
  });

  it("14. webhook duplicado (mesma cobrança 2x) => idempotente: 1 APPROVED, 5 tickets (sem duplicar)", async () => {
    const { reservationId, externalId } = await cenario();
    await processarWebhookDePagamento(forjar(externalId), fakeHorse("APPROVED", { amountBrl: 50, id: externalId }));
    await processarWebhookDePagamento(forjar(externalId), fakeHorse("APPROVED", { amountBrl: 50, id: externalId }));
    const e = await estado(reservationId, externalId);
    expect(e.pagamento).toBe("APPROVED");
    expect(e.ticketsPagos).toBe(5); // não duplicou
    expect(await prisma.payment.count({ where: { reservationId, status: "APPROVED" } })).toBe(1);
  });
});
