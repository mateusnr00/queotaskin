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
import { transitionPaymentState } from "@/server/services/payment-state-machine";
import {
  verifyPayment,
  type DepsDaVerificacao,
  type ResultadoDaVerificacao,
} from "@/server/services/payment-verification";
import { computeTicketsToRecreate } from "@/server/services/reservations";
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
  | "PAGAMENTO_DESCONHECIDO";

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

  // 1. IDEMPOTÊNCIA POR EVENTO. O unique no banco é a última linha; aqui a
  //    inserção que conflita significa "já vi este evento" -> no-op.
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
    if (isUniqueViolation(e)) {
      logSeg("PAYMENT_DUPLICATE_EVENT", { provider: evento.provider, externalId: evento.externalId });
      return { desfecho: "JA_PROCESSADO" };
    }
    throw e;
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

  // 3. VERIFICAR no gateway. Webhook nunca aprova sozinho.
  const verif = await verifyPayment(
    { paymentId: payment.id, providerDaRota: evento.provider, externalIdDoWebhook: evento.externalId },
    deps,
  );
  logSeg("PAYMENT_VERIFICATION", { provider: evento.provider, paymentId: payment.id, resultado: verif.resultado, detalhe: verif.detalhe });

  if (verif.resultado !== "VERIFIED_APPROVED" && verif.resultado !== "VERIFIED_FAILED") {
    await marcarEvento(eventId, {
      verificationResult: verif.resultado,
      previousStatus: payment.status,
      processingError: verif.resultado === "VERIFIED_PENDING" ? null : verif.detalhe,
    });
    return { desfecho: verif.resultado === "VERIFIED_PENDING" ? "PENDENTE" : "NAO_APROVADO", verificacao: verif.resultado };
  }

  // 4. TRANSIÇÃO ATÔMICA: Payment.status + Reservation + Tickets numa transação.
  const destino: PaymentStatus = verif.resultado === "VERIFIED_APPROVED" ? "APPROVED" : "REJECTED";
  const transicao = await prisma.$transaction(async (tx) => {
    const r = await transitionPaymentState(tx, {
      paymentId: payment.id,
      para: destino,
      motivo: `webhook ${evento.provider}`,
      verificado: destino === "APPROVED", // provado pelo gateway acima
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

  // 5. EFEITOS DERIVADOS (idempotentes por unique/lock; fora da transação
  //    principal de propósito, para não segurar locks longos). Documentado:
  //    um crash entre a transação e aqui deixa a reserva PAGA sem os efeitos,
  //    que a reconciliação (fase P1) reprocessa. Cada efeito é idempotente.
  const tenantId = payment.reservation?.raffle.tenantId ?? null;
  void registrarLog({
    acao: "pagamento.aprovado", tenantId, origem: "SISTEMA",
    ator: { nome: `Webhook ${evento.provider}` },
    alvo: { tipo: "Reservation", id: payment.reservationId },
    detalhes: { pagamentoId: payment.id, caminho: "webhook-verificado" },
  });
  await aplicarEfeitosDePagamentoAprovado(payment.reservationId);
  return { desfecho: "APROVADO", verificacao: verif.resultado };
}

/** Reserva PAID + tickets PAID, atômico. Trata reserva expirada mas paga. */
async function finalizarReservaPaga(tx: Prisma.TransactionClient, reservationId: string): Promise<void> {
  const reserva = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: { status: true, raffleId: true, _count: { select: { tickets: true } } },
  });
  if (!reserva) return;

  // ETAPA 13: expirada mas paga de verdade. Não fraudar, não duplicar cota:
  // recria os tickets que o cron apagou, com os mesmos números.
  if (reserva.status === "EXPIRED" && reserva._count.tickets === 0) {
    const recriar = await computeTicketsToRecreate(reservationId);
    if (recriar.length > 0) {
      await tx.ticket.createMany({
        data: recriar.map((number) => ({
          raffleId: reserva.raffleId, number, status: "PAID" as const,
          reservationId, paidAt: new Date(),
        })),
        skipDuplicates: true,
      });
    }
  }

  await tx.reservation.update({ where: { id: reservationId }, data: { status: "PAID", paidAt: new Date() } });
  await tx.ticket.updateMany({
    where: { reservationId, status: "RESERVED" },
    data: { status: "PAID", paidAt: new Date() },
  });
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
  await prisma.paymentWebhookEvent.update({ where: { id }, data: { processedAt: new Date(), ...data } }).catch(() => {});
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e != null && (e as { code?: string }).code === "P2002";
}

function logSeg(evento: string, campos: Record<string, unknown>): void {
  console.info(JSON.stringify({ evento, ...campos, ts: new Date().toISOString() }));
}
