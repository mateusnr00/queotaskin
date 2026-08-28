// Webhook da NexusPag. URL = /api/webhooks/nexuspag/<NEXUSPAG_WEBHOOK_TOKEN>.
//
// Vai no campo webhook_url de cada cobrança, então não há limite de quantas
// URLs cadastrar e a nossa é sempre a mesma.
//
// DUAS PROVAS, E AQUI A SEGUNDA É DE VERDADE
//
// O token secreto no caminho barra quem não conhece a URL. A assinatura HMAC
// barra quem conhece a URL mas não tem o segredo, e essa é a diferença para os
// outros gateways daqui: o segredo vem do painel deles, por fora da mensagem,
// então conferir prova mesmo alguma coisa. Sem segredo cadastrado a rota
// recusa tudo, em vez de "aceitar por enquanto": confirmar pagamento é a porta
// mais cara do sistema para deixar destrancada.
//
// O CORPO CRU É OBRIGATÓRIO
//
// A assinatura cobre "<unix>.<corpo cru>". Ler com req.json() e reserializar
// reordena chaves e muda espaços, e a conferência passa a falhar por um motivo
// invisível de ler no código. Por isso o corpo entra como texto e o JSON.parse
// vem depois.
//
// SEMPRE 2XX QUANDO NÃO É PARA REENVIAR
//
// A NexusPag reentrega por até 72 horas em erro 5xx, e encerra no 4xx. Então
// evento fora do escopo e cobrança de outro sistema respondem 200 com o
// motivo: seriam sete dias de reentrega de algo que nunca vai ser processado.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { assinaturaConfere, lerWebhook } from "@/lib/nexuspag";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
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
  const esperado = process.env.NEXUSPAG_WEBHOOK_TOKEN;

  if (!esperado || token !== esperado) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // Cru, e não req.json(): é sobre este texto exato que a assinatura foi
  // calculada.
  const corpoCru = await req.text();

  const segredo = await segredoDoWebhook();
  if (!segredo) {
    console.error(
      "[nexuspag webhook] sem segredo cadastrado, notificação recusada",
    );
    return new NextResponse("forbidden", { status: 403 });
  }
  if (
    !assinaturaConfere(req.headers.get("x-webhook-signature"), corpoCru, segredo)
  ) {
    console.warn("[nexuspag webhook] assinatura não confere");
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(corpoCru);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const aviso = lerWebhook(body);
  if (!aviso) {
    return NextResponse.json({ ok: true, ignored: "evento fora do escopo" });
  }
  if (!aviso.transactionId) {
    console.warn("[nexuspag webhook] sem id de transação");
    return NextResponse.json({ ok: true, ignored: "sem id de transação" });
  }

  const evento = await prisma.paymentWebhookEvent.create({
    data: {
      provider: "NEXUSPAG",
      externalId: aviso.transactionId,
      payload: body as Prisma.InputJsonValue,
    },
  });

  const payment = await prisma.payment.findUnique({
    where: { externalId: aviso.transactionId },
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
        console.error("[nexuspag webhook] computeTicketsToRecreate falhou:", err);
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
      console.error("[nexuspag webhook] autoAwardTickets falhou:", err)
    );
    await autoGenerateSurpriseBoxesForReservation(payment.reservationId).catch(
      (err) =>
        console.error("[nexuspag webhook] autoGenerateSurpriseBoxes falhou:", err)
    );
    await gerarRaspadinhasParaReserva(payment.reservationId).catch((err) =>
      console.error("[nexuspag webhook] gerarRaspadinhas falhou:", err)
    );
    // Credita o XP do rank. Idempotente: reentrega do webhook não dobra.
    await awardXpForReservation(payment.reservationId);
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: evento.id },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true, status: aviso.status });
}


/**
 * O segredo do webhook, decriptado.
 *
 * Vem do Tenant e não de env var: cada tenant tem a própria conta na NexusPag,
 * e um segredo global assinaria por todos.
 */
async function segredoDoWebhook(): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { nexuspagWebhookSecretEnc: { not: null } },
    select: { nexuspagWebhookSecretEnc: true },
  });
  if (!tenant?.nexuspagWebhookSecretEnc || !isEncryptionConfigured()) {
    return null;
  }
  try {
    return decryptSecret(tenant.nexuspagWebhookSecretEnc);
  } catch (err) {
    console.error("[nexuspag webhook] falha ao decriptar o segredo:", err);
    return null;
  }
}
