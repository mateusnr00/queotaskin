// O estado do sorteio ao vivo, para a página se situar.
//
// É a única coisa que a transmissão busca do servidor. Não é um canal aberto:
// é uma pergunta pontual, feita nas viradas de fase e mais nada. A página não
// precisa ser avisada de que a contagem começou, porque o cronograma inteiro
// veio na primeira resposta e ela conta sozinha; o que ela não consegue
// derivar do relógio é o número sorteado, e é por ele que volta aqui.
//
// Duas decisões importam neste arquivo:
//
// - A resposta NUNCA é cacheada. Um proxy guardando o estado por trinta
//   segundos entregaria "faltam 40 segundos" para quem chegou no zero, e no
//   pior caso entregaria o resultado a quem ainda não podia vê-lo.
//
// - O pedido AVANÇA a máquina. Quando a contagem zera com gente assistindo,
//   é este endpoint que dispara o motor, dentro do mesmo segundo. O cron
//   existe para o caso de não ter ninguém olhando, e a transição é a mesma
//   função idempotente nos dois caminhos.

import { NextResponse } from "next/server";

import { idPublicoValido } from "@/lib/sorteio-ao-vivo";
import { carregarEstadoPublico } from "@/server/services/sorteio-ao-vivo";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;

  // Confere o formato antes de ir ao banco. O código vem da URL, e uma
  // consulta por texto arbitrário é trabalho que qualquer um pode mandar
  // fazer de graça.
  if (!idPublicoValido(publicId)) {
    return NextResponse.json(
      { erro: "Sorteio não encontrado" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const estado = await carregarEstadoPublico(publicId);
    if (!estado) {
      return NextResponse.json(
        { erro: "Sorteio não encontrado" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(estado, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("[api sorteio estado]", publicId, err);
    return NextResponse.json(
      { erro: "Erro ao consultar o sorteio" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
