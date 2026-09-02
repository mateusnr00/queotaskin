// Auto-award: depois que um lote de tickets vai pra PAID, transiciona pra
// AWARDED os que casarem com algum AwardedTicket cadastrado pra rifa
// (sistema de "títulos premiados", números específicos que valem prêmio
// instantâneo). Idempotente: tickets que já estão AWARDED não mexem.
//
// Chamado por:
// - Webhook do gateway quando transiciona reservation pra PAID
// - markReservationPaidAction (admin)
// - Auto-cura de rifa grátis (comprovante page)

import { prisma } from "@/lib/db";
import { compraCasaComSaida } from "@/lib/saida";
import { dddDoTelefone } from "@/lib/cpf";

export async function autoAwardTicketsForReservation(
  reservationId: string,
): Promise<number[]> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      paidAt: true,
      createdAt: true,
      participantPhone: true,
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
    select: {
      number: true,
      saidaTitulosDe: true,
      saidaTitulosAte: true,
      saidaDataDe: true,
      saidaDataAte: true,
      saidaDdds: true,
    },
  });
  if (awarded.length === 0) return [];

  // CONDIÇÕES DA COMPRA, QUANDO HOUVER.
  //
  // Aqui não existe ponto de saída em porcentagem: o número já é o
  // agendamento. O que existe é para QUAL COMPRA o número paga, e serve ao
  // disparo com hora marcada. Sem nenhuma condição gravada, que é como toda
  // linha antiga está, o comportamento é o de sempre: comprou, ganhou.
  const compra = {
    titulos: reservation.tickets.length,
    quando: reservation.paidAt ?? reservation.createdAt,
    ddd: dddDoTelefone(reservation.participantPhone),
  };
  const validos = awarded.filter((a) =>
    compraCasaComSaida(
      {
        tipo: "PERSONALIZADO",
        emTitulos: null,
        titulosDe: a.saidaTitulosDe,
        titulosAte: a.saidaTitulosAte,
        dataDe: a.saidaDataDe,
        dataAte: a.saidaDataAte,
        ddds: a.saidaDdds,
      },
      compra,
    ),
  );
  if (validos.length === 0) return [];

  const awardedNumbers = new Set(validos.map((a) => a.number));
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
