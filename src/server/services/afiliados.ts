// O programa de afiliados, inteiro.
//
// Toda regra de negócio do programa mora aqui: vincular indicado, transformar
// compra paga em progresso, progresso em Entrada Grátis, e Entrada Grátis em
// cota. As actions e as páginas chamam este arquivo; nenhuma delas decide
// nada por conta própria. Regra de dinheiro espalhada por componente é regra
// que um dia diverge entre dois lugares, e o lado que diverge é sempre o que
// o cliente vê.
//
// AS QUATRO GARANTIAS
//
//   crédito único      MovimentoDeAfiliado tem unique(reservationId, tipo).
//                      Webhook reentregue tenta gravar a mesma linha e o
//                      banco recusa. Não é o código que decide.
//   uma por sorteio    EntradaGratis tem unique(affiliateId, raffleId), e
//                      entrada disponível guarda raffleId nulo. A regra vira
//                      índice, e duas abas simultâneas não a atravessam.
//   uma entrada só     a entrada é reivindicada com UPDATE ... WHERE id IN
//                      (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1). Quem
//                      perde a corrida não acha linha e recebe erro.
//   só dinheiro pago   o progresso vem de reservation.totalAmount, que já
//                      nasce descontado da Entrada Grátis. Entrada não gera
//                      entrada para ninguém.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  CONFIG_PADRAO,
  calcularRecompensa,
  codigoSugerido,
  conferirConfig,
  emCentavos,
  expiracaoDoCupom,
  normalizarCodigo,
  progressaoDoIndicado,
  valorDoCupom,
  type ConfigDeRecompensa,
  type ModoDeRecompensa,
} from "@/lib/afiliados";
import { ValidationError } from "@/lib/errors";

/** O erro que a tela mostra quando a entrada não está mais disponível. */
export class EntradaIndisponivelError extends ValidationError {
  constructor(mensagem = "Cupom de Entrada não está mais disponível.") {
    super(mensagem);
    this.name = "EntradaIndisponivelError";
  }
}

/** Já gastou o cupom desta campanha. */
export class EntradaJaUsadaNoSorteioError extends ValidationError {
  constructor(mensagem = "Cupom de Entrada já utilizado neste sorteio.") {
    super(mensagem);
    this.name = "EntradaJaUsadaNoSorteioError";
  }
}

// ---------------------------------------------------------------- vínculo

/**
 * Liga uma conta ao afiliado dono do código.
 *
 * O vínculo é permanente por decisão de produto: quem já tem afiliado ignora
 * qualquer código novo, em silêncio. Sem isso, bastaria mandar outro link
 * para roubar o indicado de quem trouxe a pessoa, e o programa viraria uma
 * corrida por quem manda o último link.
 *
 * Devolve o código do afiliado quando vinculou, e nulo quando não havia o que
 * fazer (código inexistente, autoindicação, conta já vinculada, afiliado
 * fora do ar). Nunca lança: isto roda dentro do cadastro, e código errado não
 * pode impedir alguém de criar conta.
 */
export async function vincularIndicacao(
  userId: string,
  codigoBruto: string,
): Promise<string | null> {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigo) return null;

  try {
    const [usuario, afiliado] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, referredByAffiliateId: true },
      }),
      prisma.affiliate.findUnique({
        where: { code: codigo },
        select: { id: true, userId: true, status: true, code: true },
      }),
    ]);

    if (!usuario || !afiliado) return null;
    // Afiliado suspenso mantém quem já é dele, mas não recebe gente nova: a
    // suspensão precisa doer em alguma coisa para servir de freio.
    if (afiliado.status !== "ACTIVE") return null;
    // Autoindicação. O ganho seria ganhar entrada com o próprio dinheiro.
    if (afiliado.userId === userId) return null;
    if (usuario.referredByAffiliateId) return null;

    // A escrita é condicional: duas abas terminando o cadastro ao mesmo tempo
    // passariam as duas pelo teste acima, e a segunda sobrescreveria o
    // afiliado da primeira.
    const vinculou = await prisma.user.updateMany({
      where: { id: userId, referredByAffiliateId: null },
      data: { referredByAffiliateId: afiliado.id },
    });
    if (vinculou.count === 0) return null;

    // A linha de qualificação nasce junto do vínculo, e o `criadoEm` dela é o
    // marco: só conta o que a pessoa pagar A PARTIR DAQUI. Sem esse marco,
    // quem já era cliente e aplicou um código depois levaria para o afiliado
    // um dinheiro que ele não trouxe.
    await prisma.qualificacaoDeIndicado.upsert({
      where: { indicadoId: userId },
      update: {},
      create: { affiliateId: afiliado.id, indicadoId: userId },
    });

    return afiliado.code;
  } catch (err) {
    console.error("[afiliados] vincularIndicacao falhou:", err);
    return null;
  }
}

/** O afiliado dono de um código, para a tela dizer "indicado por X". */
export async function afiliadoPorCodigo(codigoBruto: string) {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigo) return null;
  return prisma.affiliate.findFirst({
    where: { code: codigo, status: "ACTIVE" },
    select: { id: true, code: true, user: { select: { name: true } } },
  });
}

// ------------------------------------------------- compra paga → progresso

/**
 * A configuração de recompensa que vale para este afiliado agora.
 *
 * Sem configuração própria, valem os padrões globais. Com ela, valem as
 * colunas do afiliado. Uma função só, usada na concessão e na tela: a conta
 * que o painel mostra é a mesma que o cupom vai receber.
 */
export function configDoAfiliado(afiliado: {
  usaConfigPropria: boolean;
  modoDeRecompensa: ModoDeRecompensa;
  limiarEmCentavos: number;
  recompensaEmBps: number;
  valorDoCupomEmCentavos: number;
  degrauEmCentavos: number;
  bpsPorDegrau: number;
}): ConfigDeRecompensa {
  if (!afiliado.usaConfigPropria) return CONFIG_PADRAO;
  return {
    modo: afiliado.modoDeRecompensa,
    limiarEmCentavos: afiliado.limiarEmCentavos,
    recompensaEmBps: afiliado.recompensaEmBps,
    valorDoCupomEmCentavos: afiliado.valorDoCupomEmCentavos,
    degrauEmCentavos: afiliado.degrauEmCentavos,
    bpsPorDegrau: afiliado.bpsPorDegrau,
  };
}

/** As colunas que `configDoAfiliado` precisa, num lugar só. */
export const SELECAO_DA_CONFIG = {
  usaConfigPropria: true,
  modoDeRecompensa: true,
  limiarEmCentavos: true,
  recompensaEmBps: true,
  valorDoCupomEmCentavos: true,
  degrauEmCentavos: true,
  bpsPorDegrau: true,
} as const;

/**
 * A recompensa de UMA concessão, já sabendo em que modo o afiliado está.
 *
 * No modo de valor fixo o cupom vale sempre o mesmo: a porcentagem foi
 * digitada uma vez e não depende de quem comprou. No modo progressivo ela sai
 * da escada do indicado, e é por isso que esta função precisa do gasto
 * acumulado DELE: o mesmo afiliado pode conceder 2% por um indicado e 10% por
 * outro no mesmo dia.
 */
export function recompensaDaConcessao({
  config,
  gastoDoIndicadoEmCentavos,
}: {
  config: ConfigDeRecompensa;
  gastoDoIndicadoEmCentavos: number;
}): { bps: number; valorEmCentavos: number } {
  if (config.modo !== "PERCENTUAL_PROGRESSIVO") {
    return {
      bps: config.recompensaEmBps,
      valorEmCentavos: config.valorDoCupomEmCentavos,
    };
  }
  const { bps } = progressaoDoIndicado({
    gastoEmCentavos: gastoDoIndicadoEmCentavos,
    degrauEmCentavos: config.degrauEmCentavos,
    bpsPorDegrau: config.bpsPorDegrau,
  });
  return { bps, valorEmCentavos: valorDoCupom(config.limiarEmCentavos, bps) };
}

/**
 * Um pagamento confirmado de um indicado vira progresso e, ao fechar o
 * limiar, vira cupom.
 *
 * A REGRA: a cada R$ 10 pagos pelos indicados (todos eles somados no mesmo
 * progresso), sai 1 Cupom de Entrada de R$ 5. Progressivo: R$ 27,50 dão dois
 * cupons e deixam R$ 7,50 guardados. O mesmo indicado contribui quantas vezes
 * comprar, e indicados diferentes somam entre si.
 *
 * Chamada nos MESMOS seis pontos em que o XP é creditado: os quatro webhooks
 * de pagamento, a consulta que confirma um Pix pendente e a aprovação manual
 * pelo painel.
 *
 * A idempotência é por PAGAMENTO: o movimento da compra tem
 * unique(reservationId, tipo), então a reentrega do webhook esbarra no índice
 * e o mesmo dinheiro não entra duas vezes no progresso.
 */
export async function processarCompraDeIndicado(
  reservationId: string,
): Promise<{ cupons: number; centavos: number } | null> {
  try {
    const reserva = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        userId: true,
        status: true,
        raffleId: true,
        totalAmount: true,
        user: {
          select: {
            id: true,
            referredByAffiliate: { select: { id: true, status: true } },
          },
        },
      },
    });

    // Compra de convidado não tem quem indicou.
    if (!reserva?.user?.referredByAffiliate || !reserva.userId) return null;
    if (reserva.status !== "PAID") return null;

    const afiliado = reserva.user.referredByAffiliate;
    // Suspenso não acumula. O que já ganhou continua valendo: punir o passado
    // é decisão do admin, com ajuste manual e motivo.
    if (afiliado.status !== "ACTIVE") return null;

    // O QUE FOI EFETIVAMENTE PAGO.
    //
    // `totalAmount` já nasce descontado do cupom aplicado na compra, então
    // usar este campo é exatamente "só dinheiro que entrou": uma compra de
    // R$ 12 com cupom de R$ 5 soma R$ 7 ao progresso, nunca R$ 12. Compra
    // inteiramente coberta soma zero e sai daqui sem fazer nada.
    const centavos = emCentavos(Number(reserva.totalAmount));
    if (centavos <= 0) return null;

    const indicadoId = reserva.userId;

    return await prisma.$transaction(async (tx) => {
      await travarAfiliado(tx, afiliado.id);

      const estado = await tx.affiliate.findUnique({
        where: { id: afiliado.id },
        select: { progressoEmCentavos: true, ...SELECAO_DA_CONFIG },
      });
      if (!estado) return null;

      const config = configDoAfiliado(estado);
      const recompensa = calcularRecompensa({
        progressoAnterior: estado.progressoEmCentavos,
        valorEmCentavos: centavos,
        limiarEmCentavos: config.limiarEmCentavos,
      });

      // Esta linha é a trava por pagamento. Se a compra já foi processada, o
      // unique(reservationId, tipo) derruba a transação inteira, e nada do
      // que vem abaixo acontece.
      await tx.movimentoDeAfiliado.create({
        data: {
          affiliateId: afiliado.id,
          tipo: "COMPRA_DE_INDICADO",
          centavos,
          reservationId: reserva.id,
          indicadoId,
          raffleId: reserva.raffleId,
          descricao: "Compra de indicado",
        },
      });

      // O total que aquela pessoa já pagou. No modo de valor fixo é só o
      // número que o painel mostra; no modo progressivo é a conta: é o gasto
      // acumulado DELA que define a porcentagem desta concessão, e por isso
      // este soma tem que acontecer ANTES de calcular o cupom (quem cruza os
      // R$ 100 nesta compra já leva o degrau novo).
      const qualificacao = await tx.qualificacaoDeIndicado.upsert({
        where: { indicadoId },
        update: { pagoEmCentavos: { increment: centavos } },
        create: {
          affiliateId: afiliado.id,
          indicadoId,
          pagoEmCentavos: centavos,
        },
        select: { pagoEmCentavos: true },
      });

      const premio = recompensaDaConcessao({
        config,
        gastoDoIndicadoEmCentavos: qualificacao.pagoEmCentavos,
      });

      // Degrau zero: o indicado ainda não chegou no primeiro patamar, então
      // o cupom valeria R$ 0. Em vez de conceder nada e queimar o progresso,
      // o progresso fica guardado inteiro e converte quando a porcentagem
      // deixar de ser zero. Nada de dinheiro real se perde no caminho.
      const semDegrau = premio.valorEmCentavos <= 0;
      if (semDegrau) {
        await tx.affiliate.update({
          where: { id: afiliado.id },
          data: { progressoEmCentavos: estado.progressoEmCentavos + centavos },
        });
        console.info(
          `[afiliados] compra ${reserva.id} somou ${centavos} centavos ao afiliado ${afiliado.id}, indicado ainda no degrau zero`,
        );
        return { cupons: 0, centavos };
      }

      if (recompensa.cupons > 0) {
        // UM CUPOM POR RECOMPENSA, e não um cupom somado.
        //
        // Dois limiares fechados viram dois cupons de R$ 5, e nunca um de
        // R$ 10: o cupom é consumido por inteiro numa cota, então juntá-los
        // valeria menos para quem recebe.
        //
        // Cada um carrega a configuração do momento: mudar a recompensa
        // amanhã não reescreve o que já foi dado.
        // O prazo nasce junto com o cupom, e é calculado aqui e não no banco:
        // a regra das 72 horas mora em lib/afiliados, num lugar só, testada
        // sem banco. O `agora` é o mesmo para todos os cupons desta concessão.
        const agora = new Date();
        await tx.entradaGratis.createMany({
          data: Array.from({ length: recompensa.cupons }, () => ({
            affiliateId: afiliado.id,
            valorEmCentavos: premio.valorEmCentavos,
            limiarNaConcessao: config.limiarEmCentavos,
            bpsNaConcessao: premio.bps,
            ganhaEm: agora,
            expiraEm: expiracaoDoCupom(agora),
          })),
        });
        await tx.movimentoDeAfiliado.create({
          data: {
            affiliateId: afiliado.id,
            tipo: "ENTRADA_LIBERADA",
            entradas: recompensa.cupons,
            indicadoId,
            raffleId: reserva.raffleId,
            descricao:
              recompensa.cupons === 1
                ? `Cupom de Entrada liberado (${formatarCentavos(premio.valorEmCentavos)})`
                : `${recompensa.cupons} Cupons de Entrada liberados (${formatarCentavos(premio.valorEmCentavos)} cada)`,
          },
        });
      }

      await tx.affiliate.update({
        where: { id: afiliado.id },
        data: { progressoEmCentavos: recompensa.progressoRestante },
      });

      console.info(
        `[afiliados] compra ${reserva.id} somou ${centavos} centavos e liberou ${recompensa.cupons} cupom(ns) ao afiliado ${afiliado.id}`,
      );
      return { cupons: recompensa.cupons, centavos };
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Reentrega do webhook. O caminho normal, não um defeito.
      console.info(
        `[afiliados] compra ${reservationId} já processada, ignorando reentrega`,
      );
      return null;
    }
    console.error("[afiliados] processarCompraDeIndicado falhou:", err);
    return null;
  }
}

/** R$ para o texto do histórico, sem arrastar o formatador da UI para cá. */
function formatarCentavos(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * Tudo o que o programa de afiliados faz quando um pagamento é confirmado.
 *
 * Existe para que os seis pontos de confirmação (quatro webhooks, a consulta
 * do Pix pendente e a aprovação manual no painel) chamem UMA coisa. Seis
 * chamadas montadas à mão divergem: um dia alguém acrescenta um passo em
 * cinco delas e o sexto caminho passa meses entregando metade do benefício.
 */
export async function processarPagamentoConfirmado(
  reservationId: string,
): Promise<void> {
  // A entrada reservada vira gasta antes do crédito: se o processo morrer no
  // meio, o pior estado possível é uma entrada já consumida numa compra paga,
  // e não uma entrada solta com a compra já creditada.
  await confirmarEntradaGratis(reservationId);
  await processarCompraDeIndicado(reservationId);
}

/**
 * Um pagamento foi estornado: o progresso volta atrás.
 *
 * O dinheiro que entrou é subtraído do progresso. Se isso deixar o progresso
 * negativo, cupons AINDA DISPONÍVEIS são cancelados para cobrir a dívida, um
 * por limiar, do mais novo para o mais antigo.
 *
 * O que sobrar de dívida fica como progresso negativo, e isso é de propósito:
 * cupom já usado não é apagado (a cota existiu, o sorteio contou com ela), e
 * fingir que a conta fechou seria perdoar o estorno em silêncio. O número
 * negativo aparece só no painel administrativo, e o próximo dinheiro real
 * quita a dívida antes de gerar cupom novo.
 */
export async function reverterCompraDeIndicado(
  reservationId: string,
): Promise<{ cancelados: number; progresso: number } | null> {
  try {
    const original = await prisma.movimentoDeAfiliado.findFirst({
      where: { reservationId, tipo: "COMPRA_DE_INDICADO" },
      select: { affiliateId: true, centavos: true, indicadoId: true },
    });
    if (!original) return null;

    return await prisma.$transaction(async (tx) => {
      await travarAfiliado(tx, original.affiliateId);

      const estado = await tx.affiliate.findUnique({
        where: { id: original.affiliateId },
        select: { progressoEmCentavos: true, ...SELECAO_DA_CONFIG },
      });
      if (!estado) return null;
      const config = configDoAfiliado(estado);

      await tx.movimentoDeAfiliado.create({
        data: {
          affiliateId: original.affiliateId,
          tipo: "ESTORNO_DE_COMPRA",
          centavos: -original.centavos,
          reservationId,
          indicadoId: original.indicadoId,
          descricao: "Estorno de compra de indicado",
        },
      });

      if (original.indicadoId) {
        await tx.qualificacaoDeIndicado.updateMany({
          where: { indicadoId: original.indicadoId },
          data: { pagoEmCentavos: { decrement: original.centavos } },
        });
      }

      let progresso = estado.progressoEmCentavos - original.centavos;
      let cancelados = 0;

      // Enquanto houver dívida e cupom disponível, o cupom é recolhido e o
      // progresso sobe de volta o limiar que o originou.
      while (progresso < 0) {
        const cupom = await tx.entradaGratis.findFirst({
          where: { affiliateId: original.affiliateId, estado: "DISPONIVEL" },
          orderBy: { ganhaEm: "desc" },
          select: { id: true, limiarNaConcessao: true },
        });
        if (!cupom) break;
        const recolhido = await tx.entradaGratis.updateMany({
          where: { id: cupom.id, estado: "DISPONIVEL" },
          data: { estado: "CANCELADA" },
        });
        if (recolhido.count === 0) break;
        cancelados++;
        progresso += cupom.limiarNaConcessao || config.limiarEmCentavos;
      }

      if (cancelados > 0) {
        await tx.movimentoDeAfiliado.create({
          data: {
            affiliateId: original.affiliateId,
            tipo: "QUALIFICACAO_REVERTIDA",
            entradas: -cancelados,
            indicadoId: original.indicadoId,
            descricao: `Estorno: ${cancelados} cupom(ns) disponível(is) cancelado(s)`,
          },
        });
      }
      if (progresso < 0) {
        console.warn(
          `[afiliados] afiliado ${original.affiliateId} ficou com dívida de progresso de ${-progresso} centavos: revisar`,
        );
      }

      await tx.affiliate.update({
        where: { id: original.affiliateId },
        data: { progressoEmCentavos: progresso },
      });

      return { cancelados, progresso };
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return null; // Estorno já processado.
    }
    console.error("[afiliados] reverterCompraDeIndicado falhou:", err);
    return null;
  }
}

// ------------------------------------------------------- Entrada Grátis

export interface CupomNaMao {
  id: string;
  valorEmCentavos: number;
  /** Quando ele vence. Nulo é cupom sem validade. */
  expiraEm: Date | null;
}

/**
 * A condição de "cupom que dá para usar agora", escrita uma vez.
 *
 * Disponível E dentro do prazo. Vive aqui e não repetida em cada consulta
 * porque esquecer o prazo em UMA delas é entregar cupom vencido no checkout,
 * e esse é o tipo de esquecimento que só aparece na reclamação.
 */
export function cupomUsavel(agora: Date = new Date()) {
  return {
    estado: "DISPONIVEL" as const,
    OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }],
  };
}

export interface SituacaoDaEntrada {
  /** A pessoa é afiliada ativa. Sem isso, o cartão nem aparece. */
  ehAfiliado: boolean;
  /** Os cupons prontos para usar, com o valor de cada um. */
  cupons: CupomNaMao[];
  /** Já gastou (ou reservou) um cupom nesta campanha. */
  jaUsouNesteSorteio: boolean;
  /** A campanha aceita cupom do programa. */
  campanhaAceita: boolean;
  /** O preço de uma cota, em centavos, para a tela calcular o abatimento. */
  precoDaCotaEmCentavos: number;
  /** Dá para aplicar um cupom nesta compra agora. */
  podeUsar: boolean;
}

/**
 * O que o checkout precisa saber, resolvido no servidor.
 *
 * Manda a LISTA de cupons, e não um contador: alterações administrativas fazem
 * cupons antigos e novos valerem valores diferentes, e quem escolhe qual usar
 * é a pessoa. Escolher sozinho o de maior valor gastaria o melhor cupom numa
 * cota barata sem ninguém pedir.
 */
export async function situacaoDaEntrada(
  userId: string | null | undefined,
  raffleId: string,
): Promise<SituacaoDaEntrada> {
  const vazio: SituacaoDaEntrada = {
    ehAfiliado: false,
    cupons: [],
    jaUsouNesteSorteio: false,
    campanhaAceita: false,
    precoDaCotaEmCentavos: 0,
    podeUsar: false,
  };
  if (!userId) return vazio;

  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!afiliado || afiliado.status === "INACTIVE") return vazio;

  const [cupons, nesteSorteio, campanha] = await Promise.all([
    prisma.entradaGratis.findMany({
      where: { affiliateId: afiliado.id, ...cupomUsavel() },
      select: { id: true, valorEmCentavos: true, expiraEm: true },
      // Do mais barato para o mais caro, e entre iguais o que vence antes:
      // a lista começa pelo que a pessoa provavelmente quer gastar numa cota
      // pequena, e não deixa o que está para vencer no fim da fila.
      orderBy: [{ valorEmCentavos: "asc" }, { expiraEm: "asc" }, { ganhaEm: "asc" }],
    }),
    prisma.entradaGratis.findFirst({
      where: {
        affiliateId: afiliado.id,
        raffleId,
        estado: { in: ["RESERVADA", "USADA"] },
      },
      select: { id: true },
    }),
    prisma.raffle.findUnique({
      where: { id: raffleId },
      select: {
        pricePerNumber: true,
        isFree: true,
        aceitaCupomDeAfiliado: true,
      },
    }),
  ]);

  const precoDaCota = campanha?.isFree ? 0 : Number(campanha?.pricePerNumber ?? 0);
  const jaUsouNesteSorteio = nesteSorteio != null;
  const campanhaAceita = Boolean(campanha?.aceitaCupomDeAfiliado) && precoDaCota > 0;

  return {
    ehAfiliado: true,
    cupons,
    jaUsouNesteSorteio,
    campanhaAceita,
    precoDaCotaEmCentavos: emCentavos(precoDaCota),
    podeUsar: cupons.length > 0 && !jaUsouNesteSorteio && campanhaAceita,
  };
}

/**
 * Tira UM cupom específico do saldo, dentro da transação da compra.
 *
 * O id vem de quem chama, e não é escolhido aqui: a pessoa pode ter cupons de
 * valores diferentes e escolhe qual gastar. O `FOR UPDATE` na linha resolve as
 * duas abas: a segunda transação espera, encontra o cupom já fora de
 * DISPONIVEL e a compra dela falha, em vez de gastar o mesmo cupom duas vezes.
 *
 * Acontece ANTES de a compra existir, porque é o valor de face devolvido aqui
 * que decide quanto a compra vai custar. O vínculo com a reserva vem logo
 * depois, em `amarrarCupomNaCompra`.
 */
export async function reivindicarCupomDaCompra(
  tx: Prisma.TransactionClient,
  affiliateId: string,
  cupomId: string,
): Promise<{ id: string; valorEmCentavos: number }> {
  const linhas = await tx.$queryRaw<{ id: string; valorEmCentavos: number }[]>`
    SELECT "id", "valorEmCentavos"
      FROM "EntradaGratis"
     WHERE "id" = ${cupomId}
       AND "affiliateId" = ${affiliateId}
       AND "estado" = 'DISPONIVEL'
       AND ("expiraEm" IS NULL OR "expiraEm" > now())
     FOR UPDATE
  `;
  const cupom = linhas[0];
  // Não achou: ou não é dele, ou já foi gasto entre a tela e o clique, ou
  // venceu enquanto a aba ficava aberta. O prazo entra aqui dentro do
  // FOR UPDATE de propósito: conferir a validade antes, fora da trava,
  // deixaria a janela de gastar um cupom que venceu no meio do caminho.
  if (!cupom) throw new EntradaIndisponivelError();
  return cupom;
}

/**
 * Amarra o cupom já reivindicado à compra que acabou de nascer.
 *
 * O unique(affiliateId, raffleId) é a trava de "um cupom por sorteio": duas
 * compras na MESMA campanha, cada uma com o seu cupom, e a segunda esbarra no
 * índice em vez de passar por um `if`.
 */
export async function amarrarCupomNaCompra(
  tx: Prisma.TransactionClient,
  affiliateId: string,
  cupom: { id: string; valorEmCentavos: number },
  raffleId: string,
  reservationId: string,
  jaPaga: boolean,
): Promise<void> {
  try {
    await tx.$executeRaw`
      UPDATE "EntradaGratis"
         SET "estado" = ${jaPaga ? "USADA" : "RESERVADA"}::"EstadoDaEntradaGratis",
             "raffleId" = ${raffleId},
             "reservationId" = ${reservationId},
             "usadaEm" = ${jaPaga ? new Date() : null}
       WHERE "id" = ${cupom.id}
    `;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new EntradaJaUsadaNoSorteioError();
    }
    // Consulta crua não vira P2002: o Prisma devolve "Raw query failed. Code:
    // 23505". É unique_violation, e o único índice único que este UPDATE pode
    // violar é o de um cupom por sorteio.
    if (err instanceof Error && /23505/.test(err.message)) {
      throw new EntradaJaUsadaNoSorteioError();
    }
    throw err;
  }

  await tx.movimentoDeAfiliado.create({
    data: {
      affiliateId,
      tipo: "ENTRADA_USADA",
      entradas: -1,
      reservationId,
      raffleId,
      descricao: `Cupom de Entrada de ${formatarCentavos(cupom.valorEmCentavos)} aplicado na compra`,
    },
  });
}

/**
 * O Pix foi pago: a entrada reservada vira gasta de vez.
 *
 * Chamado junto do resto da confirmação. Idempotente pela guarda de estado.
 */
export async function confirmarEntradaGratis(
  reservationId: string,
): Promise<void> {
  try {
    await prisma.entradaGratis.updateMany({
      where: { reservationId, estado: "RESERVADA" },
      data: { estado: "USADA", usadaEm: new Date() },
    });
  } catch (err) {
    console.error("[afiliados] confirmarEntradaGratis falhou:", err);
  }
}

/**
 * O Pix expirou ou a compra caiu: a entrada volta para o saldo.
 *
 * Volta com raffleId nulo, e isso importa: é o que libera o índice único e
 * permite usar uma entrada naquele mesmo sorteio de novo. Entrada já USADA
 * não volta, mesmo que a reserva seja cancelada depois: aquela cota existiu.
 */
export async function liberarEntradaGratis(
  reservationId: string,
): Promise<number> {
  try {
    const presas = await prisma.entradaGratis.findMany({
      where: { reservationId, estado: "RESERVADA" },
      select: { id: true, affiliateId: true, raffleId: true },
    });
    if (presas.length === 0) return 0;

    let devolvidas = 0;
    for (const entrada of presas) {
      const soltou = await prisma.entradaGratis.updateMany({
        where: { id: entrada.id, estado: "RESERVADA" },
        data: {
          estado: "DISPONIVEL",
          raffleId: null,
          reservationId: null,
          usadaEm: null,
        },
      });
      if (soltou.count === 0) continue;
      devolvidas += soltou.count;
      await prisma.movimentoDeAfiliado.create({
        data: {
          affiliateId: entrada.affiliateId,
          tipo: "ENTRADA_DEVOLVIDA",
          entradas: 1,
          raffleId: entrada.raffleId,
          descricao: "Compra não paga: Entrada Grátis devolvida",
        },
      });
    }
    if (devolvidas > 0) {
      console.info(
        `[afiliados] reserva ${reservationId} liberou ${devolvidas} entrada(s)`,
      );
    }
    return devolvidas;
  } catch (err) {
    console.error("[afiliados] liberarEntradaGratis falhou:", err);
    return 0;
  }
}

// ---------------------------------------------------------------- painel

export interface PainelDoAfiliado {
  codigo: string;
  status: "INACTIVE" | "ACTIVE" | "SUSPENDED";
  /** Os cupons prontos para usar, um a um, com valor e prazo de cada. */
  cupons: CupomNaMao[];
  reservados: number;
  usados: number;
  /** Tudo o que já ganhou, desde sempre. */
  conquistados: number;
  /** Pessoas vinculadas ao código. */
  indicados: number;
  /** O progresso rumo ao próximo cupom. Negativo é dívida de estorno. */
  progressoEmCentavos: number;
  config: ConfigDeRecompensa;
}

/** Tudo o que a página "Programa de Afiliados" mostra, num lugar só. */
export async function painelDoAfiliado(
  userId: string,
): Promise<PainelDoAfiliado | null> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: {
      id: true,
      code: true,
      status: true,
      progressoEmCentavos: true,
      ...SELECAO_DA_CONFIG,
    },
  });
  if (!afiliado) return null;

  const [cupons, reservados, usados, conquistados, indicados] =
    await Promise.all([
      prisma.entradaGratis.findMany({
        where: { affiliateId: afiliado.id, ...cupomUsavel() },
        select: { id: true, valorEmCentavos: true, expiraEm: true },
        // O que vence antes aparece primeiro: é o que a pessoa precisa gastar
        // antes, e a contagem regressiva ao lado dele só faz sentido no topo.
        orderBy: [{ expiraEm: "asc" }, { valorEmCentavos: "desc" }, { ganhaEm: "asc" }],
      }),
      prisma.entradaGratis.count({
        where: { affiliateId: afiliado.id, estado: "RESERVADA" },
      }),
      prisma.entradaGratis.count({
        where: { affiliateId: afiliado.id, estado: "USADA" },
      }),
      prisma.movimentoDeAfiliado.aggregate({
        where: {
          affiliateId: afiliado.id,
          tipo: { in: ["ENTRADA_LIBERADA", "AJUSTE"] },
        },
        _sum: { entradas: true },
      }),
      prisma.user.count({ where: { referredByAffiliateId: afiliado.id } }),
    ]);

  return {
    codigo: afiliado.code,
    status: afiliado.status,
    cupons,
    reservados,
    usados,
    conquistados: Math.max(0, conquistados._sum.entradas ?? 0),
    indicados,
    progressoEmCentavos: afiliado.progressoEmCentavos,
    config: configDoAfiliado(afiliado),
  };
}

/** O histórico, do mais recente para o mais antigo. */
export async function historicoDoAfiliado(
  userId: string,
  limite = 30,
): Promise<
  {
    id: string;
    tipo: string;
    centavos: number;
    entradas: number;
    descricao: string | null;
    campanha: string | null;
    quando: Date;
  }[]
> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!afiliado) return [];

  // SÓ AS LIBERAÇÕES DE CUPOM.
  //
  // A lista mostrava também "Compra de indicado +R$ 12,93", que é o extrato
  // de quem clicou no link escrito de outro jeito: com um indicado só, aquela
  // linha entrega exatamente quanto a pessoa gastou. O que interessa a quem
  // divulga é o que ele ganhou, e é isso que sobra aqui.
  const movimentos = await prisma.movimentoDeAfiliado.findMany({
    where: { affiliateId: afiliado.id, tipo: "ENTRADA_LIBERADA" },
    orderBy: { criadoEm: "desc" },
    take: limite,
    select: {
      id: true,
      tipo: true,
      centavos: true,
      entradas: true,
      descricao: true,
      criadoEm: true,
    },
  });

  return movimentos.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    centavos: m.centavos,
    entradas: m.entradas,
    descricao: m.descricao,
    // A campanha sai junto: qual sorteio o indicado comprou é a rotina dele,
    // e a linha aqui é sobre o cupom que caiu na mão de quem indicou.
    campanha: null,
    quando: m.criadoEm,
  }));
}

/**
 * Os indicados, sem dado pessoal e SEM O QUANTO CADA UM GASTOU.
 *
 * O que sai daqui: primeiro nome com a inicial do sobrenome, desde quando, e
 * o quanto a pessoa já andou no ciclo atual, em PORCENTAGEM. Telefone, CPF,
 * e-mail e o valor gasto não saem.
 *
 * O valor não sai nem como número escondido no HTML. Quem indicou não vira
 * dono da vida financeira de quem foi indicado: saber que um amigo gastou
 * R$ 347,50 no site é informação dele, não de quem mandou o link. A barra
 * responde a única pergunta que interessa a quem divulga ("falta muito?")
 * sem entregar a resposta que não interessa ("quanto ele gastou?").
 *
 * `jaRendeu` diz apenas SE aquela pessoa já cruzou o limiar alguma vez, e de
 * propósito não diz quantas: "fechou 34 ciclos" é o valor gasto escrito de
 * outro jeito (34 x R$ 10), e teria desfeito no rodapé o que a barra protege.
 */
export interface ProgressoDoIndicado {
  /** De 0 a 100, quanto do ciclo atual já foi andado. */
  percentual: number;
  /** Se esta pessoa já cruzou o limiar ao menos uma vez. */
  jaRendeu: boolean;
  /** No modo progressivo, a porcentagem que ela rende hoje. Null no fixo. */
  bpsAtual: number | null;
}

export async function indicadosDoAfiliado(
  userId: string,
  limite = 50,
): Promise<
  {
    id: string;
    nome: string;
    desde: Date;
    time: string | null;
    progresso: ProgressoDoIndicado;
  }[]
> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, ...SELECAO_DA_CONFIG },
  });
  if (!afiliado) return [];
  const config = configDoAfiliado(afiliado);

  const indicados = await prisma.user.findMany({
    where: { referredByAffiliateId: afiliado.id },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      name: true,
      createdAt: true,
      favoriteTeamId: true,
      qualificacao: { select: { pagoEmCentavos: true } },
    },
  });

  // O ciclo é o limiar da configuração que vale para este afiliado, e não um
  // número fixo: quem tem configuração própria de R$ 20 vê a barra encher em
  // R$ 20, igual ao que o cartão de cima promete.
  const ciclo = Math.max(1, config.limiarEmCentavos);

  return indicados.map((i) => {
    const pago = Math.max(0, i.qualificacao?.pagoEmCentavos ?? 0);
    return {
      id: i.id,
      nome: nomeMascarado(i.name),
      desde: i.createdAt,
      time: i.favoriteTeamId,
      progresso: {
        // Arredonda para baixo: uma barra em 100% com o ciclo ainda aberto
        // seria a tela prometendo um cupom que não saiu.
        percentual: Math.min(100, Math.floor(((pago % ciclo) / ciclo) * 100)),
        jaRendeu: pago >= ciclo,
        bpsAtual:
          config.modo === "PERCENTUAL_PROGRESSIVO"
            ? progressaoDoIndicado({
                gastoEmCentavos: pago,
                degrauEmCentavos: config.degrauEmCentavos,
                bpsPorDegrau: config.bpsPorDegrau,
              }).bps
            : null,
      },
    };
  });
}

/** "Mateus Nascimento Rodrigues" → "Mateus N." */
function nomeMascarado(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? "";
  return partes.length > 1 ? `${primeiro} ${partes[1]!.slice(0, 1)}.` : primeiro;
}

// ----------------------------------------------------------------- painel admin

/**
 * Vira afiliado, ou reativa quem já foi. Devolve o código.
 *
 * Serve aos dois caminhos: o admin ativando alguém e a própria pessoa
 * clicando em "quero ser afiliado". Não concede cupom nenhum na ativação;
 * cupom só nasce de indicado que pagou.
 */
export async function ativarAfiliado(
  userId: string,
  codigoDesejado?: string,
): Promise<{ code: string }> {
  const existente = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, code: true },
  });
  if (existente) {
    await prisma.affiliate.update({
      where: { id: existente.id },
      data: { status: "ACTIVE" },
    });
    return { code: existente.code };
  }

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  if (!usuario) throw new ValidationError("Usuário não encontrado");

  const escolhido = codigoDesejado ? normalizarCodigo(codigoDesejado) : "";
  // Tenta o código pedido; sem ele, deriva do nome. A colisão é resolvida
  // aqui e não devolvida como erro: o admin pediu para ativar, não para
  // escolher nome.
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const code =
      escolhido && tentativa === 0
        ? escolhido
        : codigoSugerido(
            usuario.name,
            Math.random().toString(36).slice(2, 6),
          );
    try {
      const criado = await prisma.affiliate.create({
        data: { userId, code, status: "ACTIVE" },
        select: { code: true },
      });
      return criado;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        if (escolhido && tentativa === 0) {
          throw new ValidationError("Esse código já está em uso");
        }
        continue;
      }
      throw err;
    }
  }
  throw new ValidationError("Não foi possível gerar um código livre");
}

export async function definirStatusDoAfiliado(
  userId: string,
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE",
): Promise<void> {
  await prisma.affiliate.update({ where: { userId }, data: { status } });
}

export async function alterarCodigo(
  userId: string,
  codigoBruto: string,
): Promise<string> {
  const code = normalizarCodigo(codigoBruto);
  if (code.length < 4) {
    throw new ValidationError("O código precisa ter ao menos 4 caracteres");
  }
  try {
    const salvo = await prisma.affiliate.update({
      where: { userId },
      data: { code },
      select: { code: true },
    });
    return salvo.code;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ValidationError("Esse código já está em uso");
    }
    throw err;
  }
}

/**
 * Ajuste manual de entradas, sempre com motivo e responsável.
 *
 * Nunca mexe no saldo por fora do histórico: o movimento é criado na mesma
 * transação que cria ou apaga as linhas de entrada. Retirar só alcança
 * entrada disponível, pelo mesmo motivo do estorno.
 */
export async function ajustarEntradas({
  userId,
  quantidade,
  motivo,
  adminId,
}: {
  userId: string;
  quantidade: number;
  motivo: string;
  adminId: string;
}): Promise<{ aplicadas: number }> {
  if (!Number.isInteger(quantidade) || quantidade === 0) {
    throw new ValidationError("Informe quantas entradas somar ou tirar");
  }
  if (Math.abs(quantidade) > 100) {
    throw new ValidationError("Ajuste de no máximo 100 entradas por vez");
  }
  if (motivo.trim().length < 3) {
    throw new ValidationError("Escreva o motivo do ajuste");
  }

  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!afiliado) throw new ValidationError("Esse usuário não é afiliado");

  return await prisma.$transaction(async (tx) => {
    await travarAfiliado(tx, afiliado.id);

    let aplicadas = 0;
    if (quantidade > 0) {
      await tx.entradaGratis.createMany({
        data: Array.from({ length: quantidade }, () => ({
          affiliateId: afiliado.id,
        })),
      });
      aplicadas = quantidade;
    } else {
      const alvo = await tx.entradaGratis.findMany({
        where: { affiliateId: afiliado.id, estado: "DISPONIVEL" },
        select: { id: true },
        orderBy: { ganhaEm: "desc" },
        take: -quantidade,
      });
      const apagadas = await tx.entradaGratis.deleteMany({
        where: { id: { in: alvo.map((e) => e.id) }, estado: "DISPONIVEL" },
      });
      // Sem o zero explícito, apagar nada dá -0, que não é 0 para toBe.
      aplicadas = apagadas.count === 0 ? 0 : -apagadas.count;
    }

    await tx.movimentoDeAfiliado.create({
      data: {
        affiliateId: afiliado.id,
        tipo: "AJUSTE",
        entradas: aplicadas,
        adminId,
        descricao: motivo.trim().slice(0, 200),
      },
    });

    return { aplicadas };
  });
}

/**
 * A lista do painel: quem é afiliado e como vai o programa de cada um.
 *
 * Sem busca, devolve só os últimos vinte. Cada afiliado ocupa um cartão alto,
 * com métricas e ajuste; despejar centenas deles empilhados não é lista, é
 * rolagem. Quem procura alguém específico digita o nome ou o código.
 */
export const AFILIADOS_POR_PAGINA = 20;

export async function listarAfiliados(termo?: string) {
  const busca = (termo ?? "").trim();
  const afiliados = await prisma.affiliate.findMany({
    where: busca
      ? {
          OR: [
            { code: { contains: normalizarCodigo(busca) } },
            { user: { name: { contains: busca, mode: "insensitive" } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: AFILIADOS_POR_PAGINA,
    select: {
      id: true,
      code: true,
      status: true,
      createdAt: true,
      progressoEmCentavos: true,
      ...SELECAO_DA_CONFIG,
      user: { select: { id: true, name: true, phone: true } },
      _count: { select: { indicados: true, entradas: true } },
    },
  });
  if (afiliados.length === 0) return [];

  const usadas = await prisma.entradaGratis.groupBy({
    by: ["affiliateId", "estado"],
    where: { affiliateId: { in: afiliados.map((a) => a.id) } },
    _count: { _all: true },
  });
  const porAfiliado = new Map<string, Record<string, number>>();
  for (const linha of usadas) {
    const atual = porAfiliado.get(linha.affiliateId) ?? {};
    atual[linha.estado] = linha._count._all;
    porAfiliado.set(linha.affiliateId, atual);
  }

  return afiliados.map((a) => {
    const contagem = porAfiliado.get(a.id) ?? {};
    return {
      id: a.id,
      userId: a.user.id,
      nome: a.user.name,
      telefone: a.user.phone,
      codigo: a.code,
      status: a.status,
      indicados: a._count.indicados,
      progressoEmCentavos: a.progressoEmCentavos,
      usaConfigPropria: a.usaConfigPropria,
      config: configDoAfiliado(a),
      disponiveis: contagem.DISPONIVEL ?? 0,
      reservadas: contagem.RESERVADA ?? 0,
      usadas: contagem.USADA ?? 0,
      desde: a.createdAt,
    };
  });
}

// --------------------------------------------------------------- interno

/**
 * Serializa quem mexe no mesmo afiliado.
 *
 * Duas compras de indicados diferentes confirmadas no mesmo instante leriam o
 * mesmo progresso e gravariam o mesmo resto, perdendo o dinheiro de uma
 * delas. O cadeado é o mesmo mecanismo que a alocação de prêmios usa, e vale
 * até o fim da transação.
 */
async function travarAfiliado(
  tx: Prisma.TransactionClient,
  affiliateId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('afiliado'), hashtext(${affiliateId}))
  `;
}

/**
 * Grava a configuração de recompensa de um afiliado.
 *
 * O backend é a fonte canônica: recebe limiar e porcentagem, DERIVA o valor do
 * cupom, e confere. O que a tela mandou no campo de valor serve só para
 * comparar e recusar quando os dois não batem, porque a tela pode estar
 * desatualizada, e um cupom valendo diferente do que o painel prometeu é o
 * tipo de divergência que só aparece na reclamação de quem recebeu.
 *
 * Não mexe em cupom nenhum, nem no progresso: a mudança vale daqui para a
 * frente, e o histórico guarda de onde para onde foi.
 */
export async function definirConfigDeRecompensa({
  userId,
  usaConfigPropria,
  modo,
  limiarEmCentavos,
  recompensaEmBps,
  valorDoCupomEmCentavos,
  degrauEmCentavos,
  bpsPorDegrau,
  adminId,
}: {
  modo: ModoDeRecompensa;
  /** De quanto em quanto o indicado sobe um degrau (modo progressivo). */
  degrauEmCentavos: number;
  /** Quanto cada degrau soma na porcentagem (modo progressivo). */
  bpsPorDegrau: number;
  userId: string;
  usaConfigPropria: boolean;
  limiarEmCentavos: number;
  recompensaEmBps: number;
  /** O que a tela calculou. Confere com o que o servidor deriva. */
  valorDoCupomEmCentavos: number;
  adminId: string;
}): Promise<ConfigDeRecompensa> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, ...SELECAO_DA_CONFIG },
  });
  if (!afiliado) throw new ValidationError("Esse usuário não é afiliado");

  const anterior = configDoAfiliado(afiliado);

  if (!usaConfigPropria) {
    await prisma.affiliate.update({
      where: { id: afiliado.id },
      data: { usaConfigPropria: false },
    });
    await registrarMudancaDeConfig(afiliado.id, anterior, CONFIG_PADRAO, adminId);
    return CONFIG_PADRAO;
  }

  // O valor é DERIVADO, e o que veio da tela só é conferido. No modo
  // progressivo não existe um valor único a conferir: ele muda por indicado,
  // então o que fica gravado nessas colunas é o teto da escada, e a
  // conferência é a da escada.
  const derivado = valorDoCupom(limiarEmCentavos, recompensaEmBps);
  const nova: ConfigDeRecompensa = {
    modo,
    limiarEmCentavos,
    recompensaEmBps,
    valorDoCupomEmCentavos: derivado,
    degrauEmCentavos,
    bpsPorDegrau,
  };
  const problema = conferirConfig(nova);
  if (problema) throw new ValidationError(problema.mensagem);
  if (modo === "VALOR_FIXO" && valorDoCupomEmCentavos !== derivado) {
    throw new ValidationError(
      "O valor do cupom não bate com a porcentagem. Recarregue a tela e tente de novo.",
    );
  }

  await prisma.affiliate.update({
    where: { id: afiliado.id },
    data: {
      usaConfigPropria: true,
      modoDeRecompensa: nova.modo,
      limiarEmCentavos: nova.limiarEmCentavos,
      recompensaEmBps: nova.recompensaEmBps,
      valorDoCupomEmCentavos: nova.valorDoCupomEmCentavos,
      degrauEmCentavos: nova.degrauEmCentavos,
      bpsPorDegrau: nova.bpsPorDegrau,
    },
  });
  await registrarMudancaDeConfig(afiliado.id, anterior, nova, adminId);
  return nova;
}

/** O de-para da mudança, no histórico do próprio afiliado. */
async function registrarMudancaDeConfig(
  affiliateId: string,
  antes: ConfigDeRecompensa,
  depois: ConfigDeRecompensa,
  adminId: string,
): Promise<void> {
  await prisma.movimentoDeAfiliado.create({
    data: {
      affiliateId,
      tipo: "CONFIG_ALTERADA",
      adminId,
      descricao: `Recompensa: ${formatarCentavos(antes.valorDoCupomEmCentavos)} a cada ${formatarCentavos(antes.limiarEmCentavos)} (${antes.recompensaEmBps / 100}%) para ${formatarCentavos(depois.valorDoCupomEmCentavos)} a cada ${formatarCentavos(depois.limiarEmCentavos)} (${depois.recompensaEmBps / 100}%)`,
    },
  });
}

/**
 * Quantos cupons uma mudança de limiar libera na hora.
 *
 * O progresso guardado não é apagado quando o limiar muda: se o novo limiar
 * for menor que o que já está acumulado, aquele progresso vira cupom
 * imediatamente. O painel mostra isto ANTES de salvar, porque cupom que
 * aparece sem ninguém entender por quê é reclamação garantida.
 */
export async function previewDaMudancaDeLimiar(
  userId: string,
  novoLimiarEmCentavos: number,
): Promise<{ cuponsImediatos: number; progressoEmCentavos: number }> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { progressoEmCentavos: true },
  });
  const progresso = afiliado?.progressoEmCentavos ?? 0;
  if (novoLimiarEmCentavos <= 0 || progresso <= 0) {
    return { cuponsImediatos: 0, progressoEmCentavos: progresso };
  }
  return {
    cuponsImediatos: Math.floor(progresso / novoLimiarEmCentavos),
    progressoEmCentavos: progresso,
  };
}
