// Webhook da SyncPay. URL = /api/webhooks/syncpay/<SYNCPAY_WEBHOOK_TOKEN>.
//
// A SyncPay NÃO oferece assinatura. Por isso o token do caminho apenas barra
// quem não conhece a URL; ele NÃO é prova de pagamento. A prova é a consulta
// server-to-server que `processarWebhookDePagamento` faz pelo externalId
// gravado: webhook dizendo "paid" com a API dizendo "pending" NÃO aprova.
//
// Esta rota é fina de propósito: autentica o token, normaliza o evento e
// delega. Não escreve Payment.status.

import { NextResponse } from "next/server";

import { extractStatusInfo } from "@/lib/syncpay";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const esperado = process.env.SYNCPAY_WEBHOOK_TOKEN;
  if (!esperado || token !== esperado) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const corpoCru = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(corpoCru);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const { identifier, status } = extractStatusInfo(payload);
  if (!identifier) {
    return new NextResponse("missing identifier", { status: 400 });
  }

  const { desfecho } = await processarWebhookDePagamento({
    evento: {
      provider: "SYNCPAY",
      externalId: identifier,
      statusAfirmado: status,
      eventoOficial: null, // SyncPay não fornece id de evento
    },
    corpoCru,
    payload,
    assinaturaValida: null, // SyncPay não tem assinatura
  });

  return NextResponse.json({ ok: true, desfecho });
}
