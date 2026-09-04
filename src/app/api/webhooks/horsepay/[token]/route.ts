// Webhook da HorsePay. Tem assinatura HMAC oficial: ela é pré-filtro
// fail-closed (assinatura inválida => 401, sem processar). Mesmo assim, a
// APROVAÇÃO ainda exige a consulta server-to-server em
// `processarWebhookDePagamento` (defesa em profundidade). Rota fina.

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { assinaturaConfere, lerWebhook } from "@/lib/horsepay";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";

interface RouteParams { params: Promise<{ token: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const esperado = process.env.HORSEPAY_WEBHOOK_TOKEN;
  if (!esperado || token !== esperado) return new NextResponse("forbidden", { status: 403 });

  const corpoCru = await req.text();
  const segredo = await segredoDoWebhook();
  if (!segredo) return new NextResponse("unauthorized", { status: 401 });
  const assinaturaValida = assinaturaConfere(req.headers.get("x-signature"), corpoCru, segredo);
  if (!assinaturaValida) return new NextResponse("unauthorized", { status: 401 });

  let payload: unknown;
  try { payload = JSON.parse(corpoCru); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const aviso = lerWebhook(payload);
  if (!aviso?.externalId) return new NextResponse("ignored", { status: 200 });

  const { desfecho } = await processarWebhookDePagamento({
    evento: { provider: "HORSEPAY", externalId: aviso.externalId, statusAfirmado: aviso.status, eventoOficial: null },
    corpoCru, payload, assinaturaValida: true,
  });
  return NextResponse.json({ ok: true, desfecho });
}

// O segredo do webhook, decriptado. Vem do Tenant (cada tenant tem a própria
// conta na HorsePay), não de env global.
async function segredoDoWebhook(): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { horsepayWebhookSecretEnc: { not: null } },
    select: { horsepayWebhookSecretEnc: true },
  });
  if (!tenant?.horsepayWebhookSecretEnc || !isEncryptionConfigured()) return null;
  try {
    return decryptSecret(tenant.horsepayWebhookSecretEnc);
  } catch (err) {
    console.error("[horsepay webhook] falha ao decriptar o segredo:", err);
    return null;
  }
}
