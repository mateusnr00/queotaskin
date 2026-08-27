// Webhook da CodePay. URL = /api/webhooks/codepay/<CODEPAY_WEBHOOK_TOKEN>.
//
// Configurar no painel da CodePay: webhook URL pra cada conta deve apontar
// pra ${NEXT_PUBLIC_APP_URL}/api/webhooks/codepay/${CODEPAY_WEBHOOK_TOKEN}.
//
// Identifier (paymentId/movId) + status são extraídos por walker recursivo
// porque a doc deles não fixou o shape do payload. O Payment.externalId
// guardado no createPixCharge é o `paymentId` da CodePay.
//
// Idempotência: cada transação dispara múltiplos eventos ao longo do
// tempo. Logamos todos sem dedupe (auditoria), e o update do Payment é
// condicional, só transiciona se ainda não está em estado terminal.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { registrarLog } from "@/server/services/activity-log";
import { extractWebhookInfo } from "@/lib/codepay";
import { computeTicketsToRecreate } from "@/server/services/reservations";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { awardXpForReservation } from "@/server/services/xp";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const expected = process.env.CODEPAY_WEBHOOK_TOKEN;

  if (!expected || token !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const { identifier, status: resolved } = extractWebhookInfo(body);
  if (!identifier) {
    console.warn("[codepay webhook] missing identifier", body);
    return new NextResponse("missing identifier", { status: 400 });
  }

  const event = await prisma.paymentWebhookEvent.create({
    data: {
      provider: "CODEPAY",
      externalId: identifier,
      payload: body as Prisma.InputJsonValue,
    },
  });

  const payment = await prisma.payment.findUnique({
    where: { externalId: identifier },
    select: {
      id: true,
      reservationId: true,
      status: true,
      reservation: {
        select: {
          raffleId: true,
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
      data: {
        processedAt: new Date(),
        processingError: "Payment não encontrada",
      },
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (resolved === "APPROVED" && payment.status !== "APPROVED") {
    // Webhook chegou tarde, reserva já expirou e tickets foram deletados:
    // calcula números aleatórios pra recriar.
    const needsRecreate =
      payment.reservation?.status === "EXPIRED" &&
      payment.reservation._count.tickets === 0;
    let toRecreate: number[] = [];
    if (needsRecreate) {
      try {
        toRecreate = await computeTicketsToRecreate(payment.reservationId);
      } catch (err) {
        console.error(
          "[codepay webhook] computeTicketsToRecreate falhou:",
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
      if (toRecreate.length > 0 && payment.reservation) {
        await tx.ticket.createMany({
          data: toRecreate.map((number) => ({
            raffleId: payment.reservation!.raffleId,
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
    // do mesmo evento apareceria como uma confirmação de pagamento nova na
    // tela de histórico. Vale para reenvio em série, que é como o gateway
    // repete na prática; duas entregas verdadeiramente simultâneas leem o
    // mesmo `payment.status` antes de qualquer escrita e passariam as duas,
    // uma corrida que fechar exigiria transição atômica no update.
    // void, sem await: o gateway está esperando a resposta HTTP deste
    // webhook, e a escrita do log não pode atrasar essa resposta.
    void registrarLog({
      acao: "pagamento.aprovado",
      tenantId: payment.reservation?.raffle.tenantId ?? null,
      origem: "SISTEMA",
      ator: { nome: "Webhook CodePay" },
      alvo: { tipo: "Payment", id: payment.id },
      detalhes: { reservaId: payment.reservationId, caminho: "webhook" },
    });
    await autoAwardTicketsForReservation(payment.reservationId).catch((err) =>
      console.error("[codepay webhook] autoAwardTickets falhou:", err)
    );
    await autoGenerateSurpriseBoxesForReservation(payment.reservationId).catch(
      (err) =>
        console.error("[codepay webhook] autoGenerateSurpriseBoxes falhou:", err)
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
    // fora deste bloco e não duplica o registro. Mesma ressalva: vale para
    // reenvio em série, não para duas entregas simultâneas lendo o mesmo
    // status antes de qualquer uma escrever.
    void registrarLog({
      acao: "pagamento.recusado",
      tenantId: payment.reservation?.raffle.tenantId ?? null,
      origem: "SISTEMA",
      ator: { nome: "Webhook CodePay" },
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
