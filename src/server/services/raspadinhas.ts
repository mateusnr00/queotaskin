// Geração das raspadinhas quando o pagamento é confirmado.
//
// Espelha autoGenerateSurpriseBoxesForReservation, inclusive o cadeado. Duas
// confirmações do mesmo pagamento (o webhook e a reconsulta, por exemplo)
// podem ler "zero bilhetes" ao mesmo tempo e criar o lote em dobro, dando
// prêmio sem pagamento. O advisory lock serializa a leitura e a escrita.
//
// O número do bilhete é sequencial por sorteio, e é calculado dentro do mesmo
// cadeado: fora dele, dois lotes simultâneos escolheriam o mesmo número e a
// única de (raffleId, numero) recusaria a gravação.

import { prisma } from "@/lib/db";

export async function gerarRaspadinhasParaReserva(
  reservationId: string
): Promise<number> {
  const reserva = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      raffle: { select: { raspadinhaEnabled: true } },
      _count: {
        select: {
          tickets: { where: { status: { in: ["PAID", "AWARDED"] } } },
        },
      },
    },
  });

  if (!reserva || !reserva.raffle.raspadinhaEnabled) return 0;
  const titulos = reserva._count.tickets;
  if (titulos === 0) return 0;

  const combos = await prisma.raspadinhaCombo.findMany({
    where: { raffleId: reserva.raffleId },
    orderBy: { minimo: "asc" },
    select: { minimo: true, quantidade: true },
  });
  if (combos.length === 0) return 0;

  // O melhor combo alcançado manda, e os combos não se somam: comprar 100
  // títulos dá o combo de 100, não o de 10 mais o de 50 mais o de 100.
  const alcancados = combos.filter((c) => titulos >= c.minimo);
  if (alcancados.length === 0) return 0;
  const esperado = Math.max(...alcancados.map((c) => c.quantidade));

  const raffleId = reserva.raffleId;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext('raspadinha'), hashtext(${reservationId}))
    `;

    const jaTem = await tx.raspadinha.count({ where: { reservationId } });
    const criar = esperado - jaTem;
    if (criar <= 0) return 0;

    // O maior número já usado neste sorteio. Dentro do cadeado, então dois
    // lotes simultâneos não escolhem a mesma faixa.
    const ultimo = await tx.raspadinha.aggregate({
      where: { raffleId },
      _max: { numero: true },
    });
    const inicio = (ultimo._max.numero ?? 0) + 1;

    await tx.raspadinha.createMany({
      data: Array.from({ length: criar }, (_, i) => ({
        raffleId,
        reservationId,
        numero: inicio + i,
      })),
    });

    return criar;
  });
}
