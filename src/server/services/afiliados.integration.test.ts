import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { createReservation } from "@/server/services/reservations";
import {
  ajustarEntradas,
  ativarAfiliado,
  liberarEntradaGratis,
  painelDoAfiliado,
  processarCompraDeIndicado,
  processarPagamentoConfirmado,
  reverterCompraDeIndicado,
  situacaoDaEntrada,
  vincularIndicacao,
} from "@/server/services/afiliados";

// O programa de afiliados contra o banco de verdade.
//
// O que está aqui é o que não cabe numa função pura: o índice que impede
// crédito duplo, o índice que impede duas entradas no mesmo sorteio, a
// corrida entre duas abas, e o desconto de uma cota atravessando a compra
// inteira. A aritmética da recompensa (R$ 9,99 não gera, R$ 27,50 gera duas)
// está coberta sem banco em src/lib/afiliados.test.ts.

let tenantId: string;
let proximoNumero = 1;
let contador = 0;

/** Uma conta nova, para não depender de quem já está no banco. */
async function novaConta(nome: string) {
  contador++;
  return prisma.user.create({
    data: {
      name: nome,
      phone: `6299${String(Date.now()).slice(-6)}${contador}`.slice(0, 11),
      tenantId,
    },
    select: { id: true, name: true },
  });
}

async function novaCampanha(precoPorNumero: string, total = 500) {
  const dono = await prisma.user.findFirstOrThrow({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  proximoNumero = 1;
  return prisma.raffle.create({
    data: {
      tenantId,
      createdById: dono.id,
      title: `Afiliados ${Date.now()}-${Math.random()}`,
      slug: `afiliados-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      totalNumbers: total,
      pricePerNumber: precoPorNumero,
      status: "ACTIVE",
    },
    select: { id: true, pricePerNumber: true },
  });
}

/** Uma compra paga, do jeito que o webhook deixaria. */
async function comprarPago(
  raffleId: string,
  userId: string,
  valor: string,
  titulos = 1,
) {
  const reserva = await prisma.reservation.create({
    data: {
      raffleId,
      userId,
      status: "PAID",
      participantName: "Indicado",
      participantPhone: "62999999999",
      totalAmount: valor,
      paidAt: new Date(),
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
      paidAt: new Date(),
    })),
  });
  proximoNumero += titulos;
  return reserva.id;
}

async function entradasDisponiveis(userId: string) {
  const afiliado = await prisma.affiliate.findUniqueOrThrow({
    where: { userId },
    select: { id: true },
  });
  return prisma.entradaGratis.count({
    where: { affiliateId: afiliado.id, estado: "DISPONIVEL" },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("sem tenant no banco de teste");
  tenantId = tenant.id;
});

let afiliado: { id: string; name: string };
let indicado: { id: string; name: string };

beforeEach(async () => {
  afiliado = await novaConta("Afiliado A");
  indicado = await novaConta("Indicado B");
  await ativarAfiliado(afiliado.id, `TESTE${Date.now() % 100000}`);
});

describe("vínculo com quem indicou", () => {
  it("vincula pelo código e o vínculo é permanente", async () => {
    const codigo = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { code: true },
      })
    ).code;

    expect(await vincularIndicacao(indicado.id, codigo)).toBe(codigo);

    // Um segundo afiliado tenta levar o mesmo indicado embora.
    const outro = await novaConta("Afiliado C");
    const outroCodigo = (await ativarAfiliado(outro.id)).code;
    expect(await vincularIndicacao(indicado.id, outroCodigo)).toBeNull();

    const depois = await prisma.user.findUniqueOrThrow({
      where: { id: indicado.id },
      select: { referredByAffiliate: { select: { code: true } } },
    });
    expect(depois.referredByAffiliate?.code).toBe(codigo);
  });

  it("aceita o código de qualquer jeito que a pessoa digite", async () => {
    const codigo = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { code: true },
      })
    ).code;
    expect(await vincularIndicacao(indicado.id, ` ${codigo.toLowerCase()} `)).toBe(
      codigo,
    );
  });

  it("recusa autoindicação", async () => {
    const codigo = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { code: true },
      })
    ).code;
    expect(await vincularIndicacao(afiliado.id, codigo)).toBeNull();
    const eu = await prisma.user.findUniqueOrThrow({
      where: { id: afiliado.id },
      select: { referredByAffiliateId: true },
    });
    expect(eu.referredByAffiliateId).toBeNull();
  });

  it("código inexistente não cria vínculo e não quebra", async () => {
    expect(await vincularIndicacao(indicado.id, "NAOEXISTE99")).toBeNull();
  });

  it("afiliado suspenso não recebe gente nova", async () => {
    const codigo = (
      await prisma.affiliate.update({
        where: { userId: afiliado.id },
        data: { status: "SUSPENDED" },
        select: { code: true },
      })
    ).code;
    expect(await vincularIndicacao(indicado.id, codigo)).toBeNull();
  });
});

describe("compra paga vira progresso", () => {
  beforeEach(async () => {
    const codigo = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { code: true },
      })
    ).code;
    await vincularIndicacao(indicado.id, codigo);
  });

  it("o critério de aceitação, de ponta a ponta", async () => {
    const campanha = await novaCampanha("1.00");

    // R$ 27,50: duas entradas e R$ 7,50 de progresso.
    const primeira = await comprarPago(campanha.id, indicado.id, "27.50", 27);
    await processarCompraDeIndicado(primeira);

    let painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.disponiveis).toBe(2);
    expect(painel?.progressoEmCentavos).toBe(750);

    // Mais R$ 2,50: a terceira entrada, progresso zerado.
    const segunda = await comprarPago(campanha.id, indicado.id, "2.50", 3);
    await processarCompraDeIndicado(segunda);

    painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.disponiveis).toBe(3);
    expect(painel?.progressoEmCentavos).toBe(0);
    expect(painel?.conquistadas).toBe(3);
  });

  it("compra não paga não gera nada", async () => {
    const campanha = await novaCampanha("1.00");
    const pendente = await prisma.reservation.create({
      data: {
        raffleId: campanha.id,
        userId: indicado.id,
        status: "PENDING",
        participantName: "Indicado",
        totalAmount: "500.00",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });

    expect(await processarCompraDeIndicado(pendente.id)).toBeNull();
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
  });

  it("webhook reentregue não credita duas vezes", async () => {
    const campanha = await novaCampanha("1.00");
    const compra = await comprarPago(campanha.id, indicado.id, "30.00", 30);

    // Quatro entregas do mesmo evento, como a SigiloPay já fez de verdade.
    await Promise.all([
      processarPagamentoConfirmado(compra),
      processarPagamentoConfirmado(compra),
      processarPagamentoConfirmado(compra),
      processarPagamentoConfirmado(compra),
    ]);

    expect(await entradasDisponiveis(afiliado.id)).toBe(3);
    const movimentos = await prisma.movimentoDeAfiliado.count({
      where: { reservationId: compra, tipo: "COMPRA_DE_INDICADO" },
    });
    expect(movimentos).toBe(1);
  });

  it("compra de quem não foi indicado não credita ninguém", async () => {
    const sozinho = await novaConta("Sem padrinho");
    const campanha = await novaCampanha("1.00");
    const compra = await comprarPago(campanha.id, sozinho.id, "50.00", 50);
    expect(await processarCompraDeIndicado(compra)).toBeNull();
  });

  it("estorno desfaz o progresso e recolhe a entrada que sobrou", async () => {
    const campanha = await novaCampanha("1.00");
    const compra = await comprarPago(campanha.id, indicado.id, "10.00", 10);
    await processarCompraDeIndicado(compra);
    expect(await entradasDisponiveis(afiliado.id)).toBe(1);

    await reverterCompraDeIndicado(compra);
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
    const painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.progressoEmCentavos).toBe(0);
  });
});

describe("Entrada Grátis no checkout", () => {
  beforeEach(async () => {
    // Três entradas na mão, direto pelo ajuste do painel.
    await ajustarEntradas({
      userId: afiliado.id,
      quantidade: 3,
      motivo: "teste",
      adminId: afiliado.id,
    });
  });

  it("desconta exatamente uma cota, e o número continua vindo", async () => {
    const campanha = await novaCampanha("25.00");
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;

    const reserva = await createReservation({
      raffleId: campanha.id,
      numbers: [1, 2, 3, 4],
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    });

    // R$ 100 de subtotal, R$ 75 a pagar, quatro cotas na mão.
    expect(Number(reserva.totalAmount)).toBe(75);
    const tickets = await prisma.ticket.count({
      where: { reservationId: reserva.id },
    });
    expect(tickets).toBe(4);
    expect(await entradasDisponiveis(afiliado.id)).toBe(2);
  });

  it("vale o mesmo numa campanha barata e numa cara", async () => {
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    const base = {
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    };

    const barata = await novaCampanha("1.00");
    const naBarata = await createReservation({
      ...base,
      raffleId: barata.id,
      numbers: [1, 2, 3, 4, 5],
    });
    expect(Number(naBarata.totalAmount)).toBe(4);

    const cara = await novaCampanha("20.00");
    const naCara = await createReservation({
      ...base,
      raffleId: cara.id,
      numbers: [1],
    });
    // Uma cota de R$ 20 coberta inteira: nada a pagar, e a compra já nasce
    // paga, sem Pix de R$ 0.
    expect(Number(naCara.totalAmount)).toBe(0);
    expect(naCara.status).toBe("PAID");
  });

  it("uma entrada por sorteio: a segunda compra na mesma campanha recusa", async () => {
    const campanha = await novaCampanha("5.00");
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    const base = {
      raffleId: campanha.id,
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    };

    await createReservation({ ...base, numbers: [1, 2] });
    await expect(
      createReservation({ ...base, numbers: [3, 4] }),
    ).rejects.toThrow(/já utilizada neste sorteio/i);

    const situacao = await situacaoDaEntrada(afiliado.id, campanha.id);
    expect(situacao.jaUsouNesteSorteio).toBe(true);
    expect(situacao.podeUsar).toBe(false);
    // E ainda sobra saldo para outras campanhas.
    expect(situacao.disponiveis).toBeGreaterThan(0);
  });

  it("mas a entrada seguinte vale noutra campanha", async () => {
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    const base = {
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    };

    const primeira = await novaCampanha("5.00");
    const segunda = await novaCampanha("5.00");
    await createReservation({ ...base, raffleId: primeira.id, numbers: [1] });
    const outra = await createReservation({
      ...base,
      raffleId: segunda.id,
      numbers: [1],
    });
    expect(Number(outra.totalAmount)).toBe(0);
    expect(await entradasDisponiveis(afiliado.id)).toBe(1);
  });

  it("com uma entrada só, duas compras simultâneas: uma leva, a outra recusa", async () => {
    // Zera o saldo e deixa exatamente uma.
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    await prisma.entradaGratis.deleteMany({
      where: { affiliateId: idDoAfiliado },
    });
    await prisma.entradaGratis.create({
      data: { affiliateId: idDoAfiliado },
    });

    const base = {
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    };
    const uma = await novaCampanha("5.00");
    const outra = await novaCampanha("5.00");

    const resultados = await Promise.allSettled([
      createReservation({ ...base, raffleId: uma.id, numbers: [1] }),
      createReservation({ ...base, raffleId: outra.id, numbers: [1] }),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const falhou = resultados.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(falhou).toHaveLength(1);
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
  });

  it("sem saldo, a compra não consegue forçar o desconto", async () => {
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    await prisma.entradaGratis.deleteMany({
      where: { affiliateId: idDoAfiliado },
    });

    const campanha = await novaCampanha("5.00");
    await expect(
      createReservation({
        raffleId: campanha.id,
        numbers: [1],
        participantName: "Afiliado A",
        participantPhone: null,
        participantCpf: null,
        participantEmail: null,
        participantSocialName: null,
        participantBirthDate: null,
        affiliateCode: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmContent: null,
        usarEntradaDe: idDoAfiliado,
      }),
    ).rejects.toThrow(/não está mais disponível/i);
  });

  it("Pix que expira devolve a entrada, e ela volta a valer no mesmo sorteio", async () => {
    const campanha = await novaCampanha("5.00");
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    const base = {
      raffleId: campanha.id,
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    };

    const reserva = await createReservation({ ...base, numbers: [1, 2] });
    expect(await entradasDisponiveis(afiliado.id)).toBe(2);

    await liberarEntradaGratis(reserva.id);
    expect(await entradasDisponiveis(afiliado.id)).toBe(3);

    // E o sorteio volta a aceitar uma entrada: o índice foi liberado junto.
    const denovo = await createReservation({ ...base, numbers: [3, 4] });
    expect(Number(denovo.totalAmount)).toBe(5);
  });

  it("a cota coberta não vira progresso para quem indicou o afiliado", async () => {
    // O afiliado A também foi indicado por alguém: C.
    const padrinho = await novaConta("Afiliado C");
    const codigoDoPadrinho = (await ativarAfiliado(padrinho.id)).code;
    await vincularIndicacao(afiliado.id, codigoDoPadrinho);

    const campanha = await novaCampanha("10.00");
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;

    // Compra de R$ 20 com uma cota de R$ 10 coberta pela entrada.
    const reserva = await createReservation({
      raffleId: campanha.id,
      numbers: [1, 2],
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    });
    expect(Number(reserva.totalAmount)).toBe(10);

    // A action liga a reserva à conta logo depois de criá-la; aqui fazemos o
    // mesmo, porque é o userId que diz de quem é a compra.
    await prisma.reservation.update({
      where: { id: reserva.id },
      data: { userId: afiliado.id, status: "PAID", paidAt: new Date() },
    });
    await processarPagamentoConfirmado(reserva.id);

    // C recebe pelos R$ 10 pagos, e não pelos R$ 20 do carrinho.
    const painelDoPadrinho = await painelDoAfiliado(padrinho.id);
    expect(painelDoPadrinho?.progressoEmCentavos).toBe(0);
    expect(painelDoPadrinho?.disponiveis).toBe(1);
  });

  it("o histórico registra o que aconteceu", async () => {
    const campanha = await novaCampanha("5.00");
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    await createReservation({
      raffleId: campanha.id,
      numbers: [1],
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    });

    const movimentos = await prisma.movimentoDeAfiliado.findMany({
      where: { affiliateId: idDoAfiliado },
      select: { tipo: true, entradas: true },
    });
    const tipos = movimentos.map((m) => m.tipo);
    expect(tipos).toContain("AJUSTE");
    expect(tipos).toContain("ENTRADA_USADA");
    expect(
      movimentos.find((m) => m.tipo === "ENTRADA_USADA")?.entradas,
    ).toBe(-1);
  });
});

describe("ajuste manual", () => {
  it("tirar entrada não alcança o que já foi gasto", async () => {
    await ajustarEntradas({
      userId: afiliado.id,
      quantidade: 1,
      motivo: "cortesia",
      adminId: afiliado.id,
    });
    const campanha = await novaCampanha("5.00");
    const idDoAfiliado = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { id: true },
      })
    ).id;
    await createReservation({
      raffleId: campanha.id,
      numbers: [1],
      participantName: "Afiliado A",
      participantPhone: null,
      participantCpf: null,
      participantEmail: null,
      participantSocialName: null,
      participantBirthDate: null,
      affiliateCode: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      usarEntradaDe: idDoAfiliado,
    });

    const { aplicadas } = await ajustarEntradas({
      userId: afiliado.id,
      quantidade: -5,
      motivo: "correção",
      adminId: afiliado.id,
    });
    expect(aplicadas).toBe(0);
    const painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.disponiveis).toBe(0);
    // A compra de uma cota de R$ 5 com a entrada zerou o total, então ela
    // nasceu paga e a entrada já saiu como usada, sem passar por reservada.
    expect(painel?.usadas).toBe(1);
  });

  it("exige motivo", async () => {
    await expect(
      ajustarEntradas({
        userId: afiliado.id,
        quantidade: 1,
        motivo: " ",
        adminId: afiliado.id,
      }),
    ).rejects.toThrow();
  });
});
