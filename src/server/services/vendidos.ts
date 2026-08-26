import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

// Quantos números de uma campanha já foram vendidos.
//
// Existe porque a pergunta estava respondida em cinco lugares e de três
// jeitos diferentes. A home contava só o que foi pago; a lista de campanhas,
// a página do sorteio e o painel de compras contavam todo ticket, inclusive
// o de reserva não paga; a lista de sorteios do painel contava PAID e
// esquecia AWARDED. A mesma campanha exibia percentuais diferentes conforme
// a página, e uma reserva de dez minutos empurrava a barra como se fosse
// venda.
//
// Vendido é ticket pago. AWARDED entra junto porque é o estado para onde o
// ticket pago vai quando leva um título premiado: continua sendo uma venda,
// só mudou de rótulo.
//
// Ocupado é outra pergunta, e tem outra resposta: inclui o RESERVED. Um
// número reservado não está à venda, então quem decide se ainda dá para
// comprar, e quais números a grade risca, usa contarOcupados. Trocar um pelo
// outro tem consequência real nos dois sentidos: com vendidos, o site
// ofereceria um número que outra pessoa já segura, e a reserva falharia no
// envio; com ocupados, a barra sobe sozinha na reserva e desce quando ela
// expira.

/** O que conta como venda, para usar dentro de um where de Ticket. */
export const VENDIDO = {
  status: { in: ["PAID", "AWARDED"] },
} satisfies Prisma.TicketWhereInput;

export function contarVendidos(raffleId: string): Promise<number> {
  return prisma.ticket.count({ where: { raffleId, ...VENDIDO } });
}

/** Números indisponíveis: pagos, premiados e os presos em reserva aberta. */
export function contarOcupados(raffleId: string): Promise<number> {
  return prisma.ticket.count({ where: { raffleId } });
}

/**
 * Vendidos de várias campanhas numa consulta só, para as listas. Uma
 * consulta por card seria uma ida ao banco por linha da página.
 */
export async function contarVendidosPorRifa(
  raffleIds: string[]
): Promise<Map<string, number>> {
  if (raffleIds.length === 0) return new Map();
  const linhas = await prisma.ticket.groupBy({
    by: ["raffleId"],
    where: { raffleId: { in: raffleIds }, ...VENDIDO },
    _count: { _all: true },
  });
  return new Map(linhas.map((l) => [l.raffleId, l._count._all]));
}
