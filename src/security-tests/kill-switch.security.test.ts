// §30 - kill switch: NexusPag pago + valor certo + kill switch ativo NÃO
// autoaprova; o pagamento fica recuperável (PENDING), nunca vira legado.
import { afterEach, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import type { ProviderResolution } from "@/server/services/payment-provider";
import { tierDoProvider } from "@/lib/pagamentos/tier";

function nexusOk(externalId: string) {
  const resolver = async (): Promise<ProviderResolution> => ({
    ok: true,
    provider: {
      name: "NEXUSPAG", webhookPath: "nexuspag",
      createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
      getStatus: async () => ({ status: "APPROVED", raw: {}, amountBrl: 100, identity: { id: externalId, txid: "t", externalId: "r" } }),
    },
  });
  return { resolverProvider: resolver };
}

suiteDeIntegracao("§29/§30 · kill switch de aprovação automática", () => {
  let tenantId = "", donoId = "";
  beforeAll(async () => {
    if (!integracaoLiberada) return;
    tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });
  const criados: string[] = [];
  afterEach(async () => {
    delete process.env.PAYMENTS_AUTO_APPROVAL_DISABLED;
    for (const rid of criados.splice(0)) {
      await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { startsWith: `KILL-${rid}` } } });
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
    }
  });
  async function cenario() {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `KS ${sx}`, slug: `ks-${sx}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true, phone: true, cpf: true, email: false },
      totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    const r = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "X", totalAmount: 100, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    const externalId = `KILL-${r.id}`;
    await prisma.payment.create({ data: { reservationId: r.id, provider: "NEXUSPAG", externalId, status: "PENDING", amount: 100, method: "PIX" } });
    criados.push(r.id);
    return { reservationId: r.id, externalId };
  }
  const gatilho = (externalId: string) => processarWebhookDePagamento({
    evento: { provider: "NEXUSPAG", externalId, statusAfirmado: "APPROVED", eventoOficial: null },
    corpoCru: "", payload: {}, assinaturaValida: true,
  }, nexusOk(externalId));

  it("o tier classifica NexusPag como STRONG e os outros como STATUS_ONLY", () => {
    expect(tierDoProvider("NEXUSPAG")).toBe("STRONG");
    expect(tierDoProvider("SYNCPAY")).toBe("STATUS_ONLY");
    expect(tierDoProvider("HORSEPAY")).toBe("STATUS_ONLY");
    expect(tierDoProvider("SIGILOPAY")).toBe("STATUS_ONLY");
    expect(tierDoProvider("DESCONHECIDO")).toBe("DISABLED");
  });

  it("kill switch ATIVO: gateway confirma mas NÃO autoaprova (fica PENDING)", async () => {
    process.env.PAYMENTS_AUTO_APPROVAL_DISABLED = "true";
    const { reservationId, externalId } = await cenario();
    const r = await gatilho(externalId);
    expect(r.desfecho).toBe("PENDENTE");
    const pg = await prisma.payment.findFirst({ where: { externalId }, select: { status: true } });
    expect(pg?.status).toBe("PENDING"); // recuperável, não perdido
    const rr = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });
    expect(rr?.status).toBe("PENDING");
  });

  it("kill switch DESLIGADO: aprova normalmente", async () => {
    const { externalId } = await cenario();
    const r = await gatilho(externalId);
    expect(r.desfecho).toBe("APROVADO");
    await prisma.xpEntry.deleteMany({ where: { reservationId: { in: criados } } });
    await prisma.movimentoDeAfiliado.deleteMany({ where: { reservationId: { in: criados } } }).catch(() => {});
    await prisma.ticket.deleteMany({ where: { reservationId: { in: criados } } });
  });
});
