// A rede de proteção do sorteio ao vivo.
//
// Roda de minuto em minuto (agendado em vercel.json) e faz duas coisas:
// agenda o sorteio das campanhas que encerraram, e empurra para frente as
// transmissões cuja hora já passou.
//
// Não é o mecanismo principal, e essa distinção é o que faz o desenho
// funcionar. Um cron de um minuto não consegue conduzir uma contagem de
// sessenta segundos e uma rolagem de nove: ele acordaria no meio e a página
// ficaria parada no zero. Quem dispara no segundo certo é a própria consulta
// de estado, que roda toda vez que alguém está assistindo. O cron cobre o
// resto: a madrugada sem ninguém na página, o deploy no meio da contagem, o
// servidor que voltou depois da hora.
//
// Como toda transição é idempotente, os dois caminhos podem acontecer juntos
// sem se atrapalhar, e o cron rodando duas vezes no mesmo minuto não sorteia
// duas vezes.
//
// Segurança: mesmo esquema do cron de expiração, `Authorization: Bearer
// <CRON_SECRET>`, que o Vercel Cron envia sozinho. Em produção o segredo é
// obrigatório: sem ele qualquer um poderia ficar chamando a varredura.

import { NextRequest, NextResponse } from "next/server";

import { processarSorteios } from "@/server/services/sorteio-ao-vivo";
import { varrerCronogramas } from "@/server/services/cronograma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      console.error("[cron sorteios] CRON_SECRET não configurada em produção.");
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else if (auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const resultado = await processarSorteios();
    // A fila do cronograma vem DEPOIS, e na mesma passada: o sorteio que
    // acabou de terminar aqui em cima já pode liberar o próximo logo abaixo.
    // Ela cobre o que o gancho do motor não alcança: o intervalo configurado
    // entre sorteios, a campanha encerrada na mão e a nova tentativa depois de
    // uma ativação que falhou.
    const cronograma = await varrerCronogramas();
    return NextResponse.json(
      { ok: true, ...resultado, cronograma },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[cron sorteios]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
