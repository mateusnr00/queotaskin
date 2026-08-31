import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";

// O número premiado com CONDIÇÕES.
//
// Estes testes existem porque a mudança altera quem ganha dinheiro. O caso que
// eles fixam é o novo: antes, comprar o número premiado sempre pagava; agora
// uma condição pode barrar, e um engano aqui ou paga a quem não devia ou nega
// a quem devia. As duas pontas estão cobertas.

let raffleId: string;
let tenantId: string;

/** Uma reserva paga com N títulos, telefone e hora de pagamento. */
async function comprar({
  numeros,
  quando,
  telefone,
}: {
  numeros: number[];
  quando: Date;
  telefone: string | null;
}) {
  const reserva = await prisma.reservation.create({
    data: {
      raffleId,
      status: "PAID",
      participantName: "Comprador de teste",
      participantPhone: telefone,
      totalAmount: String(numeros.length),
      expiresAt: new Date(Date.now() + 3_600_000),
      paidAt: quando,
    },
  });
  await prisma.ticket.createMany({
    data: numeros.map((n) => ({
      raffleId,
      reservationId: reserva.id,
      number: n,
      status: "PAID" as const,
    })),
  });
  return reserva.id;
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("sem tenant no banco de teste");
  tenantId = tenant.id;
  const dono = await prisma.user.findFirst({ select: { id: true } });
  if (!dono) throw new Error("sem usuário no banco de teste");

  const rifa = await prisma.raffle.create({
    data: {
      tenantId,
      createdById: dono.id,
      title: "Campanha de teste do título premiado",
      slug: `teste-titulo-premiado-${Date.now()}`,
      totalNumbers: 1000,
      pricePerNumber: "1.00",
    },
  });
  raffleId = rifa.id;
});

describe("título premiado com condições", () => {
  it("sem condição nenhuma, comprou o número, ganhou", async () => {
    // O comportamento de sempre, e o de toda linha antiga: a migration não
    // gravou condição em ninguém.
    await prisma.awardedTicket.create({
      data: { raffleId, number: 10, prizeDescription: "R$ 100" },
    });
    const r = await comprar({
      numeros: [10],
      quando: new Date(),
      telefone: "62998110279",
    });
    expect(await autoAwardTicketsForReservation(r)).toEqual([10]);
  });

  it("compra menor que o mínimo NÃO leva o número premiado", async () => {
    await prisma.awardedTicket.create({
      data: {
        raffleId,
        number: 20,
        prizeDescription: "R$ 200",
        saidaTitulosDe: 10,
      },
    });
    const r = await comprar({
      numeros: [20],
      quando: new Date(),
      telefone: "62998110279",
    });
    expect(await autoAwardTicketsForReservation(r)).toEqual([]);
    // E o bilhete continua PAGO, não premiado: o número foi comprado, só não
    // pagou prêmio.
    const t = await prisma.ticket.findFirst({
      where: { raffleId, number: 20 },
      select: { status: true },
    });
    expect(t?.status).toBe("PAID");
  });

  it("compra que alcança o mínimo leva", async () => {
    await prisma.awardedTicket.create({
      data: {
        raffleId,
        number: 30,
        prizeDescription: "R$ 300",
        saidaTitulosDe: 3,
      },
    });
    const r = await comprar({
      numeros: [30, 31, 32],
      quando: new Date(),
      telefone: "62998110279",
    });
    expect(await autoAwardTicketsForReservation(r)).toEqual([30]);
  });

  it("o caso do disparo: compra antes da hora não leva, depois leva", async () => {
    // WhatsApp às 14h. O número espera a compra que veio do disparo.
    const asDuas = new Date("2026-08-31T17:00:00Z"); // 14h de Brasília
    await prisma.awardedTicket.create({
      data: {
        raffleId,
        number: 40,
        prizeDescription: "R$ 400",
        saidaDataDe: asDuas,
      },
    });
    const deManha = await comprar({
      numeros: [40],
      quando: new Date("2026-08-31T13:00:00Z"),
      telefone: "62998110279",
    });
    expect(await autoAwardTicketsForReservation(deManha)).toEqual([]);

    // O mesmo número, comprado depois da hora. Precisa liberar o bilhete
    // antes, porque o número é único por campanha.
    await prisma.ticket.deleteMany({ where: { raffleId, number: 40 } });
    const depois = await comprar({
      numeros: [40],
      quando: new Date("2026-08-31T18:00:00Z"),
      telefone: "62998110279",
    });
    expect(await autoAwardTicketsForReservation(depois)).toEqual([40]);
  });

  it("DDD de fora da lista não leva; de dentro leva", async () => {
    await prisma.awardedTicket.create({
      data: {
        raffleId,
        number: 50,
        prizeDescription: "R$ 500",
        saidaDdds: ["11"],
      },
    });
    const deGoias = await comprar({
      numeros: [50],
      quando: new Date(),
      telefone: "62998110279",
    });
    expect(await autoAwardTicketsForReservation(deGoias)).toEqual([]);

    await prisma.ticket.deleteMany({ where: { raffleId, number: 50 } });
    const deSaoPaulo = await comprar({
      numeros: [50],
      quando: new Date(),
      telefone: "11987654321",
    });
    expect(await autoAwardTicketsForReservation(deSaoPaulo)).toEqual([50]);
  });

  it("um número barrado não impede outro da mesma compra de pagar", async () => {
    // A condição é por número. Sem isto, uma compra com dois premiados, um
    // deles condicionado, perderia os dois.
    await prisma.awardedTicket.createMany({
      data: [
        { raffleId, number: 60, prizeDescription: "livre" },
        {
          raffleId,
          number: 61,
          prizeDescription: "condicionado",
          saidaTitulosDe: 100,
        },
      ],
    });
    const r = await comprar({
      numeros: [60, 61],
      quando: new Date(),
      telefone: "62998110279",
    });
    expect(await autoAwardTicketsForReservation(r)).toEqual([60]);
  });
});
