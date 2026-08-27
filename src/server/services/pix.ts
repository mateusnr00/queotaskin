// Service de criação de cobrança Pix idempotente por reserva.
//
// Multi-provider por sorteio: cada sorteio pode escolher um gateway
// próprio (raffle.paymentProvider), ou herdar o padrão do tenant
// (tenant.paymentProvider). Credenciais ficam sempre no tenant.
// `getProviderForRaffle` resolve essa cadeia e devolve um cliente abstrato.
//
// Idempotência: se já existe Payment com pix_code, não chama o gateway
// de novo.

import { prisma } from "@/lib/db";
import { registrarLog } from "@/server/services/activity-log";
import { awardXpForReservation } from "@/server/services/xp";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import {
  getProviderForRaffle,
  type PaymentProviderClient,
} from "@/server/services/payment-provider";
import {
  estaBloqueado,
  registrarFalha,
} from "@/server/services/login-throttle";

export interface PixData {
  pixCode: string;
  identifier: string;
}

export type EnsurePixResult =
  | { ok: true; pix: PixData; created: boolean }
  | { ok: false; error: string; code: PixErrorCode };

export type PixErrorCode =
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_NOT_PENDING"
  | "FREE_RAFFLE"
  | "PROVIDER_NOT_CONFIGURED"
  | "ENCRYPTION_KEY_MISSING"
  | "WEBHOOK_URL_MISSING"
  | "MISSING_CPF"
  | "GATEWAY_ERROR";

function buildWebhookUrl(provider: PaymentProviderClient): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) return null;
  // Cada gateway tem o próprio token: SYNCPAY_WEBHOOK_TOKEN /
  // CODEPAY_WEBHOOK_TOKEN. Isolar permite rotacionar sem afetar o outro.
  const envKey = `${provider.name}_WEBHOOK_TOKEN`;
  const token = process.env[envKey];
  if (!token) return null;
  return `${base}/api/webhooks/${provider.webhookPath}/${encodeURIComponent(
    token
  )}`;
}


export async function ensurePixForReservation(
  reservationId: string,
  /** IP do cliente final (opcional, gateway exige, mas default funciona). */
  ip?: string
): Promise<EnsurePixResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      expiresAt: true,
      participantName: true,
      participantCpf: true,
      participantPhone: true,
      participantEmail: true,
      raffleId: true,
      raffle: { select: { tenantId: true } },
      payment: {
        select: { externalId: true, rawResponse: true, method: true },
      },
    },
  });

  if (!reservation) {
    return {
      ok: false,
      error: "Reserva não encontrada",
      code: "RESERVATION_NOT_FOUND",
    };
  }

  // Idempotência: se já há um Payment com pix_code, retorna ele.
  if (reservation.payment) {
    const existing = extractPixCode(reservation.payment.rawResponse);
    if (existing) {
      return {
        ok: true,
        pix: { pixCode: existing, identifier: reservation.payment.externalId },
        created: false,
      };
    }
  }

  if (reservation.status !== "PENDING") {
    return {
      ok: false,
      error: `A reserva não está mais pendente (status atual: ${reservation.status}).`,
      code: "RESERVATION_NOT_PENDING",
    };
  }

  const amount = Number(reservation.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      error: "Esta rifa não exige pagamento (total R$ 0,00).",
      code: "FREE_RAFFLE",
    };
  }

  const resolution = await getProviderForRaffle(reservation.raffleId);
  if (!resolution.ok) {
    return {
      ok: false,
      error: resolution.error,
      code: resolution.code,
    };
  }
  const provider = resolution.provider;

  const webhookUrl = buildWebhookUrl(provider);
  if (!webhookUrl) {
    return {
      ok: false,
      error: `URL do webhook ausente. Defina NEXT_PUBLIC_APP_URL e ${provider.name}_WEBHOOK_TOKEN no Vercel.`,
      code: "WEBHOOK_URL_MISSING",
    };
  }

  if (!reservation.participantCpf) {
    return {
      ok: false,
      error: "Reserva sem CPF. Não é possível gerar Pix.",
      code: "MISSING_CPF",
    };
  }

  // Freio de geração de Pix por reserva, no store compartilhado (Postgres).
  // O Map in-memory anterior era por-instância no serverless: requisições em
  // instâncias diferentes furavam o limite e batiam no gateway sem contenção.
  const chavePixgen = `pixgen:${reservation.id}`;
  if ((await estaBloqueado([chavePixgen])).bloqueado) {
    return {
      ok: false,
      error: "Aguarde alguns segundos antes de gerar o Pix de novo.",
      code: "GATEWAY_ERROR",
    };
  }
  await registrarFalha([chavePixgen]);

  const client = {
    name: reservation.participantName,
    email: reservation.participantEmail || "no-reply@example.com",
    cpf: reservation.participantCpf,
    phone: reservation.participantPhone || "",
  };

  try {
    const charge = await provider.createPixCharge({
      amount,
      description: `Reserva ${reservation.id}`,
      webhookUrl,
      ip: ip || "0.0.0.0",
      externalRef: reservation.id,
      // Reservation.expiresAt é curto (15min); o gateway aceita data
      // (Y-m-d), então uso +1 dia pra dar folga ao QR Code.
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      client,
    });

    await prisma.payment.upsert({
      where: { reservationId: reservation.id },
      create: {
        reservationId: reservation.id,
        provider: provider.name,
        externalId: charge.identifier,
        status: "PENDING",
        amount,
        method: "PIX",
        rawResponse: {
          pix_code: charge.pixCode,
        },
      },
      update: {
        provider: provider.name,
        externalId: charge.identifier,
        status: "PENDING",
        amount,
        method: "PIX",
        rawResponse: {
          pix_code: charge.pixCode,
        },
      },
    });

    // void, sem await: isto está no caminho que o cliente espera na tela
    // (aguardando o QR Code aparecer), e a escrita do log não pode somar
    // latência à geração do Pix.
    // O tenant vem da rifa da reserva, e não é enfeite: a consulta do
    // histórico filtra por ele, então registro sem tenant só aparece para
    // o dono da plataforma. Sem isto, o admin do painel não enxergaria
    // nenhum evento de pagamento, que é metade do que ele veio procurar.
    void registrarLog({
      acao: "pix.gerado",
      tenantId: reservation.raffle.tenantId,
      origem: "PUBLICO",
      alvo: { tipo: "Reservation", id: reservation.id },
      detalhes: { gateway: provider.name, valor: amount },
    });

    return {
      ok: true,
      pix: { pixCode: charge.pixCode, identifier: charge.identifier },
      created: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ensurePixForReservation]", message);
    return {
      ok: false,
      error: `Falha ao gerar Pix: ${message}`,
      code: "GATEWAY_ERROR",
    };
  }
}

function extractPixCode(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>).pix_code;
  return typeof v === "string" && v.length > 0 ? v : null;
}

// Polling de status no gateway como FALLBACK ao webhook. Só funciona pros
// providers que implementam `getStatus` (SyncPay sim; CodePay não, webhook
// only). Throttled per-reservation pra não estourar rate limit.
const lastStatusPollByPayment = new Map<string, number>();
const STATUS_POLL_THROTTLE_MS = 15_000;

export async function pollPaymentStatusIfPending(
  paymentId: string,
  externalId: string,
  reservationId: string,
  options: { force?: boolean } = {}
): Promise<"PENDING" | "APPROVED" | "REJECTED" | null> {
  if (!options.force) {
    const last = lastStatusPollByPayment.get(paymentId) ?? 0;
    if (Date.now() - last < STATUS_POLL_THROTTLE_MS) return null;
  }
  lastStatusPollByPayment.set(paymentId, Date.now());

  // Descobre o provider a partir do sorteio da reserva (respeitando
  // override do sorteio sobre o default do tenant).
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      raffle: { select: { tenantId: true } },
    },
  });
  if (!reservation) return null;

  const resolution = await getProviderForRaffle(reservation.raffleId);
  if (!resolution.ok || !resolution.provider.getStatus) return null;

  try {
    const res = await resolution.provider.getStatus(externalId);
    const resolved = res.status;

    // Lida uma vez, antes de decidir qualquer coisa, e usada só para decidir
    // SE o log abaixo é escrito (não guarda a transação, que já era assim
    // antes desta task). O freio de polling logo acima é um Map em memória:
    // em serverless cada instância tem o seu, então duas requisições que
    // caem em instâncias diferentes furam o freio e chegam as duas aqui. Um
    // polling que roda depois de o webhook já ter confirmado também cai
    // neste ramo. Sem esta leitura, a mesma confirmação apareceria repetida
    // no histórico.
    //
    // A leitura não fecha a corrida de verdade (ainda é ler e depois agir),
    // mas colapsa o caso real, que é a repetição em sequência. Fechar de
    // verdade exigiria trocar o update por updateMany com guarda de status,
    // e mudar a semântica do caminho do dinheiro (update lança quando a
    // linha não existe, updateMany não) só por causa de um campo de log não
    // se paga.
    //
    // Só quando há transição para registrar: no caso dominante o gateway
    // responde PENDING, e aí esta leitura seria uma ida ao banco por
    // consulta de status, sem nada para gravar no fim.
    const paymentAntesDoPoll =
      resolved === "APPROVED" || resolved === "REJECTED"
        ? await prisma.payment.findUnique({
            where: { id: paymentId },
            select: { status: true },
          })
        : null;

    if (resolved === "APPROVED") {
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: paymentId },
          data: { status: "APPROVED", paidAt: new Date() },
        }),
        prisma.reservation.update({
          where: { id: reservationId },
          data: { status: "PAID", paidAt: new Date() },
        }),
        prisma.ticket.updateMany({
          where: { reservationId, status: "RESERVED" },
          data: { status: "PAID", paidAt: new Date() },
        }),
      ]);
      // void, sem await: esta chamada vai PARA o gateway, quem espera a
      // resposta é o cliente (o botão "Já paguei" via checkPaymentStatusAction,
      // ou o render da página do comprovante), e a escrita do log não pode
      // somar latência a essa resposta.
      if (paymentAntesDoPoll?.status !== "APPROVED") {
        void registrarLog({
          acao: "pagamento.aprovado",
          tenantId: reservation.raffle.tenantId,
          origem: "SISTEMA",
          ator: { nome: "Consulta de status no gateway" },
          alvo: { tipo: "Reservation", id: reservationId },
          detalhes: { pagamentoId: paymentId, caminho: "polling" },
        });
      }
      // Tudo o que o webhook faz depois de confirmar precisa acontecer aqui
      // também. Quando o webhook não chega, este é o único caminho que marca
      // a reserva como paga, e sem isto a pessoa pagava, recebia os números e
      // o XP, e nunca recebia título premiado nem caixa surpresa. Em silêncio:
      // nada falhava, o prêmio simplesmente não vinha.
      //
      // Cada entrega vai com catch próprio, como no webhook: o pagamento já
      // está confirmado neste ponto, e derrubar a função por causa de um
      // prêmio deixaria os outros sem entregar também.
      await awardXpForReservation(reservationId).catch((err) =>
        console.error("[pollPaymentStatusIfPending] awardXp falhou:", err)
      );
      await autoAwardTicketsForReservation(reservationId).catch((err) =>
        console.error("[pollPaymentStatusIfPending] autoAwardTickets falhou:", err)
      );
      await autoGenerateSurpriseBoxesForReservation(reservationId).catch((err) =>
        console.error(
          "[pollPaymentStatusIfPending] autoGenerateSurpriseBoxes falhou:",
          err
        )
      );
    } else if (resolved === "REJECTED") {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: "REJECTED" },
      });
      // void, sem await: mesmo raciocínio do ramo APPROVED acima.
      if (paymentAntesDoPoll?.status !== "REJECTED") {
        void registrarLog({
          acao: "pagamento.recusado",
          tenantId: reservation.raffle.tenantId,
          origem: "SISTEMA",
          ator: { nome: "Consulta de status no gateway" },
          alvo: { tipo: "Reservation", id: reservationId },
          detalhes: { pagamentoId: paymentId, caminho: "polling" },
        });
      }
    }
    return resolved;
  } catch (err) {
    console.error("[pollPaymentStatusIfPending]", err);
    return null;
  }
}
