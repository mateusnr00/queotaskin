// Cron de RECUPERACAO de liquidacao atrasada (settlement lag) - GATE 10K.
//
// Reverifica, de forma SEGURA e limitada, pagamentos PENDING que ja receberam
// um sinal de pagamento AUTENTICADO (webhook HMAC valido) mas cujo S2S ainda
// estava pendente na hora. Cada tentativa passa pelo MESMO choke point
// (verifyPayment server-to-server -> politica de tier -> FSM), entao o cron
// NUNCA aprova por conta propria: quem decide e a FSM, subordinada ao Financial
// Maintenance Guard e ao kill switch. HORSEPAY so aprova com status=paid +
// valor exato + identidade; o webhook segue sendo apenas gatilho.
//
// Seguranca de acesso identica aos demais crons: exige
// `Authorization: Bearer <CRON_SECRET>`, que o Vercel Cron envia sozinho. Em
// producao o segredo e OBRIGATORIO - sem ele, fail-closed (401). Nenhum dado
// financeiro vem da request: externalId e valor sao sempre lidos do banco.

import { NextRequest, NextResponse } from "next/server";

import { reverificarPagamentosComLag } from "@/server/services/reconciliacao-pagamentos";

// Teto conservador por passada: o proprio verifyPayment tem timeout de 10s por
// consulta, e o lote limitado mantem a execucao dentro do orcamento do
// serverless. O backoff + "mais antigos primeiro" garantem justica entre as
// passadas quando ha mais itens do que o teto.
const LOTE_MAXIMO = 25;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      console.error(
        "[cron reconciliar-pagamentos] CRON_SECRET nao configurada em producao.",
      );
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else if (auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const r = await reverificarPagamentosComLag({ limite: LOTE_MAXIMO });
    // Observabilidade REDIGIDA: so contadores agregados. Nunca externalId,
    // valor, PII, token ou payload.
    console.info(
      JSON.stringify({ evento: "RECONCILIACAO_LAG", ...r, ts: new Date().toISOString() }),
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    console.error("[cron reconciliar-pagamentos]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
