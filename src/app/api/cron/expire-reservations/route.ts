// Endpoint chamado periodicamente para expirar reservas pendentes.
//
// Roda a cada 5 minutos pelo Vercel Cron (agendado em vercel.json). O tempo
// padrão de reserva é 15 minutos, então o número volta para a venda em no
// máximo 20.
//
// Antes não havia agendamento nenhum, e a reserva só expirava quando alguém
// abria aquela campanha. Campanha sem visita ficava com número preso, e
// número preso é venda que não acontece.
//
// Segurança: exige `Authorization: Bearer <CRON_SECRET>`, que o Vercel Cron
// envia sozinho quando a variável existe no projeto. Em produção o segredo é
// obrigatório: sem ele o endpoint ficaria aberto, e qualquer um poderia
// disparar a expiração à vontade.

import { NextRequest, NextResponse } from "next/server";

import { expireReservations } from "@/server/services/reservations";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Fora de produção segue sem segredo, que é o que permite testar o
    // endpoint localmente. Em produção, recusa: um endpoint de manutenção
    // aberto é convite a chamada de fora.
    if (process.env.VERCEL_ENV === "production") {
      console.error(
        "[cron expire-reservations] CRON_SECRET não configurada em produção."
      );
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else if (auth !== `Bearer ${secret}`) {
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
