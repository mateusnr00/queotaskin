// Webhook da NexusPag. Assinatura HMAC oficial como pré-filtro fail-closed,
// mais a consulta server-to-server para APROVAR. Rota fina.

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { assinaturaConfere, lerWebhook } from "@/lib/nexuspag";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";

interface RouteParams { params: Promise<{ token: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const esperado = process.env.NEXUSPAG_WEBHOOK_TOKEN;
  if (!esperado || token !== esperado) return new NextResponse("forbidden", { status: 403 });

  const corpoCru = await req.text();
  const segredo = await segredoDoWebhook();
  if (!segredo) return new NextResponse("unauthorized", { status: 401 });
  const assinaturaValida = assinaturaConfere(req.headers.get("x-webhook-signature"), corpoCru, segredo);
  if (!assinaturaValida) return new NextResponse("unauthorized", { status: 401 });

  let payload: unknown;
  try { payload = JSON.parse(corpoCru); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const aviso = lerWebhook(payload);
  if (!aviso?.transactionId) return new NextResponse("ignored", { status: 200 });

  const { desfecho } = await processarWebhookDePagamento({
    evento: { provider: "NEXUSPAG", externalId: aviso.transactionId, statusAfirmado: aviso.status, eventoOficial: null },
    corpoCru, payload, assinaturaValida: true,
  });
  return NextResponse.json({ ok: true, desfecho });
}

async function segredoDoWebhook(): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { nexuspagWebhookSecretEnc: { not: null } },
    select: { nexuspagWebhookSecretEnc: true },
  });
  if (!tenant?.nexuspagWebhookSecretEnc || !isEncryptionConfigured()) return null;
  try {
    return decryptSecret(tenant.nexuspagWebhookSecretEnc);
  } catch (err) {
    console.error("[nexuspag webhook] falha ao decriptar o segredo:", err);
    return null;
  }
}
