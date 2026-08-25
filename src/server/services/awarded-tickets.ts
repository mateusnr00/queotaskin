// Auto-award: depois que um lote de tickets vai pra PAID, transiciona pra
// AWARDED os que casarem com algum AwardedTicket cadastrado pra rifa
// (sistema de "títulos premiados" — números específicos que valem prêmio
// instantâneo). Idempotente: tickets que já estão AWARDED não mexem.
//
// Chamado por:
// - Webhook SyncPay/CodePay quando transiciona reservation pra PAID
// - markReservationPaidAction (admin)
// - Auto-cura de rifa grátis (comprovante page)

import { prisma } from "@/lib/db";

export async function autoAwardTicketsForReservation(
  reservationId: string
): Promise<number[]> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      tickets: {
        where: { status: "PAID" },
        select: { id: true, number: true },
      },
    },
  });
  if (!reservation || reservation.tickets.length === 0) return [];

  const numbers = reservation.tickets.map((t) => t.number);
  const awarded = await prisma.awardedTicket.findMany({
    where: { raffleId: reservation.raffleId, number: { in: numbers } },
    select: { number: true },
  });
  if (awarded.length === 0) return [];

  const awardedNumbers = new Set(awarded.map((a) => a.number));
  const ticketsToUpgrade = reservation.tickets
    .filter((t) => awardedNumbers.has(t.number))
    .map((t) => t.id);
  if (ticketsToUpgrade.length === 0) return [];

  await prisma.ticket.updateMany({
    where: { id: { in: ticketsToUpgrade } },
    data: { status: "AWARDED" },
  });

  return [...awardedNumbers].sort((a, b) => a - b);
}
