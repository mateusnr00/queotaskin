import type { DeliveryStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { toSkinPrize } from "@/lib/prize-mapper";
import type { SkinPrize } from "@/components/cs2/skin-card";

export interface Delivery {
  raffleId: string;
  raffleSlug: string;
  raffleTitle: string;
  ticketNumber: number;
  /** Quantos títulos a campanha tem. Decide as casas do número exibido. */
  totalNumbers: number;
  drawnAt: Date | null;
  note: string | null;
  status: DeliveryStatus;
  /** Quando a skin de fato saiu. Só existe em ENVIADO. */
  deliveredAt: Date | null;
  deliveryNote: string | null;
  /** Quanto saiu do caixa para comprar a skin. Nulo é "ainda não anotado". */
  deliveryCost: number | null;
  /** O PTAX do dia desta entrega. Nulo = converte pela taxa do painel. */
  deliveryFxRate: number | null;
  /** O dia do boletim que gerou deliveryFxRate. */
  deliveryFxDate: Date | null;
  /** De onde a taxa veio: "PTAX" ou "AWESOMEAPI". */
  deliveryFxSource: string | null;
  /** Nome de quem marcou, quando a conta ainda existe. */
  deliveredBy: string | null;
  /** Fora da fila desde quando. Nulo é entrega ativa. */
  arquivadaEm: Date | null;
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
 *
 * Quando esse caminho não fecha, o SORTEIO responde. `Draw` guarda o
 * ganhador na hora em que ele saiu (nome e id de usuário), e é a fonte
 * canônica do resultado: título apagado, reserva estornada ou banco limpo
 * deixavam a entrega órfã, exibindo "sem link de troca" para quem tinha o
 * link cadastrado. A fila é a lista de skins que alguém precisa enviar, e
 * ela não pode perder o destinatário porque uma linha auxiliar sumiu.
 */
export async function listDeliveries(
  tenantId: string,
  { arquivadas = false }: { arquivadas?: boolean } = {},
): Promise<Delivery[]> {
  const raffles = await prisma.raffle.findMany({
    where: {
      tenantId,
      winnerTicketNumber: { not: null },
      entregaArquivadaEm: arquivadas ? { not: null } : null,
    },
    // Pendente primeiro, e dentro de cada grupo o mais recente no topo.
    // A fila existe para dizer o que falta fazer; o que já saiu é histórico e
    // não pode empurrar o trabalho de hoje para o fim da página.
    // CRONOLÓGICA, do sorteio mais recente para o mais antigo.
    //
    // Antes vinha pendente primeiro, e isso embaralhava a leitura: uma entrega
    // saía do lugar assim que era marcada, e a pessoa perdia de vista onde
    // estava. Quem quer só o que falta usa o seletor de status; a ordem da
    // lista é a do tempo, que não muda quando se mexe numa linha.
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

  // O SOCORRO: para quem não achou título, o ganhador vem do sorteio.
  const semTitulo = raffles.filter((r) => !ticketByRaffle.has(r.id));
  const sorteios = semTitulo.length
    ? await prisma.draw.findMany({
        where: { raffleId: { in: semTitulo.map((r) => r.id) } },
        select: { raffleId: true, winnerName: true, winnerUserId: true },
      })
    : [];
  const idsDeGanhador = [
    ...new Set(sorteios.map((d) => d.winnerUserId).filter((v): v is string => !!v)),
  ];
  const contaDoGanhador = new Map(
    idsDeGanhador.length
      ? (
          await prisma.user.findMany({
            where: { id: { in: idsDeGanhador } },
            select: {
              id: true,
              name: true,
              steamTradeUrl: true,
              steamId: true,
              email: true,
              phone: true,
            },
          })
        ).map((u) => [u.id, u])
      : [],
  );
  const sorteioPorRifa = new Map(sorteios.map((d) => [d.raffleId, d]));

  // Os nomes de quem marcou entrega, numa query só. `deliveredById` não tem
  // relação declarada de propósito (ver o schema), então a busca é manual e
  // um id órfão simplesmente não vira nome, em vez de quebrar a tela.
  const idsDeQuemEntregou = [
    ...new Set(
      raffles.map((r) => r.deliveredById).filter((v): v is string => !!v),
    ),
  ];
  const nomePorId = new Map(
    idsDeQuemEntregou.length > 0
      ? (
          await prisma.user.findMany({
            where: { id: { in: idsDeQuemEntregou } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name])
      : [],
  );

  return raffles.map((raffle) => {
    const ticket = ticketByRaffle.get(raffle.id);
    const reservation = ticket?.reservation ?? null;
    const sorteio = reservation ? null : sorteioPorRifa.get(raffle.id);
    const conta = sorteio?.winnerUserId
      ? (contaDoGanhador.get(sorteio.winnerUserId) ?? null)
      : null;

    return {
      raffleId: raffle.id,
      raffleSlug: raffle.slug,
      raffleTitle: raffle.title,
      ticketNumber: raffle.winnerTicketNumber!,
      totalNumbers: raffle.totalNumbers,
      drawnAt: raffle.winnerDrawnAt,
      note: raffle.winnerNote,
      status: raffle.deliveryStatus,
      deliveredAt: raffle.deliveredAt,
      deliveryNote: raffle.deliveryNote,
      // Decimal do Prisma não atravessa a fronteira servidor/cliente, então
      // vira número aqui, no mesmo lugar em que todo o resto é normalizado.
      deliveryCost:
        raffle.deliveryCost != null ? Number(raffle.deliveryCost) : null,
      deliveryFxRate:
        raffle.deliveryFxRate != null ? Number(raffle.deliveryFxRate) : null,
      deliveryFxDate: raffle.deliveryFxDate,
      deliveryFxSource: raffle.deliveryFxSource,
      deliveredBy: raffle.deliveredById
        ? (nomePorId.get(raffle.deliveredById) ?? null)
        : null,
      arquivadaEm: raffle.entregaArquivadaEm,
      winner: reservation
        ? {
            reservationId: reservation.id,
            name: reservation.participantName,
            phone:
              reservation.participantPhone ?? reservation.user?.phone ?? null,
            email:
              reservation.participantEmail ?? reservation.user?.email ?? null,
            userId: reservation.user?.id ?? null,
            steamTradeUrl: reservation.user?.steamTradeUrl ?? null,
            steamId: reservation.user?.steamId ?? null,
          }
        : conta
          ? {
              // Sem reserva não há comprovante para abrir, e o campo é a
              // chave dele. Vazio aqui vira "sem comprovante" na tela, que
              // é a verdade: a compra não está mais lá.
              reservationId: "",
              name: conta.name,
              phone: conta.phone,
              email: conta.email,
              userId: conta.id,
              steamTradeUrl: conta.steamTradeUrl,
              steamId: conta.steamId,
            }
          : sorteio?.winnerName
            ? {
                // Ganhador sem conta vinculada: o nome do sorteio é tudo o
                // que existe, e ainda assim é melhor que uma linha vazia.
                reservationId: "",
                name: sorteio.winnerName,
                phone: null,
                email: null,
                userId: null,
                steamTradeUrl: null,
                steamId: null,
              }
            : null,
      prizes: raffle.prizes.map(toSkinPrize),
    };
  });
}
