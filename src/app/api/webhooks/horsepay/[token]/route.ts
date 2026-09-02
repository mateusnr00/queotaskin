// Webhook da HorsePay. URL = /api/webhooks/horsepay/<HORSEPAY_WEBHOOK_TOKEN>.
//
// Vai no campo callback_url de cada cobrança, então a nossa URL é sempre a
// mesma e não precisa ser cadastrada no painel deles.
//
// DUAS PROVAS, E AQUI A SEGUNDA É DE VERDADE
//
// O token secreto no caminho barra quem não conhece a URL. A assinatura HMAC
// barra quem conhece a URL mas não tem o segredo: ele vem do painel deles, por
// fora da mensagem, então conferir prova mesmo alguma coisa. Sem segredo
// cadastrado a rota recusa tudo, em vez de "aceitar por enquanto": confirmar
// pagamento é a porta mais cara do sistema para deixar destrancada.
//
// O CORPO CRU É OBRIGATÓRIO
//
// A assinatura cobre o corpo exatamente como ele chegou. Ler com req.json() e
// reserializar reordena chaves e muda espaços, e a conferência passa a falhar
// por um motivo invisível de ler no código. Por isso o corpo entra como texto
// e o JSON.parse vem depois.
//
// INFRAÇÃO NÃO É RESPOSTA DE COBRANÇA
//
// As notificações do MED chegam por este mesmo endereço, no mesmo formato,
// mais o campo infraction_status. E chegam com status false. Tratá-las como
// notificação de pagamento marcaria como recusado um Pix que caiu, então elas
// são gravadas no histórico e param por aí.
//
// SEMPRE 2XX QUANDO NÃO É PARA REENVIAR
//
// A documentação deles pede HTTP 200 na confirmação. Evento fora do escopo e
// cobrança de outro sistema também respondem 200, com o motivo: reentregar
// algo que nunca vai ser processado só enche a fila dos dois lados. O 401
// fica para o que importa, a assinatura que não confere.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { assinaturaConfere, lerWebhook } from "@/lib/horsepay";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { computeTicketsToRecreate } from "@/server/services/reservations";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { gerarRaspadinhasParaReserva } from "@/server/services/raspadinhas";
import { awardXpForReservation } from "@/server/services/xp";
import { processarPagamentoConfirmado } from "@/server/services/afiliados";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const esperado = process.env.HORSEPAY_WEBHOOK_TOKEN;

  if (!esperado || token !== esperado) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // Cru, e não req.json(): é sobre este texto exato que a assinatura foi
  // calculada.
  const corpoCru = await req.text();

  const segredo = await segredoDoWebhook();
  if (!segredo) {
    console.error(
      "[horsepay webhook] sem segredo cadastrado, notificação recusada",
    );
    return new NextResponse("unauthorized", { status: 401 });
  }
  if (!assinaturaConfere(req.headers.get("x-signature"), corpoCru, segredo)) {
    console.warn("[horsepay webhook] assinatura não confere");
    return new NextResponse("unauthorized", { status: 401 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(corpoCru);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const aviso = lerWebhook(body);
  if (!aviso?.externalId) {
    console.warn("[horsepay webhook] corpo sem external_id");
    return NextResponse.json({ ok: true, ignored: "sem id de transação" });
  }
  if (aviso.saque) {
    // Saque não sai daqui: a plataforma só recebe.
    return NextResponse.json({ ok: true, ignored: "notificação de saque" });
  }

  const evento = await prisma.paymentWebhookEvent.create({
    data: {
      provider: "HORSEPAY",
      externalId: aviso.externalId,
      payload: body as Prisma.InputJsonValue,
    },
  });

  if (aviso.infracao) {
    // Fica registrada e visível no histórico, e o pagamento não se mexe. Quem
    // vai responder a defesa é gente, no painel deles.
    console.warn(
      `[horsepay webhook] infração ${aviso.infracao} na transação ${aviso.externalId}`,
    );
    await prisma.paymentWebhookEvent.update({
      where: { id: evento.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true, infracao: aviso.infracao });
  }

  const payment = await prisma.payment.findUnique({
    where: { externalId: aviso.externalId },
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
        console.error("[horsepay webhook] computeTicketsToRecreate falhou:", err);
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
      console.error("[horsepay webhook] autoAwardTickets falhou:", err)
    );
    await autoGenerateSurpriseBoxesForReservation(payment.reservationId).catch(
      (err) =>
        console.error("[horsepay webhook] autoGenerateSurpriseBoxes falhou:", err)
    );
    await gerarRaspadinhasParaReserva(payment.reservationId).catch((err) =>
      console.error("[horsepay webhook] gerarRaspadinhas falhou:", err)
    );
    // Credita o XP do rank. Idempotente: reentrega do webhook não dobra.
    await awardXpForReservation(payment.reservationId);
    // O programa de afiliados: confirma a Entrada Grátis usada nesta compra e
    // credita o progresso de quem indicou. Idempotente por índice único, o
    // que importa aqui: este webhook chega mais de uma vez.
    await processarPagamentoConfirmado(payment.reservationId).catch((err) =>
      console.error(`[horsepay webhook] afiliado falhou:`, err),
    );
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
 * Vem do Tenant e não de env var: cada tenant tem a própria conta na HorsePay,
 * e um segredo global assinaria por todos.
 */
async function segredoDoWebhook(): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { horsepayWebhookSecretEnc: { not: null } },
    select: { horsepayWebhookSecretEnc: true },
  });
  if (!tenant?.horsepayWebhookSecretEnc || !isEncryptionConfigured()) {
    return null;
  }
  try {
    return decryptSecret(tenant.horsepayWebhookSecretEnc);
  } catch (err) {
    console.error("[horsepay webhook] falha ao decriptar o segredo:", err);
    return null;
  }
}
