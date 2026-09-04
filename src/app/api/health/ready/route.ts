import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

// READINESS (§19): dependencias essenciais para receber trafego com seguranca.
// Confere conectividade do banco com um SELECT 1. NAO expoe DB URL, versao
// sensivel, stack ou env. Falha de gateway externo NAO derruba o readiness (o
// site continua no ar; pagamento fica PENDING/reconciliavel - politica §30).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ ready: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    // Resposta minima, sem detalhe do erro (nao vaza internals).
    return NextResponse.json({ ready: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
