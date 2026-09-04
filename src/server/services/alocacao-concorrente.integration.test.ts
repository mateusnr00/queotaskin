import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { alocarPremiosDaReserva } from "@/server/services/alocacao";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { integracaoLiberada } from "@/test/integration-setup";

const __suiteIntegra = integracaoLiberada ? describe : describe.skip;

// DUAS COMPRAS DA MESMA CAMPANHA CONFIRMANDO JUNTAS.
//
// O outro arquivo de integração cobre uma compra de cada vez. O que se
// verifica aqui é outra coisa, e é a que só aparece com duas conexões de
// verdade batendo no mesmo banco: a ORDEM COMERCIAL. Não basta que nenhum
// prêmio saia duas vezes; cada ponto de saída tem que pertencer à compra que
// efetivamente atravessou aquele ponto.
//
// O cenário de referência, repetido em quase todos os testes:
//
//   40 vendidos, A compra 15, B compra 15, prêmios em 45, 52, 58 e 67.
//   A confirma primeiro: intervalo (40, 55], leva 45 e 52.
//   B confirma depois:   intervalo (55, 70], leva 58 e 67.
//
// O que decide quem é "primeiro" é o carimbo de pagamento no banco, e não a
// ordem em que os processos acordaram: dois webhooks chegando no mesmo
// milissegundo precisam produzir a mesma divisão que duas compras separadas
// por uma hora.

let tenantId: string;
let donoId: string;

async function novaCampanha(total = 100) {
  return prisma.raffle.create({
    data: {
      tenantId,
      createdById: donoId,
      title: `Concorrência ${Date.now()}-${Math.random()}`,
      slug: `concorrencia-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      totalNumbers: total,
      pricePerNumber: "1.00",
      status: "ACTIVE",
      surpriseBoxEnabled: true,
    },
    select: { id: true },
  });
}

/** Caixas por compra: qualquer compra ganha `quantas`. */
async function combo(raffleId: string, quantas: number) {
  await prisma.surpriseBoxCombo.create({
    data: { raffleId, threshold: 1, boxCount: quantas, visible: true },
  });
}

/** Prêmios com ponto de saída em títulos. O rótulo é o próprio ponto. */
async function premiosNosPontos(raffleId: string, pontos: number[]) {
  await prisma.surpriseBoxPrize.createMany({
    data: pontos.map((ponto) => ({
      raffleId,
      title: "Caixa",
      prize: `Ponto ${ponto}`,
      tipoDeSaida: "PROGRESSO" as const,
      saidaEmTitulos: ponto,
      saidaDdds: [],
    })),
  });
}

let proximoNumero = 1;

/**
 * Uma compra já paga, com carimbo controlado.
 *
 * `quando` é o que dá a ordem objetiva entre duas confirmações simultâneas, e
 * por isso é parâmetro: o teste precisa poder dizer quem pagou primeiro sem
 * depender de qual `await` o Node resolveu antes.
 */
async function comprarPago(
  raffleId: string,
  titulos: number,
  quando: Date,
  nome = "Comprador",
) {
  const reserva = await prisma.reservation.create({
    data: {
      raffleId,
      status: "PAID",
      participantName: nome,
      participantPhone: "62998110279",
      totalAmount: String(titulos),
      paidAt: quando,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    select: { id: true },
  });
  await prisma.ticket.createMany({
    data: Array.from({ length: titulos }, (_, i) => ({
      raffleId,
      reservationId: reserva.id,
      number: proximoNumero + i,
      status: "PAID" as const,
      paidAt: quando,
    })),
  });
  proximoNumero += titulos;
  return reserva.id;
}

/** Só os títulos vendidos, sem compra sob teste: o "40 já vendidos". */
async function venderAvulso(raffleId: string, titulos: number, quando: Date) {
  return comprarPago(raffleId, titulos, quando, "Venda anterior");
}

/** O que ficou gravado numa compra: intervalo e prêmios capturados. */
async function resultado(reservationId: string) {
  const caixas = await prisma.surpriseBox.findMany({
    where: { reservationId },
    select: {
      vendidosAntes: true,
      vendidosNaSaida: true,
      prize: { select: { saidaEmTitulos: true } },
    },
  });
  return {
    caixas: caixas.length,
    antes: caixas[0]?.vendidosAntes ?? null,
    depois: caixas[0]?.vendidosNaSaida ?? null,
    pontos: caixas
      .map((c) => c.prize?.saidaEmTitulos)
      .filter((p): p is number => p != null)
      .sort((a, b) => a - b),
  };
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("sem tenant no banco de teste");
  tenantId = tenant.id;
  const dono = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!dono) throw new Error("sem admin no banco de teste");
  donoId = dono.id;
});

beforeEach(() => {
  proximoNumero = 1;
});

__suiteIntegra("cenário 1: duas compras, mesma campanha, ao mesmo tempo", () => {
  it("cada ponto vai para a compra que o atravessou", async () => {
    const rifa = await novaCampanha();
    await combo(rifa.id, 8);
    await premiosNosPontos(rifa.id, [45, 52, 58, 67]);

    const agora = Date.now();
    await venderAvulso(rifa.id, 40, new Date(agora - 60_000));
    const a = await comprarPago(rifa.id, 15, new Date(agora - 2_000), "A");
    const b = await comprarPago(rifa.id, 15, new Date(agora - 1_000), "B");

    // Os dois pagamentos já estão gravados quando as duas alocações começam.
    // É esta a corrida real: o webhook de A e o de B confirmam juntos, e as
    // duas transações leem a venda da campanha depois de ambas terem subido.
    await Promise.all([
      autoGenerateSurpriseBoxesForReservation(a),
      autoGenerateSurpriseBoxesForReservation(b),
    ]);

    const rA = await resultado(a);
    const rB = await resultado(b);

    expect(rA.caixas).toBe(8);
    expect(rB.caixas).toBe(8);

    // O intervalo de cada uma, que é o que o painel mostra como "saiu em X%".
    expect(rA.antes).toBe(40);
    expect(rA.depois).toBe(55);
    expect(rB.antes).toBe(55);
    expect(rB.depois).toBe(70);

    // E a divisão comercial dos pontos.
    expect(rA.pontos).toEqual([45, 52]);
    expect(rB.pontos).toEqual([58, 67]);
  });

  it("o resultado é o mesmo quando elas confirmam separadas", async () => {
    // A prova de que a corrida não muda nada: o mesmo cenário, uma de cada
    // vez, tem que dar exatamente a mesma divisão.
    const rifa = await novaCampanha();
    await combo(rifa.id, 8);
    await premiosNosPontos(rifa.id, [45, 52, 58, 67]);

    const agora = Date.now();
    await venderAvulso(rifa.id, 40, new Date(agora - 60_000));
    const a = await comprarPago(rifa.id, 15, new Date(agora - 2_000), "A");
    await autoGenerateSurpriseBoxesForReservation(a);
    const b = await comprarPago(rifa.id, 15, new Date(agora - 1_000), "B");
    await autoGenerateSurpriseBoxesForReservation(b);

    expect(await resultado(a)).toMatchObject({
      antes: 40,
      depois: 55,
      pontos: [45, 52],
    });
    expect(await resultado(b)).toMatchObject({
      antes: 55,
      depois: 70,
      pontos: [58, 67],
    });
  });

  it("nenhum prêmio sai duas vezes, em nenhuma das ordens", async () => {
    const rifa = await novaCampanha();
    await combo(rifa.id, 8);
    await premiosNosPontos(rifa.id, [45, 52, 58, 67]);

    const agora = Date.now();
    await venderAvulso(rifa.id, 40, new Date(agora - 60_000));
    const a = await comprarPago(rifa.id, 15, new Date(agora - 2_000), "A");
    const b = await comprarPago(rifa.id, 15, new Date(agora - 1_000), "B");

    await Promise.all([
      autoGenerateSurpriseBoxesForReservation(b),
      autoGenerateSurpriseBoxesForReservation(a),
    ]);

    const premiadas = await prisma.surpriseBox.findMany({
      where: { raffleId: rifa.id, prizeId: { not: null } },
      select: { prizeId: true },
    });
    expect(new Set(premiadas.map((p) => p.prizeId)).size).toBe(
      premiadas.length,
    );
    expect(premiadas).toHaveLength(4);
  });
});

__suiteIntegra("cenário 2: três compras simultâneas", () => {
  it("divide os pontos pelos três intervalos", async () => {
    const rifa = await novaCampanha();
    await combo(rifa.id, 6);
    // 40 vendidos; A 10 (40→50), B 10 (50→60), C 10 (60→70).
    await premiosNosPontos(rifa.id, [45, 52, 58, 67]);

    const agora = Date.now();
    await venderAvulso(rifa.id, 40, new Date(agora - 60_000));
    const a = await comprarPago(rifa.id, 10, new Date(agora - 3_000), "A");
    const b = await comprarPago(rifa.id, 10, new Date(agora - 2_000), "B");
    const c = await comprarPago(rifa.id, 10, new Date(agora - 1_000), "C");

    await Promise.all([
      autoGenerateSurpriseBoxesForReservation(a),
      autoGenerateSurpriseBoxesForReservation(b),
      autoGenerateSurpriseBoxesForReservation(c),
    ]);

    expect(await resultado(a)).toMatchObject({
      antes: 40,
      depois: 50,
      pontos: [45],
    });
    expect(await resultado(b)).toMatchObject({
      antes: 50,
      depois: 60,
      pontos: [52, 58],
    });
    expect(await resultado(c)).toMatchObject({
      antes: 60,
      depois: 70,
      pontos: [67],
    });
  });
});

__suiteIntegra("cenário 3: os dois webhooks disparam a alocação juntos", () => {
  it("e cada um ainda leva o que atravessou", async () => {
    // A diferença para o cenário 1 é o caminho: aqui entra pela função que os
    // webhooks chamam de fato, com a criação das caixas junto.
    const rifa = await novaCampanha();
    await combo(rifa.id, 5);
    await premiosNosPontos(rifa.id, [45, 58]);

    const agora = Date.now();
    await venderAvulso(rifa.id, 40, new Date(agora - 60_000));
    const a = await comprarPago(rifa.id, 15, new Date(agora - 2_000), "A");
    const b = await comprarPago(rifa.id, 15, new Date(agora - 1_000), "B");

    // Quatro chamadas: cada webhook entregue duas vezes, que é o normal.
    await Promise.all([
      autoGenerateSurpriseBoxesForReservation(a),
      autoGenerateSurpriseBoxesForReservation(b),
      autoGenerateSurpriseBoxesForReservation(a),
      autoGenerateSurpriseBoxesForReservation(b),
    ]);

    expect(await resultado(a)).toMatchObject({ pontos: [45] });
    expect(await resultado(b)).toMatchObject({ pontos: [58] });
    expect(
      await prisma.surpriseBox.count({ where: { raffleId: rifa.id } }),
    ).toBe(10);
  });
});

__suiteIntegra("cenário 4: webhook de uma e aprovação manual da outra", () => {
  it("os dois caminhos respeitam a mesma ordem", async () => {
    const rifa = await novaCampanha();
    await combo(rifa.id, 5);
    await premiosNosPontos(rifa.id, [45, 58]);

    const agora = Date.now();
    await venderAvulso(rifa.id, 40, new Date(agora - 60_000));
    const a = await comprarPago(rifa.id, 15, new Date(agora - 2_000), "A");
    const b = await comprarPago(rifa.id, 15, new Date(agora - 1_000), "B");

    // O painel cria as caixas pelo mesmo serviço; o que muda é quem chama.
    await Promise.all([
      autoGenerateSurpriseBoxesForReservation(a),
      (async () => {
        await autoGenerateSurpriseBoxesForReservation(b);
        // E a retomada do que porventura tenha ficado pendente, que é o que o
        // botão "Conferir e entregar" faz.
        await alocarPremiosDaReserva(b, "CAIXA");
      })(),
    ]);

    expect(await resultado(a)).toMatchObject({ pontos: [45] });
    expect(await resultado(b)).toMatchObject({ pontos: [58] });
  });
});

__suiteIntegra("cenário 5: uma transação demora segurando os prêmios", () => {
  it("a outra espera a vez e não rouba o ponto da primeira", async () => {
    const rifa = await novaCampanha();
    await combo(rifa.id, 5);
    await premiosNosPontos(rifa.id, [45, 58]);

    const agora = Date.now();
    await venderAvulso(rifa.id, 40, new Date(agora - 60_000));
    const a = await comprarPago(rifa.id, 15, new Date(agora - 2_000), "A");
    const b = await comprarPago(rifa.id, 15, new Date(agora - 1_000), "B");

    // B entra primeiro no relógio, mas A é a primeira na ordem de pagamento.
    // Uma transação lenta em cima da campanha (segurando as linhas dos
    // prêmios) roda no meio, para provar que ninguém passa por cima.
    const lenta = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM "SurpriseBoxPrize" WHERE "raffleId" = ${rifa.id} FOR UPDATE`;
        await new Promise((r) => setTimeout(r, 300));
        return null;
      },
      { timeout: 20_000 },
    );

    const [, , ,] = await Promise.all([
      autoGenerateSurpriseBoxesForReservation(b),
      autoGenerateSurpriseBoxesForReservation(a),
      lenta,
    ]);

    expect(await resultado(a)).toMatchObject({ pontos: [45] });
    expect(await resultado(b)).toMatchObject({ pontos: [58] });
  });
});
