import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { createReservation } from "@/server/services/reservations";
import {
  ajustarEntradas,
  ativarAfiliado,
  definirConfigDeRecompensa,
  indicadosDoAfiliado,
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

/** Os cupons disponíveis, com o valor de cada um. */
async function cuponsDe(userId: string) {
  const afiliado = await prisma.affiliate.findUniqueOrThrow({
    where: { userId },
    select: { id: true },
  });
  return prisma.entradaGratis.findMany({
    where: { affiliateId: afiliado.id, estado: "DISPONIVEL" },
    select: { id: true, valorEmCentavos: true, limiarNaConcessao: true, bpsNaConcessao: true },
    orderBy: { ganhaEm: "asc" },
  });
}

/** O id do afiliado, que é o que createReservation espera. */
async function idDoAfiliado(userId: string) {
  const a = await prisma.affiliate.findUniqueOrThrow({
    where: { userId },
    select: { id: true },
  });
  return a.id;
}

/** O molde de uma compra, para os testes não repetirem doze campos nulos. */
function compraBase(extra: {
  raffleId: string;
  numbers: number[];
  usarEntradaDe?: string | null;
  cupomId?: string | null;
}) {
  return {
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
    ...extra,
  };
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
  // O contador entra no código: dois testes no mesmo milissegundo colidiam no
  // índice único e a falha parecia defeito do produto.
  await ativarAfiliado(afiliado.id, `TESTE${Date.now() % 100000}X${contador}`);
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

describe("recompensa progressiva", () => {
  beforeEach(async () => {
    const codigo = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { code: true },
      })
    ).code;
    await vincularIndicacao(indicado.id, codigo);
  });

  it("R$ 9,99 não gera cupom", async () => {
    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "9.99", 9),
    );
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
  });

  it("R$ 10,00 gera um cupom de R$ 5,00", async () => {
    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "10.00", 10),
    );
    const cupons = await cuponsDe(afiliado.id);
    expect(cupons).toHaveLength(1);
    expect(cupons[0]!.valorEmCentavos).toBe(500);
  });

  it("R$ 20,00 gera DOIS cupons de R$ 5,00, e não um de R$ 10,00", async () => {
    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "20.00", 20),
    );
    const cupons = await cuponsDe(afiliado.id);
    expect(cupons).toHaveLength(2);
    expect(cupons.map((c) => c.valorEmCentavos)).toEqual([500, 500]);
  });

  it("o cupom nasce com 72 horas de prazo para ser usado", async () => {
    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "10.00", 10),
    );
    const [cupom] = await prisma.entradaGratis.findMany({
      where: { affiliateId: await idDoAfiliado(afiliado.id) },
      orderBy: { ganhaEm: "desc" },
      take: 1,
      select: { ganhaEm: true, expiraEm: true },
    });
    expect(cupom?.expiraEm).not.toBeNull();
    expect(cupom!.expiraEm!.getTime() - cupom!.ganhaEm.getTime()).toBe(
      72 * 60 * 60 * 1000,
    );
  });

  it("R$ 27,50 dá dois cupons e deixa R$ 7,50; mais R$ 2,50 dão o terceiro", async () => {
    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "27.50", 27),
    );
    let painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.cupons).toHaveLength(2);
    expect(painel?.progressoEmCentavos).toBe(750);

    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "2.50", 3),
    );
    painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.cupons).toHaveLength(3);
    expect(painel?.progressoEmCentavos).toBe(0);
  });

  it("dois indicados diferentes somam no mesmo progresso", async () => {
    // R$ 4 de um, R$ 6 de outro: um cupom. Era exatamente o que a regra
    // anterior proibia.
    const campanha = await novaCampanha("1.00");
    const segundo = await novaConta("Indicado B");
    const codigo = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { code: true },
      })
    ).code;
    await vincularIndicacao(segundo.id, codigo);

    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "4.00", 4),
    );
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);

    await processarCompraDeIndicado(
      await comprarPago(campanha.id, segundo.id, "6.00", 6),
    );
    expect(await entradasDisponiveis(afiliado.id)).toBe(1);
  });

  it("o mesmo indicado contribui várias vezes", async () => {
    const campanha = await novaCampanha("1.00");
    for (const valor of ["10.00", "10.00", "10.00"]) {
      await processarCompraDeIndicado(
        await comprarPago(campanha.id, indicado.id, valor, 10),
      );
    }
    expect(await entradasDisponiveis(afiliado.id)).toBe(3);
  });

  it("webhook reentregue não duplica progresso nem cupom", async () => {
    const campanha = await novaCampanha("1.00");
    const compra = await comprarPago(campanha.id, indicado.id, "10.00", 10);

    await Promise.all([
      processarPagamentoConfirmado(compra),
      processarPagamentoConfirmado(compra),
      processarPagamentoConfirmado(compra),
      processarPagamentoConfirmado(compra),
    ]);

    expect(await entradasDisponiveis(afiliado.id)).toBe(1);
    expect(
      await prisma.movimentoDeAfiliado.count({
        where: { reservationId: compra, tipo: "COMPRA_DE_INDICADO" },
      }),
    ).toBe(1);
  });

  it("pagamentos simultâneos geram a quantidade certa", async () => {
    const campanha = await novaCampanha("1.00");
    // As compras são criadas em sequência (o contador de números do teste não
    // é atômico); o que roda junto é a CONFIRMAÇÃO delas, que é o que importa.
    const compras = [
      await comprarPago(campanha.id, indicado.id, "5.00", 5),
      await comprarPago(campanha.id, indicado.id, "5.00", 5),
      await comprarPago(campanha.id, indicado.id, "10.00", 10),
    ];
    await Promise.all(compras.map((c) => processarPagamentoConfirmado(c)));

    // R$ 20 no total: dois cupons, progresso zerado.
    expect(await entradasDisponiveis(afiliado.id)).toBe(2);
    expect((await painelDoAfiliado(afiliado.id))?.progressoEmCentavos).toBe(0);
  });

  it("modo progressivo: o percentual sai do gasto acumulado do indicado", async () => {
    // Escada padrão: R$ 100 por degrau, +2% por degrau. Limiar de R$ 100 para
    // o cupom sair a cada R$ 100 gastos, que é como a regra foi descrita.
    await definirConfigDeRecompensa({
      userId: afiliado.id,
      usaConfigPropria: true,
      modo: "PERCENTUAL_PROGRESSIVO",
      limiarEmCentavos: 10_000,
      recompensaEmBps: 5000,
      valorDoCupomEmCentavos: 5000,
      degrauEmCentavos: 10_000,
      bpsPorDegrau: 200,
      adminId: afiliado.id,
    });

    const campanha = await novaCampanha("1.00");
    // Primeiros R$ 100: o indicado fecha o primeiro degrau nesta compra, então
    // já leva 2% (R$ 2,00).
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "100.00", 100),
    );
    // Mais R$ 100: acumulado de R$ 200, segundo degrau, 4% (R$ 4,00).
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "100.00", 100),
    );

    const cupons = await cuponsDe(afiliado.id);
    expect(cupons.map((c) => c.valorEmCentavos)).toEqual([200, 400]);
    expect(cupons.map((c) => c.bpsNaConcessao)).toEqual([200, 400]);
  });

  it("modo progressivo: abaixo do primeiro degrau não concede, e não perde o progresso", async () => {
    await definirConfigDeRecompensa({
      userId: afiliado.id,
      usaConfigPropria: true,
      modo: "PERCENTUAL_PROGRESSIVO",
      limiarEmCentavos: 10_000,
      recompensaEmBps: 5000,
      valorDoCupomEmCentavos: 5000,
      degrauEmCentavos: 10_000,
      bpsPorDegrau: 200,
      adminId: afiliado.id,
    });

    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "99.99", 99),
    );
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
    expect((await painelDoAfiliado(afiliado.id))?.progressoEmCentavos).toBe(9999);

    // Um centavo fecha os R$ 100 do indicado: o progresso guardado converte
    // agora, já valendo 2%.
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "0.01", 1),
    );
    const cupons = await cuponsDe(afiliado.id);
    expect(cupons).toHaveLength(1);
    expect(cupons[0]!.valorEmCentavos).toBe(200);
  });

  it("modo progressivo: cada indicado tem a sua própria escada", async () => {
    await definirConfigDeRecompensa({
      userId: afiliado.id,
      usaConfigPropria: true,
      modo: "PERCENTUAL_PROGRESSIVO",
      limiarEmCentavos: 10_000,
      recompensaEmBps: 5000,
      valorDoCupomEmCentavos: 5000,
      degrauEmCentavos: 10_000,
      bpsPorDegrau: 200,
      adminId: afiliado.id,
    });

    const campanha = await novaCampanha("1.00");
    const codigo = (
      await prisma.affiliate.findUniqueOrThrow({
        where: { userId: afiliado.id },
        select: { code: true },
      })
    ).code;
    const segundo = await novaConta("Segundo indicado");
    await vincularIndicacao(segundo.id, codigo);

    // O primeiro chega a R$ 300 (6%); o segundo compra R$ 100 pela primeira
    // vez e leva 2%, mesmo com o afiliado já bem pontuado.
    for (let i = 0; i < 3; i++) {
      await processarCompraDeIndicado(
        await comprarPago(campanha.id, indicado.id, "100.00", 100),
      );
    }
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, segundo.id, "100.00", 100),
    );

    const cupons = await cuponsDe(afiliado.id);
    expect(cupons.map((c) => c.bpsNaConcessao)).toEqual([200, 400, 600, 200]);
  });

  it("a tela do afiliado mostra progresso, e NUNCA o quanto o indicado gastou", async () => {
    await definirConfigDeRecompensa({
      userId: afiliado.id,
      usaConfigPropria: true,
      modo: "PERCENTUAL_PROGRESSIVO",
      limiarEmCentavos: 10_000,
      recompensaEmBps: 5000,
      valorDoCupomEmCentavos: 5000,
      degrauEmCentavos: 10_000,
      bpsPorDegrau: 200,
      adminId: afiliado.id,
    });

    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "347.50", 347),
    );

    const [linha] = await indicadosDoAfiliado(afiliado.id);
    // R$ 347,50 num ciclo de R$ 100: 47% do ciclo atual, e já rendeu antes.
    // Quantos ciclos ela fechou NÃO sai daqui: "3 ciclos de R$ 100" é o valor
    // gasto escrito de outro jeito.
    expect(linha?.progresso).toEqual({
      percentual: 47,
      jaRendeu: true,
      bpsAtual: 600,
    });
    // O valor gasto não pode sair daqui de jeito nenhum: nem como campo, nem
    // escondido dentro de outro. Esta linha é a trava contra alguém devolver
    // o pagoEmCentavos por engano numa refatoração.
    const cru = JSON.stringify(linha);
    expect(cru).not.toContain("34750");
    // Nem o total, nem a contagem de ciclos que o reconstrói.
    expect(cru).not.toContain('"3"');
    expect(cru).not.toMatch(/ciclos/i);
  });

  it("regra personalizada de 70% gera cupom de R$ 7,00", async () => {
    await definirConfigDeRecompensa({
      userId: afiliado.id,
      usaConfigPropria: true,
      modo: "VALOR_FIXO",
      degrauEmCentavos: 10_000,
      bpsPorDegrau: 200,
      limiarEmCentavos: 1000,
      recompensaEmBps: 7000,
      valorDoCupomEmCentavos: 700,
      adminId: afiliado.id,
    });

    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "10.00", 10),
    );
    const cupons = await cuponsDe(afiliado.id);
    expect(cupons[0]!.valorEmCentavos).toBe(700);
    expect(cupons[0]!.bpsNaConcessao).toBe(7000);
    expect(cupons[0]!.limiarNaConcessao).toBe(1000);
  });

  it("mudar a configuração não mexe nos cupons antigos", async () => {
    const campanha = await novaCampanha("1.00");
    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "10.00", 10),
    );

    await definirConfigDeRecompensa({
      userId: afiliado.id,
      usaConfigPropria: true,
      modo: "VALOR_FIXO",
      degrauEmCentavos: 10_000,
      bpsPorDegrau: 200,
      limiarEmCentavos: 1000,
      recompensaEmBps: 7000,
      valorDoCupomEmCentavos: 700,
      adminId: afiliado.id,
    });

    await processarCompraDeIndicado(
      await comprarPago(campanha.id, indicado.id, "10.00", 10),
    );

    const cupons = await cuponsDe(afiliado.id);
    // O primeiro continua valendo R$ 5; o segundo já nasce com R$ 7.
    expect(cupons.map((c) => c.valorEmCentavos)).toEqual([500, 700]);
  });

  it("a mudança de configuração fica no histórico", async () => {
    await definirConfigDeRecompensa({
      userId: afiliado.id,
      usaConfigPropria: true,
      modo: "VALOR_FIXO",
      degrauEmCentavos: 10_000,
      bpsPorDegrau: 200,
      limiarEmCentavos: 1000,
      recompensaEmBps: 7000,
      valorDoCupomEmCentavos: 700,
      adminId: afiliado.id,
    });
    const registro = await prisma.movimentoDeAfiliado.findFirst({
      where: { affiliateId: await idDoAfiliado(afiliado.id), tipo: "CONFIG_ALTERADA" },
    });
    expect(registro?.adminId).toBe(afiliado.id);
    expect(registro?.descricao).toMatch(/70%/);
  });

  it("o backend recusa valor que não bate com a porcentagem", async () => {
    await expect(
      definirConfigDeRecompensa({
        userId: afiliado.id,
        usaConfigPropria: true,
        modo: "VALOR_FIXO",
        degrauEmCentavos: 10_000,
        bpsPorDegrau: 200,
        limiarEmCentavos: 1000,
        recompensaEmBps: 5000,
        valorDoCupomEmCentavos: 900,
        adminId: afiliado.id,
      }),
    ).rejects.toThrow();
  });

  it("compra pendente não entra no progresso", async () => {
    const campanha = await novaCampanha("1.00");
    await prisma.reservation.create({
      data: {
        raffleId: campanha.id,
        userId: indicado.id,
        status: "PENDING",
        participantName: "Indicado",
        totalAmount: "500.00",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
  });

  it("compra gratuita não entra no progresso", async () => {
    const campanha = await novaCampanha("1.00");
    const gratis = await comprarPago(campanha.id, indicado.id, "0", 5);
    expect(await processarCompraDeIndicado(gratis)).toBeNull();
    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
  });

  it("estorno desfaz o progresso e cancela o cupom disponível", async () => {
    const campanha = await novaCampanha("1.00");
    const compra = await comprarPago(campanha.id, indicado.id, "10.00", 10);
    await processarCompraDeIndicado(compra);
    expect(await entradasDisponiveis(afiliado.id)).toBe(1);

    await reverterCompraDeIndicado(compra);

    expect(await entradasDisponiveis(afiliado.id)).toBe(0);
    const cancelados = await prisma.entradaGratis.count({
      where: {
        affiliateId: await idDoAfiliado(afiliado.id),
        estado: "CANCELADA",
      },
    });
    expect(cancelados).toBe(1);
    expect((await painelDoAfiliado(afiliado.id))?.progressoEmCentavos).toBe(0);
  });

  it("estorno com cupom já usado vira dívida explícita", async () => {
    const campanha = await novaCampanha("1.00");
    const compra = await comprarPago(campanha.id, indicado.id, "10.00", 10);
    await processarCompraDeIndicado(compra);

    // O cupom foi gasto antes de o estorno chegar.
    await prisma.entradaGratis.updateMany({
      where: { affiliateId: await idDoAfiliado(afiliado.id), estado: "DISPONIVEL" },
      data: { estado: "USADA", usadaEm: new Date() },
    });

    await reverterCompraDeIndicado(compra);

    // O cupom fica (a cota existiu) e a dívida aparece no progresso.
    const painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.usados).toBe(1);
    expect(painel?.progressoEmCentavos).toBe(-1000);
  });

  it("virar afiliado não gera cupom nenhum", async () => {
    const novo = await novaConta("Afiliado C");
    await ativarAfiliado(novo.id);
    expect(await entradasDisponiveis(novo.id)).toBe(0);
  });

  it("compra de quem não foi indicado não credita ninguém", async () => {
    const sozinho = await novaConta("Sem padrinho");
    const campanha = await novaCampanha("1.00");
    const compra = await comprarPago(campanha.id, sozinho.id, "50.00", 50);
    expect(await processarCompraDeIndicado(compra)).toBeNull();
  });
});

describe("Cupom de Entrada no checkout", () => {
  beforeEach(async () => {
    // Três cupons na mão, direto pelo ajuste do painel.
    await ajustarEntradas({
      userId: afiliado.id,
      quantidade: 3,
      motivo: "teste",
      adminId: afiliado.id,
    });
  });

  it("cota de R$ 2 com cupom de R$ 5: abate R$ 2 e perde R$ 3", async () => {
    const campanha = await novaCampanha("2.00");
    const cupons = await cuponsDe(afiliado.id);
    const reserva = await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1, 2, 3, 4],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );

    // Quatro cotas de R$ 2 são R$ 8; o cupom abate R$ 2 e só R$ 2. Os R$ 3
    // que sobraram do valor de face não vão para as outras cotas.
    expect(Number(reserva.totalAmount)).toBe(6);
    expect(
      await prisma.ticket.count({ where: { reservationId: reserva.id } }),
    ).toBe(4);
    // E não sobra saldo: o cupom saiu do estoque inteiro.
    expect(await entradasDisponiveis(afiliado.id)).toBe(2);
  });

  it("cota de R$ 12 com cupom de R$ 5: paga R$ 7", async () => {
    const campanha = await novaCampanha("12.00");
    const cupons = await cuponsDe(afiliado.id);
    const reserva = await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );
    expect(Number(reserva.totalAmount)).toBe(7);
    expect(reserva.status).toBe("PENDING");
  });

  it("quatro cotas de R$ 12: subtotal R$ 48, Pix de R$ 43", async () => {
    const campanha = await novaCampanha("12.00");
    const cupons = await cuponsDe(afiliado.id);
    const reserva = await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1, 2, 3, 4],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );
    expect(Number(reserva.totalAmount)).toBe(43);
    expect(
      await prisma.ticket.count({ where: { reservationId: reserva.id } }),
    ).toBe(4);
  });

  it("cota igual ao cupom zera a compra, e ela nasce paga sem Pix", async () => {
    const campanha = await novaCampanha("5.00");
    const cupons = await cuponsDe(afiliado.id);
    const reserva = await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );
    expect(Number(reserva.totalAmount)).toBe(0);
    expect(reserva.status).toBe("PAID");
  });

  it("compra coberta por cupom não gera progresso para quem indicou", async () => {
    // O afiliado A também foi indicado por C.
    const padrinho = await novaConta("Afiliado C");
    const codigo = (await ativarAfiliado(padrinho.id)).code;
    await vincularIndicacao(afiliado.id, codigo);

    const campanha = await novaCampanha("5.00");
    const cupons = await cuponsDe(afiliado.id);
    const reserva = await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );
    await prisma.reservation.update({
      where: { id: reserva.id },
      data: { userId: afiliado.id },
    });
    await processarPagamentoConfirmado(reserva.id);

    // Nada pago, nada de progresso: valor promocional não é receita.
    expect((await painelDoAfiliado(padrinho.id))?.progressoEmCentavos).toBe(0);
    expect(await entradasDisponiveis(padrinho.id)).toBe(0);
  });

  it("só a diferença paga vira progresso de quem indicou", async () => {
    const padrinho = await novaConta("Afiliado C");
    const codigo = (await ativarAfiliado(padrinho.id)).code;
    await vincularIndicacao(afiliado.id, codigo);

    const campanha = await novaCampanha("12.00");
    const cupons = await cuponsDe(afiliado.id);
    const reserva = await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );
    await prisma.reservation.update({
      where: { id: reserva.id },
      data: { userId: afiliado.id, status: "PAID", paidAt: new Date() },
    });
    await processarPagamentoConfirmado(reserva.id);

    // R$ 12 de cota, R$ 5 de cupom, R$ 7 pagos: o progresso de C é R$ 7.
    expect((await painelDoAfiliado(padrinho.id))?.progressoEmCentavos).toBe(700);
  });

  it("campanha que não aceita cupom recusa a compra com cupom", async () => {
    const campanha = await novaCampanha("5.00");
    await prisma.raffle.update({
      where: { id: campanha.id },
      data: { aceitaCupomDeAfiliado: false },
    });
    const cupons = await cuponsDe(afiliado.id);

    await expect(
      createReservation(
        compraBase({
          raffleId: campanha.id,
          numbers: [1],
          usarEntradaDe: await idDoAfiliado(afiliado.id),
          cupomId: cupons[0]!.id,
        }),
      ),
    ).rejects.toThrow(/não aceita/i);

    const situacao = await situacaoDaEntrada(afiliado.id, campanha.id);
    expect(situacao.campanhaAceita).toBe(false);
    expect(situacao.podeUsar).toBe(false);
  });

  it("cupom vencido não aparece no checkout nem pode ser gasto", async () => {
    const campanha = await novaCampanha("5.00");
    const cupons = await cuponsDe(afiliado.id);
    const de = await idDoAfiliado(afiliado.id);

    // Empurra o prazo de UM cupom para o passado, que é o que o relógio faz
    // sozinho depois de 72 horas.
    await prisma.entradaGratis.update({
      where: { id: cupons[0]!.id },
      data: { expiraEm: new Date(Date.now() - 60_000) },
    });

    const situacao = await situacaoDaEntrada(afiliado.id, campanha.id);
    expect(situacao.cupons.map((c) => c.id)).not.toContain(cupons[0]!.id);

    await expect(
      createReservation(
        compraBase({
          raffleId: campanha.id,
          numbers: [1],
          usarEntradaDe: de,
          cupomId: cupons[0]!.id,
        }),
      ),
    ).rejects.toThrow();

    // E o vencido não some do banco: ele fica DISPONIVEL, só que fora do
    // prazo. Apagar seria perder o rastro de um cupom que existiu.
    const ainda = await prisma.entradaGratis.findUniqueOrThrow({
      where: { id: cupons[0]!.id },
      select: { estado: true },
    });
    expect(ainda.estado).toBe("DISPONIVEL");
  });

  it("um cupom por sorteio: a segunda compra na mesma campanha recusa", async () => {
    const campanha = await novaCampanha("5.00");
    const cupons = await cuponsDe(afiliado.id);
    const base = {
      raffleId: campanha.id,
      usarEntradaDe: await idDoAfiliado(afiliado.id),
    };

    await createReservation(
      compraBase({ ...base, numbers: [1, 2], cupomId: cupons[0]!.id }),
    );
    await expect(
      createReservation(
        compraBase({ ...base, numbers: [3, 4], cupomId: cupons[1]!.id }),
      ),
    ).rejects.toThrow(/já utilizado neste sorteio/i);

    const situacao = await situacaoDaEntrada(afiliado.id, campanha.id);
    expect(situacao.jaUsouNesteSorteio).toBe(true);
    expect(situacao.podeUsar).toBe(false);
  });

  it("mas o cupom seguinte vale noutra campanha", async () => {
    const primeira = await novaCampanha("5.00");
    const segunda = await novaCampanha("5.00");
    const cupons = await cuponsDe(afiliado.id);
    const de = await idDoAfiliado(afiliado.id);

    await createReservation(
      compraBase({
        raffleId: primeira.id,
        numbers: [1],
        usarEntradaDe: de,
        cupomId: cupons[0]!.id,
      }),
    );
    const outra = await createReservation(
      compraBase({
        raffleId: segunda.id,
        numbers: [1],
        usarEntradaDe: de,
        cupomId: cupons[1]!.id,
      }),
    );
    expect(Number(outra.totalAmount)).toBe(0);
    expect(await entradasDisponiveis(afiliado.id)).toBe(1);
  });

  it("não dá para usar o cupom de outra conta", async () => {
    const outro = await novaConta("Afiliado C");
    await ativarAfiliado(outro.id);
    await ajustarEntradas({
      userId: outro.id,
      quantidade: 1,
      motivo: "teste",
      adminId: outro.id,
    });
    const cupomAlheio = (await cuponsDe(outro.id))[0]!;

    const campanha = await novaCampanha("5.00");
    await expect(
      createReservation(
        compraBase({
          raffleId: campanha.id,
          numbers: [1],
          usarEntradaDe: await idDoAfiliado(afiliado.id),
          cupomId: cupomAlheio.id,
        }),
      ),
    ).rejects.toThrow(/não está mais disponível/i);

    // E o cupom do outro continua intacto.
    expect(await entradasDisponiveis(outro.id)).toBe(1);
  });

  it("duas compras simultâneas com o mesmo cupom: só uma leva", async () => {
    const cupons = await cuponsDe(afiliado.id);
    const de = await idDoAfiliado(afiliado.id);
    const uma = await novaCampanha("5.00");
    const outra = await novaCampanha("5.00");

    const resultados = await Promise.allSettled([
      createReservation(
        compraBase({
          raffleId: uma.id,
          numbers: [1],
          usarEntradaDe: de,
          cupomId: cupons[0]!.id,
        }),
      ),
      createReservation(
        compraBase({
          raffleId: outra.id,
          numbers: [1],
          usarEntradaDe: de,
          cupomId: cupons[0]!.id,
        }),
      ),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await entradasDisponiveis(afiliado.id)).toBe(2);
  });

  it("Pix que expira devolve o cupom ao saldo", async () => {
    const campanha = await novaCampanha("12.00");
    const cupons = await cuponsDe(afiliado.id);
    const reserva = await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );
    expect(await entradasDisponiveis(afiliado.id)).toBe(2);

    await liberarEntradaGratis(reserva.id);
    expect(await entradasDisponiveis(afiliado.id)).toBe(3);
  });

  it("o histórico registra o uso com o valor do cupom", async () => {
    const campanha = await novaCampanha("5.00");
    const cupons = await cuponsDe(afiliado.id);
    await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1],
        usarEntradaDe: await idDoAfiliado(afiliado.id),
        cupomId: cupons[0]!.id,
      }),
    );

    const uso = await prisma.movimentoDeAfiliado.findFirst({
      where: {
        affiliateId: await idDoAfiliado(afiliado.id),
        tipo: "ENTRADA_USADA",
      },
    });
    expect(uso?.entradas).toBe(-1);
    expect(uso?.descricao).toMatch(/R\$ 5,00/);
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
    const cupom = (await cuponsDe(afiliado.id))[0]!;
    await createReservation(
      compraBase({
        raffleId: campanha.id,
        numbers: [1],
        usarEntradaDe: idDoAfiliado,
        cupomId: cupom.id,
      }),
    );

    const { aplicadas } = await ajustarEntradas({
      userId: afiliado.id,
      quantidade: -5,
      motivo: "correção",
      adminId: afiliado.id,
    });
    // Tirar só alcança o que está disponível: o cupom já gasto na compra
    // acima não volta, e o pedido de cinco tira só o que havia.
    expect(aplicadas).toBeGreaterThanOrEqual(-1);
    const painel = await painelDoAfiliado(afiliado.id);
    expect(painel?.cupons).toHaveLength(0);
    // A compra de uma cota de R$ 5 com o cupom zerou o total, então ela
    // nasceu paga e o cupom já saiu como usado, sem passar por reservado.
    expect(painel?.usados).toBe(1);
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
