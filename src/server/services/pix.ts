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
import {
  getProviderForRaffle,
  type PaymentProviderClient,
} from "@/server/services/payment-provider";

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

// Throttle in-memory por reserva: bloqueia chamadas seguidas ao gateway
// pra mesma reservation_id em menos de THROTTLE_MS. Per-instance no
// serverless, mas suficiente pra cortar 95% do slam acidental.
const lastAttemptByReservation = new Map<string, number>();
const THROTTLE_MS = 8_000;

export async function ensurePixForReservation(
  reservationId: string,
  /** IP do cliente final (opcional — gateway exige, mas default funciona). */
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

  const last = lastAttemptByReservation.get(reservation.id) ?? 0;
  const wait = THROTTLE_MS - (Date.now() - last);
  if (wait > 0) {
    return {
      ok: false,
      error: `Aguarde ${Math.ceil(wait / 1000)}s antes de tentar novamente.`,
      code: "GATEWAY_ERROR",
    };
  }
  lastAttemptByReservation.set(reservation.id, Date.now());

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
// providers que implementam `getStatus` (SyncPay sim; CodePay não — webhook
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
    select: { raffleId: true },
  });
  if (!reservation) return null;

  const resolution = await getProviderForRaffle(reservation.raffleId);
  if (!resolution.ok || !resolution.provider.getStatus) return null;

  try {
    const res = await resolution.provider.getStatus(externalId);
    const resolved = res.status;
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
    } else if (resolved === "REJECTED") {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: "REJECTED" },
      });
    }
    return resolved;
  } catch (err) {
    console.error("[pollPaymentStatusIfPending]", err);
    return null;
  }
}
