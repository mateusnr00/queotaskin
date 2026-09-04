// §23/§26 - recuperação determinística do backlog PENDING via choke point.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PaymentProvider } from "@prisma/client";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { reconciliarPagamentosPendentes } from "@/server/services/reconciliacao-pagamentos";
import type { ProviderResolution } from "@/server/services/payment-provider";

function nexus(externalId: string) {
  const resolver = async (): Promise<ProviderResolution> => ({
    ok: true,
    provider: {
      name: "NEXUSPAG" as PaymentProvider, webhookPath: "nexuspag",
      createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
      getStatus: async () => ({ status: "APPROVED", raw: {}, amountBrl: 100, identity: { id: externalId, txid: "t", externalId: "r" } }),
    },
  });
  return { resolverProvider: resolver as never };
}

suiteDeIntegracao("§23/§26 · reconciliador determinístico de backlog", () => {
  let tenantId = "", donoId = "";
  const rifas: string[] = [], reservas: string[] = [];
  beforeAll(async () => {
    if (!integracaoLiberada) return;
    tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });
  afterAll(async () => {
    if (!integracaoLiberada) return;
    await prisma.ticket.deleteMany({ where: { reservationId: { in: reservas } } });
    await prisma.xpEntry.deleteMany({ where: { reservationId: { in: reservas } } }).catch(() => {});
    await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { startsWith: "RECON-" } } });
    await prisma.payment.deleteMany({ where: { reservationId: { in: reservas } } });
    await prisma.reservation.deleteMany({ where: { id: { in: reservas } } });
    await prisma.raffle.deleteMany({ where: { id: { in: rifas } } });
  });

  async function pendenteAntiga(minutosAtras: number) {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `RC ${sx}`, slug: `rc-${sx}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true }, totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    rifas.push(raffle.id);
    const r = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "x", totalAmount: 100, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    reservas.push(r.id);
    const externalId = `RECON-${r.id}`;
    const criadoEm = new Date(Date.now() - minutosAtras * 60_000);
    await prisma.payment.create({ data: { reservationId: r.id, provider: "NEXUSPAG", externalId, status: "PENDING", amount: 100, method: "PIX", createdAt: criadoEm } });
    return { reservationId: r.id, externalId };
  }

  it("varre PENDING e aprova via gateway (determinístico, sem depender de webhook)", async () => {
    const a = await pendenteAntiga(30);
    const res = await reconciliarPagamentosPendentes({ idadeMinimaMinutos: 5, limite: 100 }, nexus(a.externalId));
    expect(res.verificados).toBeGreaterThanOrEqual(1);
    const pg = await prisma.payment.findFirst({ where: { externalId: a.externalId }, select: { status: true } });
    expect(pg?.status).toBe("APPROVED");
    const rr = await prisma.reservation.findUnique({ where: { id: a.reservationId }, select: { status: true } });
    expect(rr?.status).toBe("PAID");
  });

  it("respeita a janela de idade: pagamento jovem demais é ignorado", async () => {
    const nova = await pendenteAntiga(1); // 1 min atrás
    await reconciliarPagamentosPendentes({ idadeMinimaMinutos: 10, limite: 100 }, nexus(nova.externalId));
    const pg = await prisma.payment.findFirst({ where: { externalId: nova.externalId }, select: { status: true } });
    expect(pg?.status).toBe("PENDING"); // não tocado
  });

  it("respeita o teto (limite) por passada", async () => {
    await pendenteAntiga(30); await pendenteAntiga(30);
    const res = await reconciliarPagamentosPendentes({ idadeMinimaMinutos: 5, limite: 1 }, nexus("qualquer"));
    expect(res.verificados).toBe(1);
  });
});
