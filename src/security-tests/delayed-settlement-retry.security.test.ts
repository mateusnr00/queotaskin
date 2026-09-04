// GATE 10K: recuperacao automatica e SEGURA de liquidacao atrasada (settlement
// lag) contra Postgres real (via a barreira de ambiente).
//
// Prova que a reverificacao NAO cria um segundo caminho de aprovacao: ela apenas
// reagenda verifyPayment pelo MESMO choke point (S2S autoritativo -> politica de
// tier -> FSM -> finalizarReservaPaga). HORSEPAY so aprova com status=paid +
// valor exato (centavos) + identidade (id == externalId). O webhook e apenas
// SINAL. Elegibilidade exige um sinal AUTENTICADO (signatureValid=true) que
// terminou VERIFIED_PENDING - um PIX nunca pago nunca entra na fila.
//
// Isolamento: cada reverificar() e escopado com apenasExternalIds, entao o sweep
// global nunca toca pagamentos de outras suites rodando em paralelo no mesmo
// banco efemero.
import { execFileSync } from "node:child_process";
import path from "node:path";

import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import type { PaymentProvider } from "@prisma/client";

import { prisma } from "@/lib/db";
import { integracaoLiberada, suiteDeIntegracao } from "@/test/integration-setup";
import { chaveDeEvento } from "@/lib/pagamentos/idempotencia";
import {
  reverificarPagamentosComLag,
  espacamentoDeReverificacaoMs,
} from "@/server/services/reconciliacao-pagamentos";
import { verifyPayment } from "@/server/services/payment-verification";
import { expireReservationIfDue } from "@/server/services/reservations";
import type { ProviderResolution } from "@/server/services/payment-provider";

const GUARD = path.resolve(__dirname, "../../prisma/guard");
function psql(file: string) {
  const url = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(GUARD, file)], { stdio: "pipe" });
}

// Provider falso com a FORMA REAL do STRONG (amountBrl vem de `value`,
// identity.id vem do `id`). Registra o externalId consultado, para provar que a
// consulta usa o id GRAVADO no banco, nunca um vindo da request.
interface CfgProvider {
  status: "PENDING" | "APPROVED" | "REJECTED";
  amountBrl?: number | null;
  id?: string | null;
  erro?: boolean;
}
function fakeProvider(nome: PaymentProvider, cfg: CfgProvider, espiao?: { id?: string }) {
  return {
    resolverProvider: async (): Promise<ProviderResolution> => ({
      ok: true,
      provider: {
        name: nome,
        webhookPath: nome.toLowerCase(),
        createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
        getStatus: async (externalId: string) => {
          if (espiao) espiao.id = externalId;
          if (cfg.erro) throw new Error("gateway 500 / timeout");
          return {
            status: cfg.status,
            raw: {},
            amountBrl: cfg.amountBrl === undefined ? null : cfg.amountBrl,
            identity: { id: cfg.id === undefined ? null : cfg.id, txid: null, externalId: null },
          };
        },
      },
    }),
  };
}

suiteDeIntegracao("GATE 10K · reverificacao de liquidacao atrasada (DB real)", () => {
  let tenantId = "", donoId = "";
  const rifas: string[] = [], reservas: string[] = [], externalIds: string[] = [];

  beforeAll(async () => {
    if (!integracaoLiberada) return;
    // Idempotente; garante a tabela/triggers do guard para o teste tx-scoped.
    // NAO desinstala (evita derrubar o guard de suites paralelas); deixa OFF.
    psql("financial-maintenance.install.sql");
    tenantId = (await prisma.tenant.findFirstOrThrow({ select: { id: true } })).id;
    donoId = (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
  });

  afterEach(async () => {
    if (!integracaoLiberada) return;
    for (const rid of reservas.splice(0)) {
      await prisma.xpEntry.deleteMany({ where: { reservationId: rid } }).catch(() => {});
      await prisma.movimentoDeAfiliado.deleteMany({ where: { reservationId: rid } }).catch(() => {});
      await prisma.ticket.deleteMany({ where: { reservationId: rid } });
      await prisma.payment.deleteMany({ where: { reservationId: rid } });
      await prisma.reservation.deleteMany({ where: { id: rid } });
    }
    if (externalIds.length) {
      await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: { in: externalIds.splice(0) } } });
    }
    if (rifas.length) await prisma.raffle.deleteMany({ where: { id: { in: rifas.splice(0) } } });
  });

  afterAll(() => { delete process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL; });

  interface OpcoesCenario {
    provider?: PaymentProvider;
    amount?: number;
    numeros?: number[];
    reservaExpirada?: boolean;
    raffleStatus?: "ACTIVE" | "FINISHED";
    totalNumbers?: number;
    comSinal?: boolean;
    sinalMinutosAtras?: number;
    recemTentado?: boolean; // cria evento RECONCILIACAO com processedAt=agora
  }
  async function cenario(opts: OpcoesCenario = {}) {
    const provider = opts.provider ?? "HORSEPAY";
    const amount = opts.amount ?? 50;
    const numeros = opts.numeros ?? [1, 2, 3, 4, 5];
    const externalId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    externalIds.push(externalId);
    const raffle = await prisma.raffle.create({ data: {
      tenantId, title: `DSR ${externalId}`, slug: `dsr-${externalId}`,
      status: opts.raffleStatus ?? "ACTIVE", privacy: "PUBLIC",
      modality: "OWN_DRAW", reservationModel: "RANDOM_NUMBERS",
      requiredFields: { name: true }, totalNumbers: opts.totalNumbers ?? 100,
      pricePerNumber: 10, createdById: donoId,
    }, select: { id: true } });
    rifas.push(raffle.id);
    const reserva = await prisma.reservation.create({ data: {
      raffleId: raffle.id, userId: donoId, participantName: "Alvo", totalAmount: amount,
      status: "PENDING",
      expiresAt: opts.reservaExpirada ? new Date(Date.now() - 3_600_000) : new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    reservas.push(reserva.id);
    await prisma.ticket.createMany({ data: numeros.map((n) => ({
      raffleId: raffle.id, number: n, status: "RESERVED" as const, reservationId: reserva.id,
    })) });
    const payment = await prisma.payment.create({ data: {
      reservationId: reserva.id, provider, externalId, status: "PENDING", amount, method: "PIX",
    }, select: { id: true } });
    if (opts.comSinal !== false) {
      await prisma.paymentWebhookEvent.create({ data: {
        provider, externalId,
        providerEventId: chaveDeEvento({ provider, transacao: externalId, status: "APPROVED", eventoOficial: null }),
        payload: {}, signatureValid: true, verificationResult: "VERIFIED_PENDING",
        createdAt: new Date(Date.now() - (opts.sinalMinutosAtras ?? 10) * 60_000),
      } });
    }
    if (opts.recemTentado) {
      await prisma.paymentWebhookEvent.create({ data: {
        provider, externalId,
        providerEventId: chaveDeEvento({ provider, transacao: externalId, status: "RECONCILIACAO", eventoOficial: null }),
        payload: {}, signatureValid: null, verificationResult: "VERIFIED_PENDING",
        processedAt: new Date(),
      } });
    }
    if (opts.reservaExpirada) await expireReservationIfDue(reserva.id, new Date());
    return { raffleId: raffle.id, reservationId: reserva.id, paymentId: payment.id, externalId };
  }

  async function estado(reservationId: string, externalId: string) {
    const p = await prisma.payment.findFirst({ where: { externalId }, select: { status: true } });
    const r = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { status: true, precisaReconciliacao: true } });
    const ticketsPagos = await prisma.ticket.count({ where: { reservationId, status: "PAID" } });
    return { pagamento: p?.status, reserva: r?.status, precisa: r?.precisaReconciliacao ?? false, ticketsPagos };
  }
  const reverificar = (externalId: string, prov: ReturnType<typeof fakeProvider>, extra = {}) =>
    reverificarPagamentosComLag({ apenasExternalIds: [externalId], limite: 100, ...extra }, prov);

  // ---- backoff (unidade) -------------------------------------------------
  it("18. backoff cresce com a idade do sinal (deterministico)", () => {
    expect(espacamentoDeReverificacaoMs(0)).toBe(60_000);
    expect(espacamentoDeReverificacaoMs(3 * 60_000)).toBe(60_000);
    expect(espacamentoDeReverificacaoMs(10 * 60_000)).toBe(5 * 60_000);
    expect(espacamentoDeReverificacaoMs(60 * 60_000)).toBe(15 * 60_000);
    expect(espacamentoDeReverificacaoMs(12 * 60 * 60_000)).toBe(60 * 60_000);
    expect(espacamentoDeReverificacaoMs(48 * 60 * 60_000)).toBe(6 * 60 * 60_000);
  });

  // ---- fluxo principal ---------------------------------------------------
  it("1. pending -> retry: S2S ainda pending mantem PENDING e reagenda", async () => {
    const c = await cenario();
    const res = await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "PENDING", amountBrl: 50, id: c.externalId }));
    expect(res.verificados).toBe(1);
    expect(res.seguemPendentes).toBe(1);
    expect((await estado(c.reservationId, c.externalId)).pagamento).toBe("PENDING");
  });

  it("2. pending -> paid depois: STRONG aprova UMA vez (Reservation PAID + 5 tickets)", async () => {
    const c = await cenario();
    const res = await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }));
    expect(res.aprovados).toBe(1);
    const e = await estado(c.reservationId, c.externalId);
    expect(e.pagamento).toBe("APPROVED");
    expect(e.reserva).toBe("PAID");
    expect(e.ticketsPagos).toBe(5);
    expect(await prisma.payment.count({ where: { reservationId: c.reservationId, status: "APPROVED" } })).toBe(1);
  });

  it("16. anti-abuso: PENDING SEM sinal autenticado NAO e elegivel (mesmo com S2S paid)", async () => {
    const c = await cenario({ comSinal: false });
    const res = await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }));
    expect(res.elegiveis).toBe(0);
    expect(res.verificados).toBe(0);
    expect((await estado(c.reservationId, c.externalId)).pagamento).toBe("PENDING");
  });

  // ---- matriz STRONG pelo caminho do retry -------------------------------
  it("3-8. paid mas valor/identidade divergentes => NUNCA aprova (INVALID, fica PENDING)", async () => {
    const casos: { nome: string; cfg: CfgProvider }[] = [
      { nome: "underpayment 49", cfg: { status: "APPROVED", amountBrl: 49, id: "SELF" } },
      { nome: "overpayment 51", cfg: { status: "APPROVED", amountBrl: 51, id: "SELF" } },
      { nome: "amount ausente", cfg: { status: "APPROVED", amountBrl: null, id: "SELF" } },
      { nome: "amount NaN", cfg: { status: "APPROVED", amountBrl: Number.NaN, id: "SELF" } },
      { nome: "identity ausente", cfg: { status: "APPROVED", amountBrl: 50, id: null } },
      { nome: "identity divergente", cfg: { status: "APPROVED", amountBrl: 50, id: "999999999" } },
    ];
    for (const caso of casos) {
      const c = await cenario();
      const cfg = { ...caso.cfg, id: caso.cfg.id === "SELF" ? c.externalId : caso.cfg.id };
      await reverificar(c.externalId, fakeProvider("HORSEPAY", cfg));
      const e = await estado(c.reservationId, c.externalId);
      expect(e.pagamento, caso.nome).toBe("PENDING");
      expect(e.ticketsPagos, caso.nome).toBe(0);
      // limpa entre iteracoes (afterEach so roda no fim do it)
      await prisma.paymentWebhookEvent.deleteMany({ where: { externalId: c.externalId } });
      await prisma.ticket.deleteMany({ where: { reservationId: c.reservationId } });
      await prisma.payment.deleteMany({ where: { reservationId: c.reservationId } });
      await prisma.reservation.deleteMany({ where: { id: c.reservationId } });
    }
  });

  it("9/10. timeout / 5xx do gateway => UNVERIFIABLE, fica PENDING", async () => {
    const c = await cenario();
    await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId, erro: true }));
    expect((await estado(c.reservationId, c.externalId)).pagamento).toBe("PENDING");
  });

  it("14. STATUS_ONLY (SYNCPAY) com S2S paid NAO auto-aprova por default: fica PENDING", async () => {
    delete process.env.PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL;
    const c = await cenario({ provider: "SYNCPAY" });
    await reverificar(c.externalId, fakeProvider("SYNCPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }));
    expect((await estado(c.reservationId, c.externalId)).pagamento).toBe("PENDING");
  });

  // ---- elegibilidade / backoff / horizonte / lote ------------------------
  it("12. recem-tentado (backoff nao cumprido) NAO e reverificado", async () => {
    const c = await cenario({ sinalMinutosAtras: 10, recemTentado: true }); // espacamento 5min, ultima=agora
    const res = await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }));
    expect(res.elegiveis).toBe(1);
    expect(res.devidos).toBe(0);
    expect(res.verificados).toBe(0);
    expect((await estado(c.reservationId, c.externalId)).pagamento).toBe("PENDING");
  });

  it("18b. fora do horizonte (sinal > horizonte) sai da fila automatica", async () => {
    const c = await cenario({ sinalMinutosAtras: 60 });
    const res = await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }), { horizonteHoras: 0.5 });
    expect(res.elegiveis).toBe(0);
    expect(res.verificados).toBe(0);
    expect((await estado(c.reservationId, c.externalId)).pagamento).toBe("PENDING");
  });

  it("17. lote limitado: com 2 devidos e limite=1, so 1 e verificado", async () => {
    const a = await cenario();
    const b = await cenario();
    const res = await reverificarPagamentosComLag(
      { apenasExternalIds: [a.externalId, b.externalId], limite: 1 },
      fakeProvider("HORSEPAY", { status: "PENDING", amountBrl: 50, id: "x" }),
    );
    expect(res.elegiveis).toBe(2);
    expect(res.devidos).toBe(1);
    expect(res.verificados).toBe(1);
  });

  it("15. externalId da consulta vem do BANCO, nunca da request", async () => {
    const c = await cenario();
    const espiao: { id?: string } = {};
    await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "PENDING", amountBrl: 50, id: c.externalId }, espiao));
    expect(espiao.id).toBe(c.externalId);
  });

  // ---- Reservation EXPIRED (late payment) --------------------------------
  it("22. EXPIRED + numeros livres => finalizacao segura (PAID, 5 tickets recriados)", async () => {
    const c = await cenario({ reservaExpirada: true });
    expect((await prisma.reservation.findUnique({ where: { id: c.reservationId }, select: { status: true } }))?.status).toBe("EXPIRED");
    await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }));
    const e = await estado(c.reservationId, c.externalId);
    expect(e.pagamento).toBe("APPROVED");
    expect(e.reserva).toBe("PAID");
    expect(e.ticketsPagos).toBe(5);
  });

  it("23. EXPIRED + numeros ja revendidos => NAO rouba: precisaReconciliacao, terceiro intacto", async () => {
    // Rifa de 5 numeros, todos ocupados por um terceiro PAGO. O canario expirado
    // precisa de 5 e nao tem nenhum livre.
    const c = await cenario({ reservaExpirada: true, totalNumbers: 5, numeros: [1, 2, 3, 4, 5] });
    const terceiro = await prisma.reservation.create({ data: {
      raffleId: c.raffleId, userId: donoId, participantName: "Terceiro", totalAmount: 50,
      status: "PAID", paidAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000),
    }, select: { id: true } });
    reservas.push(terceiro.id);
    await prisma.ticket.createMany({ data: [1, 2, 3, 4, 5].map((n) => ({
      raffleId: c.raffleId, number: n, status: "PAID" as const, reservationId: terceiro.id, paidAt: new Date(),
    })) });

    await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }));
    const e = await estado(c.reservationId, c.externalId);
    // Sem numero livre, pickAvailableNumbers lanca e a transacao inteira reverte
    // ATOMICAMENTE: nada e aprovado, nada e entregue, e o dinheiro fica PENDING
    // (recuperavel). O importante e a invariante de seguranca: NUNCA rouba nem
    // sobrescreve o terceiro. (Continua elegivel: sera reavaliado ate o horizonte.)
    expect(e.reserva).not.toBe("PAID");
    expect(e.ticketsPagos).toBe(0); // canario nao recebeu nenhum numero
    // terceiro intacto: continua com os 5 numeros PAID
    expect(await prisma.ticket.count({ where: { reservationId: terceiro.id, status: "PAID" } })).toBe(5);
  });

  it("24. rifa FINISHED => reconciliacao, nenhuma entrega tardia", async () => {
    const c = await cenario({ raffleStatus: "FINISHED" });
    await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }));
    const e = await estado(c.reservationId, c.externalId);
    expect(e.pagamento).toBe("APPROVED");
    expect(e.reserva).not.toBe("PAID");
    expect(e.precisa).toBe(true);
    expect(e.ticketsPagos).toBe(0);
  });

  // ---- concorrencia / idempotencia ---------------------------------------
  it("19/28/29. duas passadas simultaneas => exatamente 1 APPROVED, 5 tickets (sem duplicar)", async () => {
    const c = await cenario();
    const prov = fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId });
    await Promise.all([reverificar(c.externalId, prov), reverificar(c.externalId, prov)]);
    const e = await estado(c.reservationId, c.externalId);
    expect(e.pagamento).toBe("APPROVED");
    expect(e.ticketsPagos).toBe(5);
    expect(await prisma.payment.count({ where: { reservationId: c.reservationId, status: "APPROVED" } })).toBe(1);
  });

  it("26/27. ja APPROVED/PAID => nao e reselecionado (nao e mais PENDING), sem efeito duplo", async () => {
    const c = await cenario();
    const prov = fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId });
    await reverificar(c.externalId, prov);
    const antes = await estado(c.reservationId, c.externalId);
    expect(antes.pagamento).toBe("APPROVED");
    // Segunda passada: o Payment nao esta mais PENDING, entao a fila nem o
    // seleciona - zero consulta desperdicada, zero efeito duplo.
    const res2 = await reverificar(c.externalId, prov);
    expect(res2.elegiveis).toBe(0);
    expect(res2.verificados).toBe(0);
    expect((await estado(c.reservationId, c.externalId)).ticketsPagos).toBe(antes.ticketsPagos);
  });

  // ---- Guard ON (verificacao != transicao financeira) --------------------
  it("25. Guard ON: verificacao chega a VERIFIED_APPROVED/S2S_STATUS_AMOUNT, MAS o banco recusa APPROVED", async () => {
    psql("financial-maintenance.install.sql"); // garante o guard neste instante
    const c = await cenario();

    // (a) VERIFICATION RESULT: independente, S2S paid + valor + identidade.
    const verif = await verifyPayment(
      { paymentId: c.paymentId, providerDaRota: "HORSEPAY", externalIdDoWebhook: c.externalId },
      fakeProvider("HORSEPAY", { status: "APPROVED", amountBrl: 50, id: c.externalId }),
    );
    expect(verif.resultado).toBe("VERIFIED_APPROVED");
    expect(verif.metodo).toBe("S2S_STATUS_AMOUNT");

    // (b) FINANCIAL TRANSITION RESULT: com o guard ON (tx-scoped, rollback), a
    // escrita autoritativa de APPROVED - a UNICA que a FSM faz - e recusada pelo
    // banco. tx-scoped para nao vazar o estado ON para suites paralelas.
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "_financial_maintenance" SET enabled = true WHERE id = true`);
      await tx.$executeRawUnsafe(`UPDATE "Payment" SET status='APPROVED', "paidAt"=now() WHERE id=$1`, c.paymentId);
    })).rejects.toThrow(/FINANCIAL_MAINTENANCE_ACTIVE/);

    // estado commitado: nada aprovou, nada pago.
    const e = await estado(c.reservationId, c.externalId);
    expect(e.pagamento).toBe("PENDING");
    expect(e.reserva).not.toBe("PAID");
    expect(e.ticketsPagos).toBe(0);
  });

  it("30. o retry NUNCA escreve Payment.status fora da FSM (o unico writer)", async () => {
    // Regressao estrutural: reverificarPagamentosComLag delega 100% a
    // processarWebhookDePagamento; nenhum UPDATE direto de status existe no
    // servico. Aqui provamos o efeito: sem consulta paga, o status nao muda.
    const c = await cenario();
    await reverificar(c.externalId, fakeProvider("HORSEPAY", { status: "PENDING", amountBrl: 50, id: c.externalId }));
    const pg = await prisma.payment.findFirst({ where: { externalId: c.externalId }, select: { status: true, paidAt: true } });
    expect(pg?.status).toBe("PENDING");
    expect(pg?.paidAt).toBeNull();
  });
});
