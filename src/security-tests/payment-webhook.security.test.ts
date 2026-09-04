// F-01 — PROVA FINANCEIRA: nenhum corpo de webhook controlado pelo atacante
// cria, sozinho, um Payment APPROVED. Sempre pela barreira de ambiente.
//
// O gateway é injetado por `deps.resolverProvider`: nenhum teste toca rede.
// "Webhook diz paid" + "gateway diz pending/erro/inexistente" => NÃO aprova.

import { afterEach, beforeAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import type { ProviderResolution } from "@/server/services/payment-provider";

// Provider falso cujo getStatus/valor nós controlamos, com a forma real.
function fakeProvider(status: "PENDING" | "APPROVED" | "REJECTED", opts: { indisponivel?: boolean; valor?: number | null } = {}) {
  const resolver = async (): Promise<ProviderResolution> => ({
    ok: true,
    provider: {
      name: "SYNCPAY",
      webhookPath: "syncpay",
      createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
      getStatus: async () => {
        if (opts.indisponivel) throw Object.assign(new Error("down"), { name: "FetchError" });
        return { status, raw: opts.valor != null ? { amount: opts.valor } : {} };
      },
    },
  });
  const extrairValor = opts.valor !== undefined ? () => opts.valor ?? null : () => null;
  return { resolverProvider: resolver, extrairValor };
}

suiteDeIntegracao("F-01 · prova financeira do webhook", () => {
  let tenantId = "", donoId = "";

  beforeAll(async () => {
    if (!integracaoLiberada) return;
    const t = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    tenantId = t.id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });

  const criados: string[] = [];
  afterEach(async () => {
    for (const rid of criados.splice(0)) {
      await prisma.xpEntry.deleteMany({ where: { reservationId: rid } });
      await prisma.movimentoDeAfiliado.deleteMany({ where: { reservationId: rid } }).catch(() => {});
      await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { startsWith: `SEC-${rid}` } } });
      await prisma.ticket.deleteMany({ where: { reservationId: rid } });
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
    }
  });

  async function cenario(): Promise<{ reservationId: string; externalId: string }> {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `SEC ${sx}`, slug: `sec-${sx}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true, phone: true, cpf: true, email: false },
      totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    const reserva = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "Alvo", totalAmount: 50,
      status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    const externalId = `SEC-${reserva.id}`;
    await prisma.payment.create({ data: {
      reservationId: reserva.id, provider: "SYNCPAY", externalId, status: "PENDING", amount: 50, method: "PIX",
    }});
    criados.push(reserva.id);
    return { reservationId: reserva.id, externalId };
  }

  const forjar = (externalId: string) => ({
    evento: { provider: "SYNCPAY" as const, externalId, statusAfirmado: "APPROVED", eventoOficial: null },
    corpoCru: JSON.stringify({ idTransaction: externalId, status: "paid" }),
    payload: { idTransaction: externalId, status: "paid" },
    assinaturaValida: null,
  });

  async function estado(reservationId: string, externalId: string) {
    const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });
    const p = await prisma.payment.findFirst({ where: { externalId }, select: { status: true } });
    const xp = await prisma.xpEntry.count({ where: { reservationId, reason: "PURCHASE" } });
    return { reserva: r?.status, pagamento: p?.status, xp };
  }

  it("TESTE 1 — webhook diz PAID, gateway diz PENDING → NÃO aprova", async () => {
    const { reservationId, externalId } = await cenario();
    const r = await processarWebhookDePagamento(forjar(externalId), fakeProvider("PENDING"));
    expect(r.desfecho).toBe("PENDENTE");
    expect(await estado(reservationId, externalId)).toEqual({ reserva: "PENDING", pagamento: "PENDING", xp: 0 });
  });

  it("TESTE 2 — transação inexistente no gateway (INVALID) → não aprova", async () => {
    const { reservationId, externalId } = await cenario();
    // externalId do webhook diverge do gravado, e é único por execução para o
    // fingerprint determinístico não colidir entre rodadas.
    const fantasma = `SEC-fantasma-${reservationId}`;
    const forjado = forjar(fantasma);
    const r = await processarWebhookDePagamento(forjado, fakeProvider("APPROVED"));
    expect(r.desfecho).toBe("PAGAMENTO_DESCONHECIDO");
    await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: fantasma } });
    expect((await estado(reservationId, externalId)).pagamento).toBe("PENDING");
  });

  it("TESTE 3 — gateway indisponível → NÃO aprova (fail-closed)", async () => {
    const { reservationId, externalId } = await cenario();
    const r = await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { indisponivel: true }));
    expect(r.desfecho).toBe("NAO_APROVADO");
    expect(r.verificacao).toBe("UNVERIFIABLE");
    expect((await estado(reservationId, externalId)).pagamento).toBe("PENDING");
  });

  it("TESTE 4 — gateway confirma APPROVED, valor correto → exatamente uma aprovação", async () => {
    const { reservationId, externalId } = await cenario();
    const r = await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 50 }));
    expect(r.desfecho).toBe("APROVADO");
    const e = await estado(reservationId, externalId);
    expect(e).toMatchObject({ reserva: "PAID", pagamento: "APPROVED" });
    expect(e.xp).toBeLessThanOrEqual(1);
  });

  it("TESTE 5 — gateway expõe valor DIVERGENTE → NÃO aprova (INVALID)", async () => {
    const { reservationId, externalId } = await cenario();
    const r = await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 5 }));
    expect(r.verificacao).toBe("INVALID");
    expect((await estado(reservationId, externalId)).pagamento).toBe("PENDING");
  });

  it("TESTE 10/11 — APPROVED recebe PENDING não regride; APPROVED de novo é no-op", async () => {
    const { reservationId, externalId } = await cenario();
    await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 50 }));
    // agora chega um webhook PENDING
    const pend = await processarWebhookDePagamento(
      { ...forjar(externalId), evento: { provider: "SYNCPAY", externalId, statusAfirmado: "PENDING", eventoOficial: null } },
      fakeProvider("PENDING"),
    );
    expect(["JA_PROCESSADO", "PENDENTE"]).toContain(pend.desfecho);
    expect((await estado(reservationId, externalId)).pagamento).toBe("APPROVED"); // não regrediu
  });

  it("TESTE 7 — 20 webhooks idênticos em série → 1 efeito financeiro", async () => {
    const { reservationId, externalId } = await cenario();
    for (let i = 0; i < 20; i++) {
      await processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 50 }));
    }
    expect((await estado(reservationId, externalId)).xp).toBeLessThanOrEqual(1);
  });

  it("TESTE 8 — 20 webhooks idênticos SIMULTÂNEOS → 1 efeito financeiro", async () => {
    const { reservationId, externalId } = await cenario();
    await Promise.allSettled(
      Array.from({ length: 20 }, () => processarWebhookDePagamento(forjar(externalId), fakeProvider("APPROVED", { valor: 50 }))),
    );
    const e = await estado(reservationId, externalId);
    expect(e.pagamento).toBe("APPROVED");
    expect(e.xp).toBeLessThanOrEqual(1);
    const eventos = await prisma.paymentWebhookEvent.count({ where: { externalId } });
    expect(eventos).toBe(1); // unique por evento: 20 tentativas, 1 linha
  });
});
