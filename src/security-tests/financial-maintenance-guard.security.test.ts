// FASE 4.10 - Financial Maintenance Guard.
//
// Prova que a defesa vive ABAIXO da aplicacao: com a manutencao ativa, NENHUM
// codigo (OLD vulneravel, NEW, webhook, polling, manual) consegue gravar a
// aprovacao financeira; o PostgreSQL recusa a transicao. Independe da versao
// do codigo, do kill switch e do tier.
//
// Isolamento dos suites paralelos: a flag e ligada SEMPRE dentro de uma
// transacao que termina em rollback (tx-scoped). A funcao STABLE do trigger
// enxerga o valor nao-commitado da propria transacao, entao o bloqueio ocorre;
// nenhuma outra conexao ve a flag ligada. O estado commitado fica sempre OFF.
import { execFileSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, expect, it } from "vitest";
import type { PaymentProvider } from "@prisma/client";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";
import type { ProviderResolution } from "@/server/services/payment-provider";

const GUARD = path.resolve(__dirname, "../../prisma/guard");

function psql(file: string) {
  const url = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(GUARD, file)], { stdio: "pipe" });
}

// Provider NexusPag STRONG que confirma identity+status+amount.
function nexusOk(externalId: string): { resolverProvider: typeof import("@/server/services/payment-provider").getProviderForRaffle } {
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

suiteDeIntegracao("FASE 4.10 · Financial Maintenance Guard (defesa no banco)", () => {
  let tenantId = "", donoId = "";
  const criados: string[] = [];
  const rifas: string[] = [];

  beforeAll(async () => {
    if (!integracaoLiberada) return;
    psql("financial-maintenance.install.sql");
    tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (!integracaoLiberada) return;
    for (const rid of criados.splice(0)) {
      await prisma.ticket.deleteMany({ where: { reservationId: rid } });
      await prisma.xpEntry.deleteMany({ where: { reservationId: rid } }).catch(() => {});
      await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { startsWith: `FMG-${rid}` } } });
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
    }
    if (rifas.length) await prisma.raffle.deleteMany({ where: { id: { in: rifas.splice(0) } } });
    psql("financial-maintenance.uninstall.sql");
  });

  async function pendente() {
    const sx = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `FMG ${sx}`, slug: `fmg-${sx}`, status: "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true }, totalNumbers: 100, pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    rifas.push(raffle.id);
    const r = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "x", totalAmount: 100, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    const externalId = `FMG-${r.id}`;
    const p = await prisma.payment.create({ data: { reservationId: r.id, provider: "NEXUSPAG", externalId, status: "PENDING", amount: 100, method: "PIX" }, select: { id: true } });
    criados.push(r.id);
    return { reservationId: r.id, paymentId: p.id, externalId };
  }

  // Liga a flag DENTRO de uma tx e roda o corpo; sempre faz rollback, entao a
  // flag nunca vaza. Retorna a promise para .rejects/.resolves.
  function comManutencao(corpo: (tx: typeof prisma) => Promise<unknown>) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled = true WHERE id = true`);
      await corpo(tx as unknown as typeof prisma);
      throw new Error("__rollback__"); // garante rollback mesmo se o corpo não lançar
    }).catch((e) => { if ((e as Error).message === "__rollback__") return "__ok_rollback__"; throw e; });
  }

  it("§19 escrita vulnerável OLD (UPDATE Payment→APPROVED direto) é RECUSADA com manutenção ON", async () => {
    const { paymentId } = await pendente();
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled = true WHERE id = true`);
      // exatamente o que o handler OLD faz: sem FSM, sem verificação, sem tier
      await tx.$executeRawUnsafe(`UPDATE "Payment" SET status='APPROVED', "paidAt"=now() WHERE id=$1`, paymentId);
    })).rejects.toThrow(/FINANCIAL_MAINTENANCE_ACTIVE/);
    const pg = await prisma.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    expect(pg?.status).toBe("PENDING"); // continua recuperável
  });

  it("§20 escrita vulnerável OLD polling (Payment+Reservation+Ticket na mesma tx) é RECUSADA", async () => {
    const { paymentId, reservationId } = await pendente();
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled = true WHERE id = true`);
      await tx.$executeRawUnsafe(`UPDATE "Payment" SET status='APPROVED' WHERE id=$1`, paymentId);
      await tx.$executeRawUnsafe(`UPDATE "Reservation" SET status='PAID' WHERE id=$1`, reservationId);
    })).rejects.toThrow(/FINANCIAL_MAINTENANCE_ACTIVE/);
    const rr = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });
    expect(rr?.status).toBe("PENDING");
  });

  it("§18 override manual SEM Payment (Reservation→PAID direto) é RECUSADO", async () => {
    const { reservationId } = await pendente();
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled = true WHERE id = true`);
      await tx.$executeRawUnsafe(`UPDATE "Reservation" SET status='PAID', "aprovadaNoPainel"=true WHERE id=$1`, reservationId);
    })).rejects.toThrow(/FINANCIAL_MAINTENANCE_ACTIVE/);
  });

  it("§6 fail-closed: linha de controle ausente também bloqueia (NULL => bloqueia)", async () => {
    const { paymentId } = await pendente();
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "_financial_maintenance" WHERE id = true`);
      await tx.$executeRawUnsafe(`UPDATE "Payment" SET status='APPROVED' WHERE id=$1`, paymentId);
    })).rejects.toThrow(/FINANCIAL_MAINTENANCE_ACTIVE/);
  });

  it("§11 NÃO bloqueia updates irrelevantes (metadata / outros estados) com manutenção ON", async () => {
    const { paymentId } = await pendente();
    // atualizar um Payment PENDING para REJECTED (não é aprovação) deve passar
    const ok = await comManutencao(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "Payment" SET status='REJECTED' WHERE id=$1`, paymentId);
    });
    expect(ok).toBe("__ok_rollback__");
  });

  it("§12 flag idempotente: ativar 2x continua ON; desativar 2x continua OFF (tx-scoped)", async () => {
    const r = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled=true WHERE id=true`);
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled=true WHERE id=true`);
      const [row] = await tx.$queryRawUnsafe<{ enabled: boolean }[]>(`SELECT enabled FROM "_financial_maintenance" WHERE id=true`);
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled=false WHERE id=true`);
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled=false WHERE id=true`);
      const [row2] = await tx.$queryRawUnsafe<{ enabled: boolean }[]>(`SELECT enabled FROM "_financial_maintenance" WHERE id=true`);
      return { on: row.enabled, off: row2.enabled };
    });
    expect(r.on).toBe(true);
    expect(r.off).toBe(false);
  });

  it("§21/§22 recovery: bloqueado com ON; com OFF o NEW STRONG aprova UMA vez (reserva PAID, tickets/XP 1x)", async () => {
    const { paymentId, reservationId, externalId } = await pendente();

    // (a) manutenção ON (tx-scoped): a aprovação autoritativa é recusada
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled = true WHERE id = true`);
      await tx.$executeRawUnsafe(`UPDATE "Payment" SET status='APPROVED' WHERE id=$1`, paymentId);
    })).rejects.toThrow(/FINANCIAL_MAINTENANCE_ACTIVE/);
    expect((await prisma.payment.findUnique({ where: { id: paymentId }, select: { status: true } }))?.status).toBe("PENDING");

    // (b) manutenção OFF (estado commitado default): NEW STRONG reprocessa
    const out = await processarWebhookDePagamento({
      evento: { provider: "NEXUSPAG", externalId, statusAfirmado: "APPROVED", eventoOficial: null },
      corpoCru: "", payload: {}, assinaturaValida: true,
    }, nexusOk(externalId));
    expect(out.desfecho).toBe("APROVADO");

    const pg = await prisma.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    const rr = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true } });
    expect(pg?.status).toBe("APPROVED");
    expect(rr?.status).toBe("PAID");
    const tickets = await prisma.ticket.count({ where: { reservationId, status: "PAID" } });
    const xp = await prisma.xpEntry.count({ where: { reservationId } });
    expect(xp).toBeLessThanOrEqual(1);

    // (c) reprocessar de novo é idempotente (JA_PROCESSADO), sem efeito duplo
    const out2 = await processarWebhookDePagamento({
      evento: { provider: "NEXUSPAG", externalId, statusAfirmado: "APPROVED", eventoOficial: null },
      corpoCru: "", payload: {}, assinaturaValida: true,
    }, nexusOk(externalId));
    expect(out2.desfecho).toBe("JA_PROCESSADO");
    expect(await prisma.ticket.count({ where: { reservationId, status: "PAID" } })).toBe(tickets);
  });
});
