import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { Lock } from "lucide-react";

import { prisma } from "@/lib/db";
import { ReservationCountdown } from "@/components/public/reservation-countdown";
import { PaymentPoller } from "@/components/public/payment-poller";
import { PixPayment } from "@/components/public/pix-payment";
import { PixError } from "@/components/public/pix-error";
import { PaidCelebration } from "@/components/public/paid-celebration";
import { SurpriseBoxesClaim } from "@/components/public/surprise-boxes-claim";
import { ExpiredReservation } from "@/components/public/expired-reservation";
import { CheckPaymentButton } from "@/components/public/check-payment-button";
import {
  ensurePixForReservation,
  pollPaymentStatusIfPending,
} from "@/server/services/pix";
import { expireReservationIfDue } from "@/server/services/reservations";
import { formatBRL } from "@/lib/format";
import { formatPhone } from "@/lib/cpf";
import { getCurrentTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Comprovante de reserva" };

const reservationInclude = {
  raffle: {
    select: {
      title: true,
      slug: true,
      tenantId: true,
      surpriseBoxAbrirTodas: true,
    },
  },
  tickets: {
    select: { number: true },
    orderBy: { number: "asc" as const },
  },
  payment: {
    select: {
      id: true,
      externalId: true,
      status: true,
      method: true,
      rawResponse: true,
    },
  },
  surpriseBoxes: {
    select: {
      id: true,
      status: true,
      prize: { select: { title: true, prize: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

export default async function ReservationReceiptPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  // Auto-cura: se o timer já passou mas o cron ainda não rodou, expira a
  // reserva agora. Evita o estado híbrido em que o countdown client-side
  // mostra "Reserva expirada" mas o servidor renderiza QR Code e botão
  // "Já paguei" como se ainda fosse pra pagar.
  await expireReservationIfDue(reservationId);

  let reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: reservationInclude,
  });
  if (!reservation) notFound();
  // Bloqueia acesso cross-tenant: o comprovante só aparece no domínio do
  // tenant onde a reserva foi feita.
  if (reservation.raffle.tenantId !== tenant.id) notFound();

  // Auto-cura: reservas grátis (total 0) que ficaram presas em PENDING
  // antes da correção de fluxo. Promove pra PAID na hora, não tem o que
  // cobrar, não tem por que esperar. Cobre tanto a reserva quanto os
  // tickets que ainda estavam RESERVED.
  if (
    reservation.status === "PENDING" &&
    Number(reservation.totalAmount) <= 0
  ) {
    const paidAt = new Date();
    await prisma.$transaction([
      prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: "PAID", paidAt },
      }),
      prisma.ticket.updateMany({
        where: { reservationId: reservation.id, status: "RESERVED" },
        data: { status: "PAID", paidAt },
      }),
    ]);
    reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: reservationInclude,
    });
    if (!reservation) notFound();
  }

  // Fallback ao webhook: se a reserva ainda está PENDING e já existe
  // Payment, consulta o gateway pra ver se o pagamento foi confirmado.
  // Throttled internamente pra não estourar rate limit.
  if (
    reservation.status === "PENDING" &&
    reservation.payment?.externalId
  ) {
    const polled = await pollPaymentStatusIfPending(
      reservation.payment.id,
      reservation.payment.externalId,
      reservation.id
    );
    if (polled === "APPROVED" || polled === "REJECTED") {
      reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: reservationInclude,
      });
      if (!reservation) notFound();
    }
  }

  // Carrega os textos/imagens customizados do tenant. Cada campo pode estar
  // null, os componentes caem pros defaults nesse caso.
  const tenantMessages = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      paidTitle: true,
      paidDescription: true,
      paidButtonLabel: true,
      paidImageUrl: true,
      expiredTitle: true,
      expiredDescription: true,
      expiredButtonLabel: true,
      expiredImageUrl: true,
    },
  });

  // ── Estado pago: tela comemorativa + caixas surpresas (se houver).
  if (reservation.status === "PAID") {
    const boxes = reservation.surpriseBoxes.map((b) => ({
      id: b.id,
      status: b.status as "UNOPENED" | "OPENED_PRIZE" | "OPENED_EMPTY",
      prize: b.prize
        ? { title: b.prize.title, prize: b.prize.prize }
        : null,
    }));
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 space-y-6">
        <PaidCelebration
          raffleTitle={reservation.raffle.title}
          raffleSlug={reservation.raffle.slug}
          numbers={reservation.tickets.map((t) => t.number)}
          participantName={reservation.participantName}
          totalAmount={Number(reservation.totalAmount)}
          paidAt={reservation.paidAt}
          customTitle={tenantMessages?.paidTitle}
          customDescription={tenantMessages?.paidDescription}
          customButtonLabel={tenantMessages?.paidButtonLabel}
          customImageUrl={tenantMessages?.paidImageUrl}
        />
        {boxes.length > 0 && (
          <SurpriseBoxesClaim
            reservationId={reservation.id}
            boxes={boxes}
            allowOpenAll={reservation.raffle.surpriseBoxAbrirTodas}
          />
        )}
      </div>
    );
  }

  // ── Estado expirado/cancelado: convida a refazer a reserva. Sem
  // countdown, sem PixError, sem badge, nada disso faz sentido aqui.
  if (
    reservation.status === "EXPIRED" ||
    reservation.status === "CANCELLED"
  ) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <ExpiredReservation
          raffleTitle={reservation.raffle.title}
          raffleSlug={reservation.raffle.slug}
          cancelled={reservation.status === "CANCELLED"}
          customTitle={tenantMessages?.expiredTitle}
          customDescription={tenantMessages?.expiredDescription}
          customButtonLabel={tenantMessages?.expiredButtonLabel}
          customImageUrl={tenantMessages?.expiredImageUrl}
        />
      </div>
    );
  }

  // ── Estado pendente: QR Code + copia-cola + opções de verificação.
  let pixCode = extractPixCode(reservation.payment?.rawResponse);
  let pixError: string | null = null;

  if (reservation.status === "PENDING" && !pixCode) {
    const ip = await getClientIp();
    const result = await ensurePixForReservation(reservation.id, ip);
    if (result.ok) {
      pixCode = result.pix.pixCode;
    } else {
      pixError = result.error;
    }
  }

  const showPix = reservation.status === "PENDING" && Boolean(pixCode);
  const qrDataUrl = showPix
    ? await QRCode.toDataURL(pixCode!, {
        margin: 1,
        width: 300,
        errorCorrectionLevel: "M",
      }).catch(() => null)
    : null;

  const quantidade = reservation.tickets.length;

  return (
    // Tela de pagamento pendente. A ordem segue o que a pessoa precisa
    // fazer agora: quanto pagar, quanto tempo resta, e como pagar. Antes,
    // o Pix ficava espremido entre o cronômetro e os dados do participante,
    // e o título dizia "Reserva confirmada" numa reserva que ainda não
    // estava paga.
    <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-lg md:py-10">
      <div className="space-y-4">
        {/* ---------- cabeçalho ---------- */}
        <div className="space-y-2 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
            </span>
            Aguardando pagamento
          </span>
          <h1 className="text-lg font-bold leading-tight tracking-tight">
            {reservation.raffle.title}
          </h1>
        </div>

        {/* ---------- valor + quantidade ---------- */}
        {/* O que pagar vem antes de como pagar: é a primeira pergunta de
            quem abre esta tela. */}
        <div className="rounded-2xl border bg-gradient-to-br from-accent/40 to-accent/10 px-5 py-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Valor a pagar
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-primary">
            {formatBRL(Number(reservation.totalAmount))}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {quantidade} {quantidade === 1 ? "número" : "números"} para{" "}
            {reservation.participantName}
          </p>
        </div>

        <ReservationCountdown
          expiresAtIso={reservation.expiresAt.toISOString()}
        />
        {showPix && <PaymentPoller />}

        {showPix && qrDataUrl && pixCode && (
          <>
            <PixPayment qrDataUrl={qrDataUrl} pixCode={pixCode} />
            <CheckPaymentButton reservationId={reservation.id} />
          </>
        )}

        {!showPix && (
          <PixError
            reservationId={reservation.id}
            error={
              pixError ??
              "Pix ainda não foi gerado. Tente novamente em instantes."
            }
          />
        )}

        {/* ---------- números, ainda fechados ---------- */}
        {/* Os números só se revelam depois do pagamento. Mostrá-los antes
            dava a impressão de que a compra já estava garantida, e ela não
            está: a reserva expira e os números voltam para o sorteio. Eles
            aparecem na tela de confirmação, junto do comprovante. */}
        <div className="rounded-2xl border bg-card p-4 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-4 w-4" />
          </div>
          <p className="mt-2 text-sm font-semibold">
            {quantidade} {quantidade === 1 ? "número reservado" : "números reservados"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Eles aparecem aqui assim que o pagamento for confirmado.
          </p>
          {/* Silhueta do que virá: comunica que os números existem e são
              seus, sem entregar quais. */}
          <div
            className="mt-3 flex flex-wrap justify-center gap-1.5 select-none"
            aria-hidden
          >
            {Array.from({ length: Math.min(quantidade, 12) }).map((_, i) => (
              <span
                key={i}
                className="rounded-md bg-muted px-3 py-1 text-xs font-mono text-transparent blur-[3px]"
              >
                000000
              </span>
            ))}
            {quantidade > 12 && (
              <span className="px-1 py-1 text-xs text-muted-foreground">
                +{quantidade - 12}
              </span>
            )}
          </div>
        </div>

        {/* ---------- dados da reserva ---------- */}
        <div className="rounded-2xl border bg-card p-4 text-sm">
          <Info label="Participante">{reservation.participantName}</Info>
          {reservation.participantPhone && (
            <Info label="Telefone">
              {formatPhone(reservation.participantPhone)}
            </Info>
          )}
        </div>
      </div>
    </div>
  );
}

function extractPixCode(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>).pix_code;
  return typeof v === "string" && v.length > 0 ? v : null;
}

// IP do cliente: pega de x-forwarded-for (Vercel injeta), com fallback
// pra x-real-ip. Default 0.0.0.0 mantém o gateway feliz sem expor nada.
async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
