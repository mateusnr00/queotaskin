// Webhook da SigiloPay. Sem assinatura oficial: o token do caminho barra
// desconhecidos, mas NÃO é prova. A prova é a consulta server-to-server que
// `processarWebhookDePagamento` faz pelo externalId gravado. Rota fina.

import { NextResponse } from "next/server";

import { lerWebhook } from "@/lib/sigilopay";
import { processarWebhookDePagamento } from "@/server/services/payment-webhook";

interface RouteParams { params: Promise<{ token: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { token } = await params;
  const esperado = process.env.SIGILOPAY_WEBHOOK_TOKEN;
  if (!esperado || token !== esperado) return new NextResponse("forbidden", { status: 403 });

  const corpoCru = await req.text();
  let payload: unknown;
  try { payload = JSON.parse(corpoCru); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const aviso = lerWebhook(payload);
  if (!aviso?.idDaTransacao) return new NextResponse("ignored", { status: 200 });

  const { desfecho } = await processarWebhookDePagamento({
    evento: { provider: "SIGILOPAY", externalId: aviso.idDaTransacao, statusAfirmado: aviso.status, eventoOficial: null },
    corpoCru, payload, assinaturaValida: null,
  });
  return NextResponse.json({ ok: true, desfecho });
}
