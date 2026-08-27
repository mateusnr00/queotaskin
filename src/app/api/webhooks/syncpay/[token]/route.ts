// Webhook do SyncPay. URL = /api/webhooks/syncpay/<SYNCPAY_WEBHOOK_TOKEN>.
//
// O token-segredo no path funciona como "Bearer light": só quem souber
// o valor pode chamar o endpoint. Sem ele, ninguém marca reserva como
// paga só fazendo POST aleatório.
//
// Identifier + status são extraídos por walker recursivo (o SyncPay
// usa idTransaction + status_transaction; outros gateways variam).
//
// Idempotência: a SyncPay dispara múltiplos eventos por transação
// (criada → paga → ... ). Logamos TODOS em PaymentWebhookEvent (sem
// unique), e o update do Payment é condicional, só transiciona se
// ainda não está em estado terminal (APPROVED/REJECTED). Webhook
// duplicado da mesma fase vira no-op.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { registrarLog } from "@/server/services/activity-log";
import { extractStatusInfo, getPixStatus } from "@/lib/syncpay";
import { computeTicketsToRecreate } from "@/server/services/reservations";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { awardXpForReservation } from "@/server/services/xp";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const expected = process.env.SYNCPAY_WEBHOOK_TOKEN;

  if (!expected || token !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const { identifier, status: payloadStatus } = extractStatusInfo(body);
  if (!identifier) {
    console.warn("[syncpay webhook] missing identifier", body);
    return new NextResponse("missing identifier", { status: 400 });
  }

  // Loga o evento (todos os eventos da transação são guardados pra audit).
  const event = await prisma.paymentWebhookEvent.create({
    data: {
      provider: "SYNCPAY",
      externalId: identifier,
      payload: body as Prisma.InputJsonValue,
    },
  });

  // Confia no status do payload; se vier indecidido, consulta o gateway.
  let resolved = payloadStatus;
  if (resolved === "PENDING") {
    try {
      const fetched = await getPixStatus(identifier);
      resolved = fetched.status;
    } catch (err) {
      console.error("[syncpay webhook] getPixStatus", err);
    }
  }

  const payment = await prisma.payment.findUnique({
    where: { externalId: identifier },
    select: {
      id: true,
      reservationId: true,
      status: true,
      reservation: {
        select: {
          status: true,
          _count: { select: { tickets: true } },
          raffle: { select: { tenantId: true } },
        },
      },
    },
  });
  if (!payment) {
    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), processingError: "Payment não encontrada" },
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Update condicional: só transiciona se ainda não está em terminal.
  // Webhook duplicado da mesma fase = no-op.
  if (resolved === "APPROVED" && payment.status !== "APPROVED") {
    // Caso especial: webhook chegou tarde, a reserva já expirou e o cron
    // deletou os tickets. Calcula quantos recriar (números aleatórios) ANTES
    // da transação principal, computeTicketsToRecreate lê o estado atual
    // de Ticket.
    const needsRecreate =
      payment.reservation?.status === "EXPIRED" &&
      payment.reservation._count.tickets === 0;
    let toRecreate: number[] = [];
    let recreatedRaffleId: string | null = null;
    if (needsRecreate) {
      try {
        toRecreate = await computeTicketsToRecreate(payment.reservationId);
        if (toRecreate.length > 0) {
          const r = await prisma.reservation.findUnique({
            where: { id: payment.reservationId },
            select: { raffleId: true },
          });
          recreatedRaffleId = r?.raffleId ?? null;
        }
      } catch (err) {
        console.error(
          "[syncpay webhook] computeTicketsToRecreate falhou:",
          err
        );
      }
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "APPROVED", paidAt: now },
      });
      await tx.reservation.update({
        where: { id: payment.reservationId },
        data: { status: "PAID", paidAt: now },
      });
      await tx.ticket.updateMany({
        where: { reservationId: payment.reservationId, status: "RESERVED" },
        data: { status: "PAID", paidAt: now },
      });
      if (toRecreate.length > 0 && recreatedRaffleId) {
        await tx.ticket.createMany({
          data: toRecreate.map((number) => ({
            raffleId: recreatedRaffleId!,
            number,
            status: "PAID" as const,
            reservationId: payment.reservationId,
            paidAt: now,
          })),
        });
      }
    });
    // A chamada fica DENTRO do `if (resolved === "APPROVED" && payment.status
    // !== "APPROVED")`: é a mesma guarda de idempotência que impede este
    // bloco de rodar de novo num reenvio do gateway. Fora dela, cada reenvio
    // do mesmo evento (a SyncPay reenvia por dias) apareceria como uma
    // confirmação de pagamento nova na tela de histórico.
    // void, sem await: o gateway está esperando a resposta HTTP deste
    // webhook, e a escrita do log não pode atrasar essa resposta.
    void registrarLog({
      acao: "pagamento.aprovado",
      tenantId: payment.reservation?.raffle.tenantId ?? null,
      origem: "SISTEMA",
      ator: { nome: "Webhook SyncPay" },
      alvo: { tipo: "Payment", id: payment.id },
      detalhes: { reservaId: payment.reservationId, caminho: "webhook" },
    });
    // Após PAID, transiciona pra AWARDED os tickets cujos números são
    // títulos premiados cadastrados pra rifa.
    await autoAwardTicketsForReservation(payment.reservationId).catch((err) =>
      console.error("[syncpay webhook] autoAwardTickets falhou:", err)
    );
    // Gera as Caixas Surpresas baseado nos combos da rifa (idempotente).
    await autoGenerateSurpriseBoxesForReservation(payment.reservationId).catch(
      (err) =>
        console.error("[syncpay webhook] autoGenerateSurpriseBoxes falhou:", err)
    );
    // Credita o XP do rank. Idempotente: reentrega do webhook não dobra.
    await awardXpForReservation(payment.reservationId);
  } else if (resolved === "REJECTED" && payment.status === "PENDING") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REJECTED" },
    });
    // Mesma guarda do ramo APPROVED acima (`payment.status === "PENDING"`
    // neste else-if): reenvio do gateway pra um pagamento já recusado cai
    // fora deste bloco e não duplica o registro.
    void registrarLog({
      acao: "pagamento.recusado",
      tenantId: payment.reservation?.raffle.tenantId ?? null,
      origem: "SISTEMA",
      ator: { nome: "Webhook SyncPay" },
      alvo: { tipo: "Payment", id: payment.id },
      detalhes: { reservaId: payment.reservationId, caminho: "webhook" },
    });
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true, status: resolved });
}
