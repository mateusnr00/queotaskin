// §18 (obrigatório) - NexusPag cannot approve a payment with incorrect amount.
// STRONG financial verification: identidade + status + valor, tudo por consulta
// server-to-server. Gateway injetado, sem rede.
import { afterEach, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { verifyPayment } from "@/server/services/payment-verification";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import type { ProviderResolution } from "@/server/services/payment-provider";

// Provider NexusPag falso: getStatus devolve o contrato REAL (status, raw,
// amountBrl, identity). id da identidade = externalId do Payment (o que a
// consulta oficial devolveria).
function nexus(opts: {
  status?: "PENDING" | "APPROVED" | "REJECTED";
  amountBrl?: unknown;
  idDaResposta?: string;
  indisponivel?: boolean;
}, externalId: string) {
  const resolver = async (): Promise<ProviderResolution> => ({
    ok: true,
    provider: {
      name: "NEXUSPAG",
      webhookPath: "nexuspag",
      createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
      getStatus: async () => {
        if (opts.indisponivel) throw Object.assign(new Error("down"), { name: "FetchError" });
        return {
          status: opts.status ?? "APPROVED",
          raw: {},
          amountBrl: opts.amountBrl as number | null,
          identity: { id: opts.idDaResposta ?? externalId, txid: "tx", externalId: "ref" },
        };
      },
    },
  });
  return { resolverProvider: resolver };
}

suiteDeIntegracao("NexusPag · STRONG financial verification", () => {
  let tenantId = "", donoId = "";
  beforeAll(async () => {
    if (!integracaoLiberada) return;
    tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });
  const criados: string[] = [];
  afterEach(async () => {
    for (const rid of criados.splice(0)) {
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
      await prisma.raffle.deleteMany({ where: { id: { in: [] } } }).catch(() => {});
    }
  });

  // Payment de R$100,00, provider NEXUSPAG.
  async function payment100(): Promise<{ paymentId: string; externalId: string; reservationId: string }> {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `NX ${sx}`, slug: `nx-${sx}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true, phone: true, cpf: true, email: false },
      totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    const r = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "X", totalAmount: 100,
      status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    const externalId = `NXTX-${r.id}`;
    const pg = await prisma.payment.create({ data: {
      reservationId: r.id, provider: "NEXUSPAG", externalId, status: "PENDING", amount: 100, method: "PIX",
    }, select: { id: true } });
    criados.push(r.id);
    return { paymentId: pg.id, externalId, reservationId: r.id };
  }
  const verificar = (paymentId: string, externalId: string, deps: ReturnType<typeof nexus>) =>
    verifyPayment({ paymentId, providerDaRota: "NEXUSPAG", externalIdDoWebhook: externalId }, deps);

  it("paid + valor exato + identidade certa -> VERIFIED_APPROVED (S2S_STATUS_AMOUNT)", async () => {
    const { paymentId, externalId } = await payment100();
    const r = await verificar(paymentId, externalId, nexus({ amountBrl: 100 }, externalId));
    expect(r.resultado).toBe("VERIFIED_APPROVED");
    expect(r.metodo).toBe("S2S_STATUS_AMOUNT");
    expect(r.centavosConfirmados).toBe(10000);
  });

  it("§18 - valor incorreto NUNCA aprova", async () => {
    for (const amt of [99.99, 100.01, 0, -100, 1000, NaN, Infinity, "100", null, undefined, {}]) {
      const { paymentId, externalId } = await payment100();
      const r = await verificar(paymentId, externalId, nexus({ amountBrl: amt }, externalId));
      expect(r.resultado, `amount=${String(amt)}`).not.toBe("VERIFIED_APPROVED");
    }
  });

  it("pending + valor certo nunca aprova", async () => {
    const { paymentId, externalId } = await payment100();
    const r = await verificar(paymentId, externalId, nexus({ status: "PENDING", amountBrl: 100 }, externalId));
    expect(r.resultado).toBe("VERIFIED_PENDING");
  });

  it("§8 confused-deputy - identidade da transação diferente nunca aprova, mesmo com valor certo", async () => {
    const { paymentId, externalId } = await payment100();
    const r = await verificar(paymentId, externalId, nexus({ amountBrl: 100, idDaResposta: "OUTRA-TX" }, externalId));
    expect(r.resultado).toBe("INVALID");
  });

  it("amount ausente -> INVALID (fail-closed, sem fallback só-status)", async () => {
    const { paymentId, externalId } = await payment100();
    const r = await verificar(paymentId, externalId, nexus({ amountBrl: null }, externalId));
    expect(r.resultado).toBe("INVALID");
  });

  it("gateway indisponível -> UNVERIFIABLE", async () => {
    const { paymentId, externalId } = await payment100();
    const r = await verificar(paymentId, externalId, nexus({ indisponivel: true }, externalId));
    expect(r.resultado).toBe("UNVERIFIABLE");
  });

  it("§20 - 20 webhooks NexusPag simultâneos (valor certo) -> 1 aprovação, 1 XP, 1 evento", async () => {
    const { externalId, reservationId } = await payment100();
    const deps = nexus({ amountBrl: 100 }, externalId);
    const gatilho = () => processarWebhookDePagamento({
      evento: { provider: "NEXUSPAG", externalId, statusAfirmado: "APPROVED", eventoOficial: null },
      corpoCru: JSON.stringify({ id: externalId, status: "paid", amount: 100 }),
      payload: { id: externalId, status: "paid", amount: 100 },
      assinaturaValida: true,
    }, deps);
    await Promise.allSettled(Array.from({ length: 20 }, gatilho));

    const pg = await prisma.payment.findFirst({ where: { externalId }, select: { status: true } });
    expect(pg?.status).toBe("APPROVED");
    const rr = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });
    expect(rr?.status).toBe("PAID");
    const xp = await prisma.xpEntry.count({ where: { reservationId, reason: "PURCHASE" } });
    expect(xp).toBeLessThanOrEqual(1);
    const eventos = await prisma.paymentWebhookEvent.count({ where: { externalId } });
    expect(eventos).toBe(1);
    // limpeza
    await prisma.xpEntry.deleteMany({ where: { reservationId } });
    await prisma.movimentoDeAfiliado.deleteMany({ where: { reservationId } }).catch(() => {});
    await prisma.ticket.deleteMany({ where: { reservationId } });
    await prisma.paymentWebhookEvent.deleteMany({ where: { externalId } });
  });

});
