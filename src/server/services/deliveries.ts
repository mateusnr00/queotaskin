import { prisma } from "@/lib/db";
import { toSkinPrize } from "@/lib/prize-mapper";
import type { SkinPrize } from "@/components/cs2/skin-card";

export interface Delivery {
  raffleId: string;
  raffleSlug: string;
  raffleTitle: string;
  ticketNumber: number;
  drawnAt: Date | null;
  note: string | null;
  /** Comprador do número sorteado. Nulo se o título não foi vendido. */
  winner: {
    reservationId: string;
    name: string;
    phone: string | null;
    email: string | null;
    userId: string | null;
    steamTradeUrl: string | null;
    steamId: string | null;
  } | null;
  prizes: SkinPrize[];
}

/**
 * Fila de entregas: toda campanha do tenant com ganhador declarado, com os
 * dados de quem comprou o número e o link de troca da Steam dele.
 *
 * O ganhador é resolvido pelo caminho winnerTicketNumber → Ticket → Reservation
 * → User. O link de troca vem do User quando a reserva tem conta associada,
 * reservas de convidado não têm para onde enviar, e a tela sinaliza isso.
 */
export async function listDeliveries(tenantId: string): Promise<Delivery[]> {
  const raffles = await prisma.raffle.findMany({
    where: { tenantId, winnerTicketNumber: { not: null } },
    orderBy: [{ winnerDrawnAt: "desc" }],
    include: { prizes: { orderBy: { position: "asc" } } },
  });
  if (raffles.length === 0) return [];

  // Uma query só para todos os títulos vencedores, em vez de uma por rifa.
  const winningTickets = await prisma.ticket.findMany({
    where: {
      OR: raffles.map((r) => ({
        raffleId: r.id,
        number: r.winnerTicketNumber!,
      })),
    },
    include: {
      reservation: {
        include: {
          user: {
            select: {
              id: true,
              steamTradeUrl: true,
              steamId: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  const ticketByRaffle = new Map(winningTickets.map((t) => [t.raffleId, t]));

  return raffles.map((raffle) => {
    const ticket = ticketByRaffle.get(raffle.id);
    const reservation = ticket?.reservation ?? null;

    return {
      raffleId: raffle.id,
      raffleSlug: raffle.slug,
      raffleTitle: raffle.title,
      ticketNumber: raffle.winnerTicketNumber!,
      drawnAt: raffle.winnerDrawnAt,
      note: raffle.winnerNote,
      winner: reservation
        ? {
            reservationId: reservation.id,
            name: reservation.participantName,
            phone: reservation.participantPhone ?? reservation.user?.phone ?? null,
            email: reservation.participantEmail ?? reservation.user?.email ?? null,
            userId: reservation.user?.id ?? null,
            steamTradeUrl: reservation.user?.steamTradeUrl ?? null,
            steamId: reservation.user?.steamId ?? null,
          }
        : null,
      prizes: raffle.prizes.map(toSkinPrize),
    };
  });
}
