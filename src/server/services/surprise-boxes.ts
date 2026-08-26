// Distribuição automática de Caixas Surpresas após pagamento aprovado.
//
// Chamado pelo webhook (SyncPay/CodePay) e pelo markReservationPaidAction
// quando uma reservation vai pra PAID. Idempotente: se já existem
// SurpriseBox pra essa reserva, não cria duplicatas (UNOPENED count vs.
// expectativa do combo).
//
// Lógica:
// 1. Conta quantos tickets PAID/AWARDED a reserva tem.
// 2. Carrega os combos visíveis da rifa.
// 3. Calcula quantas caixas o comprador ganha:
//    - Acumulativo: soma todos os combos com threshold ≤ tickets.
//    - Não acumulativo: pega só o combo com maior threshold ≤ tickets.
// 4. Cria N SurpriseBox em status UNOPENED (não sorteia prêmio ainda,
//    isso só acontece quando o comprador "abre" a caixa).
//
// A abertura em si (sorteio do prêmio, decremento de estoque) fica numa
// server action separada (openSurpriseBoxAction, próxima PR).

import { prisma } from "@/lib/db";

export async function autoGenerateSurpriseBoxesForReservation(
  reservationId: string
): Promise<number> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      raffle: {
        select: {
          surpriseBoxEnabled: true,
          surpriseBoxCombosAccumulative: true,
        },
      },
      _count: {
        select: {
          tickets: { where: { status: { in: ["PAID", "AWARDED"] } } },
        },
      },
    },
  });

  if (!reservation || !reservation.raffle.surpriseBoxEnabled) return 0;
  const ticketCount = reservation._count.tickets;
  if (ticketCount === 0) return 0;

  const combos = await prisma.surpriseBoxCombo.findMany({
    where: { raffleId: reservation.raffleId },
    orderBy: { threshold: "asc" },
    select: { threshold: true, boxCount: true },
  });
  if (combos.length === 0) return 0;

  const eligible = combos.filter((c) => ticketCount >= c.threshold);
  if (eligible.length === 0) return 0;

  const expected = reservation.raffle.surpriseBoxCombosAccumulative
    ? eligible.reduce((sum, c) => sum + c.boxCount, 0)
    : Math.max(...eligible.map((c) => c.boxCount));

  // Idempotência sob concorrência: dois webhooks APPROVED (ou dois polls
  // com force:true) para a mesma reserva podem ler existing=0 ao mesmo tempo
  // e ambos criar o combo inteiro, dobrando os prêmios sem pagamento a mais.
  // Advisory lock por reserva serializa o par count→createMany, o mesmo
  // padrão do crédito de XP (xp.ts). A transação garante o lock por toda a
  // janela; ele é liberado ao fim dela.
  const raffleId = reservation.raffleId;
  return prisma.$transaction(async (tx) => {
    // Forma de dois argumentos (int,int), igual ao lock de XP em xp.ts: casa
    // com a sobrecarga sem cast. O primeiro argumento é um namespace fixo
    // ('surprise_box') pra não colidir com locks de outras features.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext('surprise_box'), hashtext(${reservationId}))
    `;

    const existing = await tx.surpriseBox.count({ where: { reservationId } });
    const toCreate = expected - existing;
    if (toCreate <= 0) return 0;

    await tx.surpriseBox.createMany({
      data: Array.from({ length: toCreate }, () => ({
        raffleId,
        reservationId,
      })),
    });

    return toCreate;
  });
}
