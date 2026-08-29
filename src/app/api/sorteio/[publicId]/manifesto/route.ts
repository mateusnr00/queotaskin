// O manifesto: a lista de títulos que disputaram o sorteio.
//
// É o dado que falta para alguém de fora refazer a conta. Sem ele, a página de
// conferência teria que acreditar no hash que nós mesmos publicamos, e a
// verificação seria teatro: quem confere precisa recalcular o hash A PARTIR
// DOS TÍTULOS, e comparar.
//
// Só números, nunca gente. A lista não diz de quem é cada título, e não
// precisa: o que a prova exige é o conjunto que disputou e a ordem canônica,
// não a identidade de ninguém.
//
// Publicado apenas depois que o número vencedor já é público. Antes disso ele
// não serve para conferir nada (falta a chave), e adiantá-lo só entregaria o
// tamanho exato do bolo para quem quisesse calcular chances antes da hora.

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { idPublicoValido } from "@/lib/sorteio-ao-vivo";
import { titulosCanonicos } from "@/lib/sorteio-justo";
import {
  carregarEstadoPublico,
  VENDIDO_NO_SORTEIO,
} from "@/server/services/sorteio-ao-vivo";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  if (!idPublicoValido(publicId)) {
    return NextResponse.json(
      { erro: "Sorteio não encontrado" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    // Passa pelo estado público de propósito: é ele que decide se o resultado
    // já pode ser mostrado, e a regra de liberação do manifesto tem que ser a
    // mesma, decidida no mesmo lugar.
    const estado = await carregarEstadoPublico(publicId);
    if (!estado) {
      return NextResponse.json(
        { erro: "Sorteio não encontrado" },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    if (!estado.resultado) {
      return NextResponse.json(
        { erro: "O manifesto é publicado junto com o resultado." },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }

    const draw = await prisma.draw.findUniqueOrThrow({
      where: { publicId },
      select: { raffleId: true },
    });
    const bilhetes = await prisma.ticket.findMany({
      where: { raffleId: draw.raffleId, ...VENDIDO_NO_SORTEIO },
      orderBy: { number: "asc" },
      select: { number: true },
    });

    const numeros = titulosCanonicos(bilhetes.map((b) => b.number));

    return NextResponse.json(
      { publicId, total: numeros.length, numeros },
      {
        headers: {
          // O universo está congelado desde o encerramento e o resultado já é
          // público: esta resposta não muda mais. Uma hora de cache tira do
          // servidor a lista inteira a cada conferência.
          "cache-control": "public, max-age=3600",
        },
      },
    );
  } catch (err) {
    console.error("[api manifesto]", publicId, err);
    return NextResponse.json(
      { erro: "Erro ao carregar o manifesto" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
