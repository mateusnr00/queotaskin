// Endpoint chamado periodicamente para expirar reservas pendentes.
//
// Como será chamado em produção (escolha uma):
//   1. Vercel Cron (vercel.json), chama esse endpoint a cada N minutos.
//   2. Inngest, quando a conta estiver configurada, mover a lógica para
//      uma função Inngest. Esse endpoint pode permanecer como fallback.
//
// Segurança: o endpoint exige um header `Authorization: Bearer <secret>`
// que bate com CRON_SECRET no .env. Em produção, Vercel Cron envia esse
// header automaticamente quando CRON_SECRET está nas envs do projeto.

import { NextRequest, NextResponse } from "next/server";

import { expireReservations } from "@/server/services/reservations";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  // Em dev, permite chamada sem secret se o secret não estiver configurado.
  if (secret && auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await expireReservations();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron expire-reservations]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
