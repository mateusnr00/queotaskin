// Webhook da SigiloPay. URL = /api/webhooks/sigilopay/<SIGILOPAY_WEBHOOK_TOKEN>.
//
// Cadastrado uma vez no painel deles, em Configurações > Webhooks, marcando os
// eventos de transação. A URL é fixa: a SigiloPay limita 20 webhooks por
// integração e a documentação avisa que quem estoura esse limite está mandando
// uma URL diferente por transação. A nossa referência viaja no corpo da
// cobrança, não no endereço.
//
// A PROVA DE ORIGEM É O TOKEN DO CAMINHO, E SÓ ELE
//
// A notificação traz um campo `token`, e eu cheguei a compará-lo com um valor
// guardado no Tenant, achando que fosse fixo da integração. Não é: a primeira
// transação real mostrou a MESMA transação, no MESMO evento, chegando quatro
// vezes em dois segundos com dois tokens diferentes. Três entregas legítimas
// levaram 403 por causa disso.
//
// E não era só instável, era inútil como prova: nunca recebemos esse token por
// outro caminho, então a primeira notificação de qualquer transação teria de
// ser aceita de olhos fechados de todo jeito. Verificar contra um valor que só
// existe dentro da própria mensagem não prova nada. O segredo no caminho da
// URL é a defesa de verdade, e é a mesma que a SyncPay e a CodePay usam aqui.
//
// SEMPRE 2XX, MENOS QUANDO É PARA REENVIAR
//
// A SigiloPay reenvia o que não recebe 2XX. Então evento que não nos interessa,
// cobrança que não é nossa e payload sem transação respondem 200 com um motivo:
// tratar isso como erro colocaria a notificação em loop de reentrega. O 403 do
// token errado é de propósito, esse não queremos de volta.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { lerWebhook } from "@/lib/sigilopay";
import { computeTicketsToRecreate } from "@/server/services/reservations";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { gerarRaspadinhasParaReserva } from "@/server/services/raspadinhas";
import { awardXpForReservation } from "@/server/services/xp";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const esperado = process.env.SIGILOPAY_WEBHOOK_TOKEN;

  if (!esperado || token !== esperado) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const aviso = lerWebhook(body);
  if (!aviso) {
    return NextResponse.json({ ok: true, ignored: "evento fora do escopo" });
  }
  if (!aviso.idDaTransacao) {
    console.warn("[sigilopay webhook] sem id de transação", body);
    return NextResponse.json({ ok: true, ignored: "sem id de transação" });
  }

  const evento = await prisma.paymentWebhookEvent.create({
    data: {
      provider: "SIGILOPAY",
      externalId: aviso.idDaTransacao,
      payload: body as Prisma.InputJsonValue,
    },
  });

  const payment = await prisma.payment.findUnique({
    where: { externalId: aviso.idDaTransacao },
    select: {
      id: true,
      reservationId: true,
      status: true,
      reservation: {
        select: {
          raffleId: true,
          status: true,
          _count: { select: { tickets: true } },
        },
      },
    },
  });
  if (!payment) {
    await prisma.paymentWebhookEvent.update({
      where: { id: evento.id },
      data: { processedAt: new Date(), processingError: "Payment não encontrada" },
    });
    return NextResponse.json({ ok: true, ignored: "cobrança de outro sistema" });
  }

  if (aviso.status === "APPROVED") {
    // A transição é reivindicada com uma escrita condicional, e não com um
    // "if" sobre o status lido antes. A SigiloPay entregou o mesmo evento
    // quatro vezes em dois segundos na primeira transação real: com leitura
    // seguida de escrita, duas entregas simultâneas passariam as duas pelo
    // teste e emitiriam os prêmios em dobro. Aqui só uma leva o `count: 1`.
    const agoraDaClaim = new Date();
    const reivindicou = await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: "APPROVED" } },
      data: { status: "APPROVED", paidAt: agoraDaClaim },
    });
    if (reivindicou.count === 0) {
      await prisma.paymentWebhookEvent.update({
        where: { id: evento.id },
        data: { processedAt: new Date() },
      });
      return NextResponse.json({ ok: true, duplicado: true });
    }

    // Webhook chegou tarde, reserva já expirou e os tickets foram apagados:
    // calcula números novos para recriar.
    const precisaRecriar =
      payment.reservation?.status === "EXPIRED" &&
      payment.reservation._count.tickets === 0;
    let recriar: number[] = [];
    if (precisaRecriar) {
      try {
        recriar = await computeTicketsToRecreate(payment.reservationId);
      } catch (err) {
        console.error("[sigilopay webhook] computeTicketsToRecreate falhou:", err);
      }
    }

    const agora = agoraDaClaim;
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: payment.reservationId },
        data: { status: "PAID", paidAt: agora },
      });
      await tx.ticket.updateMany({
        where: { reservationId: payment.reservationId, status: "RESERVED" },
        data: { status: "PAID", paidAt: agora },
      });
      if (recriar.length > 0 && payment.reservation) {
        await tx.ticket.createMany({
          data: recriar.map((number) => ({
            raffleId: payment.reservation!.raffleId,
            number,
            status: "PAID" as const,
            reservationId: payment.reservationId,
            paidAt: agora,
          })),
        });
      }
    });

    await autoAwardTicketsForReservation(payment.reservationId).catch((err) =>
      console.error("[sigilopay webhook] autoAwardTickets falhou:", err)
    );
    await autoGenerateSurpriseBoxesForReservation(payment.reservationId).catch(
      (err) =>
        console.error("[sigilopay webhook] autoGenerateSurpriseBoxes falhou:", err)
    );
    await gerarRaspadinhasParaReserva(payment.reservationId).catch((err) =>
      console.error("[sigilopay webhook] gerarRaspadinhas falhou:", err)
    );
    // Credita o XP do rank. Idempotente: reentrega do webhook não dobra.
    await awardXpForReservation(payment.reservationId);
  } else if (aviso.desfazPagamento) {
    // Estorno e chargeback chegam DEPOIS do dinheiro ter entrado. A cobrança
    // vira REFUNDED e o evento fica registrado, mas os números emitidos, os
    // prêmios já sorteados e o XP creditado NÃO são desfeitos aqui: isso é
    // decisão de negócio, e desfazer sozinho um sorteio que já aconteceu causa
    // mais estrago do que conserta. O admin resolve o caso com a lista de
    // eventos na mão.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED" },
    });
    console.warn(
      `[sigilopay webhook] ${aviso.evento} na reserva ${payment.reservationId}: números e prêmios mantidos, revisar manualmente`
    );
  } else if (aviso.status === "REJECTED" && payment.status === "PENDING") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REJECTED" },
    });
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: evento.id },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true, status: aviso.status });
}
