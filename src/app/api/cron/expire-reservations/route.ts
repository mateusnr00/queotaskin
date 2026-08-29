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

import { registrarLog } from "@/server/services/activity-log";
import { limparLogsAntigos } from "@/server/services/activity-log-query";
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

    // Uma linha por EXECUÇÃO, não por reserva, e só quando expirou alguma
    // coisa. Uma linha por reserva somaria centenas de registros por dia
    // sobre um evento que ninguém investiga individualmente, e uma linha a
    // cada cinco minutos dizendo "expirei zero" seria pior ainda.
    //
    // Sem tenantId de propósito: o cron varre todos os painéis de uma vez,
    // então não existe um tenant a atribuir. Como a consulta do histórico
    // filtra por tenant, esse registro só aparece para o SUPER_ADMIN, e essa
    // é a escolha certa, evento de manutenção da plataforma, não de um
    // painel específico.
    if (result.expired > 0) {
      await registrarLog({
        acao: "reservas.expiradas",
        origem: "SISTEMA",
        ator: { nome: "Rotina de expiração" },
        detalhes: { quantidade: result.expired },
      });
    }

    // A limpeza vai num catch próprio: a expiração acima já devolveu números
    // ao estoque, e deixar uma falha de manutenção virar 500 faria a Vercel
    // repetir um trabalho que já deu certo. Aqui o erro aparece no log da
    // função e a resposta segue contando o que a expiração fez.
    let logsApagados: number | null = null;
    try {
      logsApagados = (await limparLogsAntigos()).apagados;
    } catch (err) {
      console.error("[cron expire-reservations] limparLogsAntigos falhou:", err);
    }

    return NextResponse.json({ ok: true, ...result, logsApagados });
  } catch (err) {
    console.error("[cron expire-reservations]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
