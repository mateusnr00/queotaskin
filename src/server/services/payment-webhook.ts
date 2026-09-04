// O PROCESSAMENTO DE WEBHOOK DE PAGAMENTO, num lugar só.
//
// As quatro rotas de gateway ficam finas: autenticam (token + assinatura
// quando o provedor oferece), normalizam o evento e chamam
// `processarWebhookDePagamento`. Nenhuma delas escreve Payment.status: isso é
// exclusivo da máquina de estados, e só depois de o gateway confirmar
// server-to-server via `verifyPayment`.

import type { PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { chaveDeEvento, hashDoCorpo } from "@/lib/pagamentos/idempotencia";
import { aprovacaoAutomaticaDesligada, aprovacaoAutomaticaPermitida, tierDoProvider } from "@/lib/pagamentos/tier";
import { transitionPaymentState } from "@/server/services/payment-state-machine";
import {
  verifyPayment,
  type DepsDaVerificacao,
  type ResultadoDaVerificacao,
} from "@/server/services/payment-verification";
import { computeTicketsToRecreate, ticketsNecessariosDaReserva } from "@/server/services/reservations";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { gerarRaspadinhasParaReserva } from "@/server/services/raspadinhas";
import { awardXpForReservation } from "@/server/services/xp";
import { processarPagamentoConfirmado } from "@/server/services/afiliados";
import { registrarLog } from "@/server/services/activity-log";

export interface EventoDeWebhook {
  provider: PaymentProvider;
  /** id da transação no gateway (== Payment.externalId). */
  externalId: string;
  /** status normalizado que o CORPO afirma (só entra no fingerprint/log). */
  statusAfirmado: string;
  /** id oficial do evento, se o gateway fornecer (nenhum dos 4 fornece hoje). */
  eventoOficial?: string | null;
}

export interface EntradaDoWebhook {
  evento: EventoDeWebhook;
  corpoCru: string;
  payload: unknown;
  /** null quando o provedor não tem assinatura (SyncPay/SigiloPay). */
  assinaturaValida: boolean | null;
}

export type DesfechoDoWebhook =
  | "APROVADO"
  | "JA_PROCESSADO"
  | "PENDENTE"
  | "RECUSADO"
  | "NAO_APROVADO"
  | "PAGAMENTO_DESCONHECIDO"
  | "RECONCILIACAO";

export async function processarWebhookDePagamento(
  entrada: EntradaDoWebhook,
  deps: DepsDaVerificacao = {},
): Promise<{ desfecho: DesfechoDoWebhook; verificacao?: ResultadoDaVerificacao }> {
  const { evento } = entrada;
  const chave = chaveDeEvento({
    provider: evento.provider,
    transacao: evento.externalId,
    status: evento.statusAfirmado,
    eventoOficial: evento.eventoOficial,
  });

  // 1. REGISTRA O EVENTO (dedup de AUDITORIA). O @@unique evita linhas
  //    repetidas. Mas a idempotência FINANCEIRA NÃO mora aqui: um evento
  //    logado cujo processamento morreu no meio precisa poder ser reprocessado
  //    no reenvio do gateway, senão o dinheiro fica preso. Por isso, colisão
  //    aqui NÃO encerra o fluxo: ele segue e a decisão vem do estado do
  //    Payment (FSM compare-and-set), que é idempotente por natureza.
  let eventId: string;
  try {
    const criado = await prisma.paymentWebhookEvent.create({
      data: {
        provider: evento.provider,
        externalId: evento.externalId,
        providerEventId: chave,
        payload: entrada.payload as Prisma.InputJsonValue,
        rawPayloadHash: hashDoCorpo(entrada.corpoCru),
        signatureValid: entrada.assinaturaValida,
      },
      select: { id: true },
    });
    eventId = criado.id;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Já existe a linha deste evento. Recupera o id e SEGUE: pode ser retry de
    // crash (pagamento ainda PENDING) ou duplicata de algo já resolvido.
    logSeg("PAYMENT_DUPLICATE_EVENT", { provider: evento.provider, externalId: evento.externalId });
    const existente = await prisma.paymentWebhookEvent.findFirst({
      where: { provider: evento.provider, providerEventId: chave },
      select: { id: true },
    });
    eventId = existente?.id ?? "";
  }

  // 2. localizar o Payment pela transação GRAVADA.
  const payment = await prisma.payment.findUnique({
    where: { externalId: evento.externalId },
    select: {
      id: true,
      status: true,
      reservationId: true,
      reservation: { select: { status: true, raffle: { select: { tenantId: true } } } },
    },
  });
  if (!payment) {
    await marcarEvento(eventId, { verificationResult: "INVALID", processingError: "Payment não encontrado" });
    return { desfecho: "PAGAMENTO_DESCONHECIDO" };
  }

  // Pagamento já em estado terminal: dedup financeiro verdadeiro. Nada a fazer.
  if (payment.status === "APPROVED" || payment.status === "REJECTED" || payment.status === "REFUNDED") {
    return { desfecho: "JA_PROCESSADO" };
  }

  // 3. VERIFICAR no gateway. Webhook nunca aprova sozinho.
  const verif = await verifyPayment(
    { paymentId: payment.id, providerDaRota: evento.provider, externalIdDoWebhook: evento.externalId },
    deps,
  );
  logSeg("PAYMENT_VERIFICATION", { provider: evento.provider, paymentId: payment.id, resultado: verif.resultado, metodo: verif.metodo, detalhe: verif.detalhe });

  if (verif.resultado !== "VERIFIED_APPROVED" && verif.resultado !== "VERIFIED_FAILED") {
    await marcarEvento(eventId, {
      verificationResult: verif.resultado,
      previousStatus: payment.status,
      processingError: verif.resultado === "VERIFIED_PENDING" ? null : verif.detalhe,
    });
    return { desfecho: verif.resultado === "VERIFIED_PENDING" ? "PENDENTE" : "NAO_APROVADO", verificacao: verif.resultado };
  }

  // KILL SWITCH (fail-closed): mesmo com o gateway confirmando, se a aprovação
  // automática estiver desligada o pagamento NÃO é aprovado. Fica PENDING para
  // reconciliação. Nunca vira comportamento legado nem provider fraco.
  if (verif.resultado === "VERIFIED_APPROVED" && aprovacaoAutomaticaDesligada()) {
    await marcarEvento(eventId, {
      verificationResult: verif.resultado,
      previousStatus: payment.status,
      processingError: "aprovação automática desligada (kill switch)",
    });
    logSeg("PAYMENT_AUTO_APPROVAL_DISABLED", { provider: evento.provider, paymentId: payment.id });
    return { desfecho: "PENDENTE", verificacao: verif.resultado };
  }

  // POLÍTICA POR PROVIDER (fail-closed): só gateway STRONG (valor conferido)
  // autoaprova. STATUS_ONLY confirma status mas não o valor, então sem opt-in
  // explícito NÃO autoaprova: fica PENDING/reconciliável. Fecha a lacuna de um
  // provider fraco aprovar sem prova de valor.
  if (verif.resultado === "VERIFIED_APPROVED" && !aprovacaoAutomaticaPermitida(evento.provider)) {
    await marcarEvento(eventId, {
      verificationResult: verif.resultado,
      previousStatus: payment.status,
      processingError: `provider ${evento.provider} (${tierDoProvider(evento.provider)}) sem verificacao de valor: aprovacao automatica nao permitida`,
    });
    logSeg("PAYMENT_AUTO_APPROVAL_NOT_ALLOWED", { provider: evento.provider, paymentId: payment.id, tier: tierDoProvider(evento.provider) });
    return { desfecho: "PENDENTE", verificacao: verif.resultado };
  }

  // 4. TRANSIÇÃO ATÔMICA: Payment.status + Reservation + Tickets numa transação.
  const destino: PaymentStatus = verif.resultado === "VERIFIED_APPROVED" ? "APPROVED" : "REJECTED";
  const transicao = await prisma.$transaction(async (tx) => {
    const r = await transitionPaymentState(tx, {
      paymentId: payment.id,
      para: destino,
      motivo: `webhook ${evento.provider}`,
      verificado: destino === "APPROVED",
    });
    if (r.ok && !r.noop && destino === "APPROVED") {
      await finalizarReservaPaga(tx, payment.reservationId);
    }
    return r;
  });

  await marcarEvento(eventId, {
    verificationResult: verif.resultado,
    previousStatus: payment.status,
    nextStatus: transicao.ok ? destino : payment.status,
    verifiedAt: new Date(),
  });

  if (destino === "REJECTED") return { desfecho: "RECUSADO", verificacao: verif.resultado };
  if (!transicao.ok) return { desfecho: "NAO_APROVADO", verificacao: verif.resultado };
  if (transicao.noop) return { desfecho: "JA_PROCESSADO", verificacao: verif.resultado };

  // 5. EFEITOS DERIVADOS (idempotentes por unique/lock). Documentado: um crash
  //    entre a transação e aqui deixa a reserva PAGA sem os efeitos, que são
  //    idempotentes e reprocessáveis (a reconciliação de P1 fecha isso).
  const tenantId = payment.reservation?.raffle.tenantId ?? null;
  void registrarLog({
    acao: "pagamento.aprovado", tenantId, origem: "SISTEMA",
    ator: { nome: `Webhook ${evento.provider}` },
    alvo: { tipo: "Reservation", id: payment.reservationId },
    // Auditoria financeira segura: método e valores em centavos, sem segredo,
    // sem PIX copia-e-cola, sem documento.
    detalhes: {
      pagamentoId: payment.id,
      verificationMethod: verif.metodo,
      centavosVerificados: verif.centavosConfirmados,
      caminho: "webhook-verificado",
    },
  });
  // Se a finalização mandou para reconciliação, a reserva NÃO está PAID e os
  // efeitos derivados (que assumem entrega) não podem rodar.
  const finalReserva = await prisma.reservation.findUnique({
    where: { id: payment.reservationId },
    select: { status: true, precisaReconciliacao: true },
  });
  if (finalReserva?.precisaReconciliacao || finalReserva?.status !== "PAID") {
    return { desfecho: "RECONCILIACAO", verificacao: verif.resultado };
  }
  await aplicarEfeitosDePagamentoAprovado(payment.reservationId);
  return { desfecho: "APROVADO", verificacao: verif.resultado };
}

/**
 * Reserva PAID + tickets PAID, atômico. Mas ANTES, dois guardas financeiros:
 *
 *  - rifa não-ACTIVE (FINISHED/CANCELLED/...): um pagamento tardio JAMAIS
 *    insere tickets numa rifa já sorteada, o que alteraria o histórico do
 *    sorteio (§20). Vai para reconciliação.
 *  - cotas insuficientes para entregar o que foi comprado (§18/§19): não
 *    finge entrega parcial como se fosse completa. Vai para reconciliação.
 *
 * Nos dois casos o Payment continua APPROVED (o dinheiro entrou, é fato), mas
 * a Reservation NÃO vira PAID: fica marcada para decisão manual, auditável, e
 * nada de número roubado, duplicado, nem entrega fingida.
 */
async function finalizarReservaPaga(tx: Prisma.TransactionClient, reservationId: string): Promise<void> {
  const reserva = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: {
      status: true, raffleId: true,
      _count: { select: { tickets: true } },
      raffle: { select: { status: true } },
    },
  });
  if (!reserva) return;

  // GUARDA 1 (§20, BLOCKER): rifa não-ativa não recebe tickets novos.
  if (reserva.raffle.status !== "ACTIVE") {
    await marcarReconciliacao(tx, reservationId, `rifa ${reserva.raffle.status} no momento do pagamento`);
    return;
  }

  if (reserva.status === "EXPIRED" && reserva._count.tickets === 0) {
    // Pagou depois de expirar: precisa recriar os tickets apagados. Só se
    // houver cotas livres suficientes; senão, não finge entrega.
    const necessarios = await ticketsNecessariosDaReserva(reservationId);
    const recriar = await computeTicketsToRecreate(reservationId);
    if (necessarios <= 0 || recriar.length < necessarios) {
      await marcarReconciliacao(
        tx, reservationId,
        `cotas insuficientes no pagamento tardio: ${recriar.length}/${necessarios} disponíveis`,
      );
      return;
    }
    await tx.ticket.createMany({
      data: recriar.map((number) => ({
        raffleId: reserva.raffleId, number, status: "PAID" as const,
        reservationId, paidAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  await tx.reservation.update({ where: { id: reservationId }, data: { status: "PAID", paidAt: new Date() } });
  await tx.ticket.updateMany({
    where: { reservationId, status: "RESERVED" },
    data: { status: "PAID", paidAt: new Date() },
  });
}

/** Marca a reserva para reconciliação (dinheiro recebido, entrega bloqueada). */
async function marcarReconciliacao(tx: Prisma.TransactionClient, reservationId: string, motivo: string): Promise<void> {
  await tx.reservation.update({
    where: { id: reservationId },
    data: { precisaReconciliacao: true, motivoReconciliacao: motivo },
  });
  logSeg("PAYMENT_REQUIRES_RECONCILIATION", { reservationId, motivo });
}

/** Efeitos derivados, todos idempotentes. Preserva o mecanismo atual. */
async function aplicarEfeitosDePagamentoAprovado(reservationId: string): Promise<void> {
  await autoAwardTicketsForReservation(reservationId).catch((e) => console.error("[webhook] autoAward:", e));
  await autoGenerateSurpriseBoxesForReservation(reservationId).catch((e) => console.error("[webhook] caixas:", e));
  await gerarRaspadinhasParaReserva(reservationId).catch((e) => console.error("[webhook] raspadinhas:", e));
  await awardXpForReservation(reservationId).catch((e) => console.error("[webhook] xp:", e));
  await processarPagamentoConfirmado(reservationId).catch((e) => console.error("[webhook] afiliado:", e));
}

async function marcarEvento(id: string, data: Prisma.PaymentWebhookEventUpdateInput): Promise<void> {
  if (!id) return;
  await prisma.paymentWebhookEvent.update({ where: { id }, data: { processedAt: new Date(), ...data } }).catch(() => {});
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e != null && (e as { code?: string }).code === "P2002";
}

function logSeg(evento: string, campos: Record<string, unknown>): void {
  console.info(JSON.stringify({ evento, ...campos, ts: new Date().toISOString() }));
}
