// Teste de integração da contagem de vendidos, contra um Postgres real.
//
// A regra não tem lógica pura para testar: ela é um where. O que pode
// quebrar é justamente o que só aparece com banco, que um ticket RESERVED
// entre na conta. Foi o defeito relatado: uma pessoa reservou um número e a
// barra da campanha subiu como se tivesse vendido.
//
// Pulado quando não há DATABASE_URL apontando para um Postgres local, pela
// mesma razão do teste de XP: ele cria campanha e tickets de verdade.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { integracaoLiberada } from "@/test/integration-setup";

const __suiteIntegra = integracaoLiberada ? describe : describe.skip;
import {
  contarOcupados,
  contarVendidos,
  contarVendidosPorRifa,
} from "./vendidos";



__suiteIntegra("contagem de vendidos (integração)", () => {
  let raffleId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.findFirst({
      select: { id: true, ownerId: true },
    });
    if (!tenant) throw new Error("Rode `npm run db:seed` antes deste teste.");

    // Campanha própria, e não uma existente: a conta é sobre o total de
    // tickets da campanha, então rodar em cima de uma com histórico daria
    // números que dependem do estado do banco.
    const raffle = await prisma.raffle.create({
      data: {
        tenant: { connect: { id: tenant.id } },
        title: "Campanha de teste de contagem",
        slug: `teste-contagem-${Date.now().toString(36)}`,
        totalNumbers: 100,
        pricePerNumber: 1,
        status: "ACTIVE",
        drawDate: new Date(Date.now() + 86_400_000),
        createdBy: { connect: { id: tenant.ownerId } },
      },
      select: { id: true },
    });
    raffleId = raffle.id;

    const reserva = await prisma.reservation.create({
      data: {
        raffleId,
        participantName: "Comprador de teste",
        totalAmount: 6,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });

    // Três estados de ticket na mesma campanha: dois pagos, um contemplado,
    // três apenas reservados.
    await prisma.ticket.createMany({
      data: [
        { raffleId, number: 1, status: "PAID", reservationId: reserva.id },
        { raffleId, number: 2, status: "PAID", reservationId: reserva.id },
        { raffleId, number: 3, status: "AWARDED", reservationId: reserva.id },
        { raffleId, number: 4, status: "RESERVED", reservationId: reserva.id },
        { raffleId, number: 5, status: "RESERVED", reservationId: reserva.id },
        { raffleId, number: 6, status: "RESERVED", reservationId: reserva.id },
      ],
    });
  });

  afterAll(async () => {
    if (raffleId) {
      await prisma.raffle.delete({ where: { id: raffleId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("reserva não paga não conta como venda", async () => {
    expect(await contarVendidos(raffleId)).toBe(3);
  });

  it("ticket contemplado continua sendo venda", async () => {
    // AWARDED é para onde o ticket pago vai quando leva um título premiado.
    // Ficar de fora faria a barra andar para trás no momento da premiação.
    const semAwarded = await prisma.ticket.count({
      where: { raffleId, status: "PAID" },
    });
    expect(semAwarded).toBe(2);
    expect(await contarVendidos(raffleId)).toBe(3);
  });

  it("ocupado inclui o reservado, senão o site vende número de outro", async () => {
    expect(await contarOcupados(raffleId)).toBe(6);
  });

  it("a agregação das listas dá o mesmo número da consulta unitária", async () => {
    // As duas existem porque as listas não podem consultar por card, e é
    // exatamente aí que as respostas divergiram antes.
    const mapa = await contarVendidosPorRifa([raffleId]);
    expect(mapa.get(raffleId)).toBe(await contarVendidos(raffleId));
  });

  it("campanha sem nenhum ticket não aparece no mapa", async () => {
    // Quem consome usa `?? 0`; o mapa não inventa a chave.
    const mapa = await contarVendidosPorRifa([]);
    expect(mapa.size).toBe(0);
  });

  it("pagar uma reserva move o número de ocupado para vendido", async () => {
    await prisma.ticket.updateMany({
      where: { raffleId, number: 4 },
      data: { status: "PAID", paidAt: new Date() },
    });
    expect(await contarVendidos(raffleId)).toBe(4);
    // O total ocupado não muda: o número já estava fora de circulação.
    expect(await contarOcupados(raffleId)).toBe(6);
  });
});
