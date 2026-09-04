import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { alocarPremiosDaReserva } from "@/server/services/alocacao";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { gerarRaspadinhasParaReserva } from "@/server/services/raspadinhas";
import { revelarBilhete, revelarCaixa } from "@/server/services/revelacao";
import { integracaoLiberada } from "@/test/integration-setup";

const __suiteIntegra = integracaoLiberada ? describe : describe.skip;

// A alocação de prêmios, contra o banco de verdade.
//
// Estes testes precisam de banco porque o que eles verificam é justamente o
// que não cabe numa função pura: cadeado, transação, corrida entre duas
// confirmações do mesmo pagamento, e o resultado ficar gravado. A distribuição
// em si, quantas unidades recebem prêmio e onde eles caem, está coberta sem
// banco em src/lib/distribuicao.test.ts.

let tenantId: string;
let userId: string;
let raffleId: string;
let proximoNumero = 1;

/** Uma campanha limpa, com o total de títulos que o teste pedir. */
async function novaCampanha(totalNumbers = 100) {
  const rifa = await prisma.raffle.create({
    data: {
      tenantId,
      createdById: userId,
      title: `Alocação ${Date.now()}-${Math.random()}`,
      slug: `alocacao-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      totalNumbers,
      pricePerNumber: "1.00",
      surpriseBoxEnabled: true,
      raspadinhaEnabled: true,
    },
  });
  raffleId = rifa.id;
  proximoNumero = 1;
  return rifa.id;
}

/** Uma compra paga com N títulos, já com os bilhetes PAID. */
async function comprarPago(titulos: number, telefone = "62998110279") {
  const reserva = await prisma.reservation.create({
    data: {
      raffleId,
      status: "PAID",
      participantName: "Comprador de teste",
      participantPhone: telefone,
      totalAmount: String(titulos),
      expiresAt: new Date(Date.now() + 3_600_000),
      paidAt: new Date(),
    },
  });
  if (titulos > 0) {
    await prisma.ticket.createMany({
      data: Array.from({ length: titulos }, (_, i) => ({
        raffleId,
        reservationId: reserva.id,
        number: proximoNumero + i,
        status: "PAID" as const,
        paidAt: new Date(),
      })),
    });
    proximoNumero += titulos;
  }
  return reserva.id;
}

/** Títulos vendidos que não são de nenhuma compra sob teste. */
async function venderAvulso(titulos: number) {
  const reserva = await comprarPago(titulos);
  return reserva;
}

async function premiosDeCaixa(
  quantos: number,
  opcoes: {
    saidaEmTitulos?: number | null;
    locked?: boolean;
    mode?: "RANDOM" | "PERCENT";
    odds?: number;
    tipoDeSaida?: "PROGRESSO" | "PERSONALIZADO";
    saidaDdds?: string[];
  } = {},
) {
  await prisma.surpriseBoxPrize.createMany({
    data: Array.from({ length: quantos }, (_, i) => ({
      raffleId,
      title: "Caixa",
      prize: `Prêmio ${i + 1}`,
      mode: opcoes.mode ?? "RANDOM",
      odds: opcoes.odds != null ? String(opcoes.odds) : null,
      locked: opcoes.locked ?? false,
      tipoDeSaida: opcoes.tipoDeSaida ?? "PROGRESSO",
      saidaEmTitulos:
        opcoes.saidaEmTitulos === undefined ? 1 : opcoes.saidaEmTitulos,
      saidaDdds: opcoes.saidaDdds ?? [],
    })),
  });
}

async function combosDeCaixa(threshold: number, boxCount: number) {
  await prisma.surpriseBoxCombo.create({
    data: { raffleId, threshold, boxCount, visible: true },
  });
}

async function caixasDa(reservationId: string) {
  return prisma.surpriseBox.findMany({
    where: { reservationId },
    select: { id: true, prizeId: true, status: true, alocacao: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("sem tenant no banco de teste");
  tenantId = tenant.id;
  const dono = await prisma.user.findFirst({ select: { id: true } });
  if (!dono) throw new Error("sem usuário no banco de teste");
  userId = dono.id;
});

beforeEach(async () => {
  await novaCampanha();
});

__suiteIntegra("distribuição na compra", () => {
  it("cenário A: 20 caixas e 2 prêmios elegíveis dão exatamente 2 premiadas", async () => {
    await combosDeCaixa(1, 20);
    await premiosDeCaixa(2, { saidaEmTitulos: 19 });
    const reserva = await comprarPago(20);

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas).toHaveLength(20);
    expect(caixas.filter((c) => c.prizeId).length).toBe(2);
    expect(caixas.every((c) => c.alocacao === "ALOCADA")).toBe(true);
    // Nenhum prêmio em duas caixas.
    const ids = caixas.map((c) => c.prizeId).filter(Boolean);
    expect(new Set(ids).size).toBe(2);
  });

  it("cenário B: a compra que atravessa o intervalo captura os dois pontos", async () => {
    // 12 vendidos antes, compra de 25, prêmios em 14 e 32.
    await combosDeCaixa(1, 25);
    await venderAvulso(12);
    await prisma.surpriseBoxPrize.createMany({
      data: [
        {
          raffleId,
          title: "Caixa",
          prize: "Ponto 14",
          saidaEmTitulos: 14,
          saidaDdds: [],
        },
        {
          raffleId,
          title: "Caixa",
          prize: "Ponto 32",
          saidaEmTitulos: 32,
          saidaDdds: [],
        },
      ],
    });
    const reserva = await comprarPago(25);

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas.filter((c) => c.prizeId).length).toBe(2);
    // E o intervalo ficou registrado para conferência posterior.
    const uma = await prisma.surpriseBox.findFirst({
      where: { reservationId: reserva },
      select: { vendidosAntes: true, vendidosNaSaida: true },
    });
    expect(uma?.vendidosAntes).toBe(12);
    expect(uma?.vendidosNaSaida).toBe(37);
  });

  it("cenário C: sem prêmio elegível, nenhuma caixa premiada", async () => {
    await combosDeCaixa(1, 20);
    const reserva = await comprarPago(20);

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas).toHaveLength(20);
    expect(caixas.filter((c) => c.prizeId).length).toBe(0);
    expect(caixas.every((c) => c.alocacao === "ALOCADA")).toBe(true);
  });

  it("cenário D: 5 prêmios elegíveis em 20 caixas dão 5 premiadas, sem repetir", async () => {
    await combosDeCaixa(1, 20);
    await premiosDeCaixa(5);
    const reserva = await comprarPago(20);

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    const premiadas = caixas.filter((c) => c.prizeId);
    expect(premiadas).toHaveLength(5);
    expect(new Set(premiadas.map((c) => c.prizeId)).size).toBe(5);
  });

  it("cenário E: 2 caixas e 2 prêmios premiam as duas", async () => {
    await combosDeCaixa(1, 2);
    await premiosDeCaixa(2);
    const reserva = await comprarPago(5);

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas).toHaveLength(2);
    expect(caixas.filter((c) => c.prizeId).length).toBe(2);
  });

  it("cenário M: prêmio travado nunca é distribuído", async () => {
    await combosDeCaixa(1, 10);
    await premiosDeCaixa(3, { locked: true });
    const reserva = await comprarPago(10);

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas.filter((c) => c.prizeId).length).toBe(0);
    const travados = await prisma.surpriseBoxPrize.count({
      where: { raffleId, locked: true, claimedAt: { not: null } },
    });
    expect(travados).toBe(0);
  });

  it("cenário N: prêmio com ponto ainda não alcançado não entra no bolo", async () => {
    await combosDeCaixa(1, 10);
    await premiosDeCaixa(2, { saidaEmTitulos: 60 });
    const reserva = await comprarPago(10);

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas.filter((c) => c.prizeId).length).toBe(0);
    const livres = await prisma.surpriseBoxPrize.count({
      where: { raffleId, claimedAt: null },
    });
    expect(livres).toBe(2);
  });

  it("cenário O: saída personalizada que casa é considerada na alocação", async () => {
    await combosDeCaixa(1, 5);
    await premiosDeCaixa(1, {
      tipoDeSaida: "PERSONALIZADO",
      saidaEmTitulos: null,
      saidaDdds: ["62"],
    });
    const reserva = await comprarPago(5, "62998110279");

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas.filter((c) => c.prizeId).length).toBe(1);
  });

  it("cenário P: saída personalizada que não casa não é considerada", async () => {
    await combosDeCaixa(1, 5);
    await premiosDeCaixa(1, {
      tipoDeSaida: "PERSONALIZADO",
      saidaEmTitulos: null,
      saidaDdds: ["11"],
    });
    const reserva = await comprarPago(5, "62998110279");

    await autoGenerateSurpriseBoxesForReservation(reserva);

    const caixas = await caixasDa(reserva);
    expect(caixas.filter((c) => c.prizeId).length).toBe(0);
  });
});

__suiteIntegra("idempotência da alocação", () => {
  it("cenário F: webhook duplicado não duplica unidade nem prêmio", async () => {
    await combosDeCaixa(1, 6);
    await premiosDeCaixa(2);
    const reserva = await comprarPago(6);

    await autoGenerateSurpriseBoxesForReservation(reserva);
    const antes = await caixasDa(reserva);

    // A mesma confirmação chegando de novo, como o gateway reenvia.
    await autoGenerateSurpriseBoxesForReservation(reserva);
    await autoGenerateSurpriseBoxesForReservation(reserva);

    const depois = await caixasDa(reserva);
    expect(depois).toHaveLength(6);
    expect(depois.map((c) => c.prizeId)).toEqual(antes.map((c) => c.prizeId));
  });

  it("cenário G: webhook e aprovação manual ao mesmo tempo alocam uma vez só", async () => {
    await combosDeCaixa(1, 8);
    await premiosDeCaixa(3);
    const reserva = await comprarPago(8);

    // As duas confirmações disparadas juntas, que é o caso real: o webhook
    // chega enquanto o admin aperta "aprovar".
    await Promise.all([
      autoGenerateSurpriseBoxesForReservation(reserva),
      autoGenerateSurpriseBoxesForReservation(reserva),
    ]);

    const caixas = await caixasDa(reserva);
    expect(caixas).toHaveLength(8);
    expect(caixas.filter((c) => c.prizeId).length).toBe(3);
    expect(new Set(caixas.map((c) => c.prizeId).filter(Boolean)).size).toBe(3);
  });

  it("chamar a alocação de novo não move prêmio de lugar", async () => {
    await combosDeCaixa(1, 10);
    await premiosDeCaixa(4);
    const reserva = await comprarPago(10);
    await autoGenerateSurpriseBoxesForReservation(reserva);
    const antes = await caixasDa(reserva);

    for (let i = 0; i < 5; i++) {
      await alocarPremiosDaReserva(reserva, "CAIXA");
    }

    expect(await caixasDa(reserva)).toEqual(antes);
  });

  it("duas compras simultâneas não levam o mesmo prêmio", async () => {
    await combosDeCaixa(1, 5);
    await premiosDeCaixa(3);
    const a = await comprarPago(5);
    const b = await comprarPago(5);

    await Promise.all([
      autoGenerateSurpriseBoxesForReservation(a),
      autoGenerateSurpriseBoxesForReservation(b),
    ]);

    const todas = [...(await caixasDa(a)), ...(await caixasDa(b))];
    const premios = todas.map((c) => c.prizeId).filter(Boolean);
    // Três prêmios no bolo, três donos, nenhum repetido.
    expect(premios).toHaveLength(3);
    expect(new Set(premios).size).toBe(3);
  });
});

__suiteIntegra("abertura só revela", () => {
  it("cenário H e L: abrir duas vezes devolve o mesmo, e não muda nada", async () => {
    await combosDeCaixa(1, 4);
    await premiosDeCaixa(4);
    const reserva = await comprarPago(4);
    await autoGenerateSurpriseBoxesForReservation(reserva);
    const [caixa] = await caixasDa(reserva);

    const primeira = await revelarCaixa(caixa!.id);
    const segunda = await revelarCaixa(caixa!.id);

    expect(primeira).not.toBeNull();
    expect(segunda?.status).toBe(primeira?.status);
    expect(segunda?.prize?.id ?? null).toBe(primeira?.prize?.id ?? null);
    // O prêmio gravado continua sendo o mesmo de antes de abrir.
    const depois = await prisma.surpriseBox.findUnique({
      where: { id: caixa!.id },
      select: { prizeId: true },
    });
    expect(depois?.prizeId).toBe(caixa!.prizeId);
  });

  it("cenário J: abrir todas junto com abrir uma mantém tudo consistente", async () => {
    await combosDeCaixa(1, 6);
    await premiosDeCaixa(3);
    const reserva = await comprarPago(6);
    await autoGenerateSurpriseBoxesForReservation(reserva);
    const caixas = await caixasDa(reserva);

    // "Abrir todas" e um clique individual na mesma caixa, ao mesmo tempo.
    await Promise.all([
      ...caixas.map((c) => revelarCaixa(c.id)),
      revelarCaixa(caixas[0]!.id),
      revelarCaixa(caixas[2]!.id),
    ]);

    const depois = await caixasDa(reserva);
    expect(depois.map((c) => c.prizeId)).toEqual(caixas.map((c) => c.prizeId));
    expect(depois.every((c) => c.status !== "UNOPENED")).toBe(true);
    expect(
      depois.filter((c) => c.status === "OPENED_PRIZE").length,
    ).toBe(3);
  });
});

__suiteIntegra("raspadinha decide na compra", () => {
  async function combosDeRaspadinha(minimo: number, quantidade: number) {
    await prisma.raspadinhaCombo.create({
      data: { raffleId, minimo, quantidade, visivel: true },
    });
  }
  async function premiosDeRaspadinha(quantos: number, travado = false) {
    await prisma.raspadinhaPremio.createMany({
      data: Array.from({ length: quantos }, (_, i) => ({
        raffleId,
        tipo: "PIX" as const,
        rotulo: `R$ ${i + 1} no Pix`,
        travado,
        saidaEmTitulos: 1,
        saidaDdds: [],
      })),
    });
  }
  const bilhetesDa = (reservationId: string) =>
    prisma.raspadinha.findMany({
      where: { reservationId },
      select: { id: true, premioId: true, status: true, alocacao: true },
      orderBy: { numero: "asc" },
    });

  it("cenário A da raspadinha: 20 bilhetes e 2 prêmios dão 2 premiados", async () => {
    await combosDeRaspadinha(1, 20);
    await premiosDeRaspadinha(2);
    const reserva = await comprarPago(20);

    await gerarRaspadinhasParaReserva(reserva);

    const bilhetes = await bilhetesDa(reserva);
    expect(bilhetes).toHaveLength(20);
    expect(bilhetes.filter((b) => b.premioId).length).toBe(2);
    expect(bilhetes.every((b) => b.alocacao === "ALOCADA")).toBe(true);
    // E nenhum deles foi raspado: o prêmio existe antes do gesto.
    expect(bilhetes.every((b) => b.status === "DISPONIVEL")).toBe(true);
  });

  it("cenário M da raspadinha: prêmio travado nunca sai", async () => {
    await combosDeRaspadinha(1, 5);
    await premiosDeRaspadinha(3, true);
    const reserva = await comprarPago(5);

    await gerarRaspadinhasParaReserva(reserva);

    const bilhetes = await bilhetesDa(reserva);
    expect(bilhetes.filter((b) => b.premioId).length).toBe(0);
  });

  it("cenário I e K: raspar duas vezes, e todas de uma vez, dá o mesmo", async () => {
    await combosDeRaspadinha(1, 6);
    await premiosDeRaspadinha(2);
    const reserva = await comprarPago(6);
    await gerarRaspadinhasParaReserva(reserva);
    const antes = await bilhetesDa(reserva);

    await Promise.all([
      ...antes.map((b) => revelarBilhete(b.id)),
      revelarBilhete(antes[0]!.id),
    ]);

    const depois = await bilhetesDa(reserva);
    expect(depois.map((b) => b.premioId)).toEqual(antes.map((b) => b.premioId));
    expect(depois.every((b) => b.status !== "DISPONIVEL")).toBe(true);
    expect(depois.filter((b) => b.status === "PREMIADA").length).toBe(2);
  });

  it("webhook duplicado não duplica bilhete nem prêmio", async () => {
    await combosDeRaspadinha(1, 4);
    await premiosDeRaspadinha(2);
    const reserva = await comprarPago(4);

    await Promise.all([
      gerarRaspadinhasParaReserva(reserva),
      gerarRaspadinhasParaReserva(reserva),
      gerarRaspadinhasParaReserva(reserva),
    ]);

    const bilhetes = await bilhetesDa(reserva);
    expect(bilhetes).toHaveLength(4);
    expect(bilhetes.filter((b) => b.premioId).length).toBe(2);
    expect(new Set(bilhetes.map((b) => b.premioId).filter(Boolean)).size).toBe(
      2,
    );
  });
});
