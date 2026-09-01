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
//   um por indicado    QualificacaoDeIndicado tem unique(indicadoId) e
//                      unique(entradaId). Uma pessoa indicada libera UM cupom
//                      na vida, e o mesmo cupom não é reclamado duas vezes.
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
  LIMIAR_DA_ENTRADA_EM_CENTAVOS,
  VALOR_DO_CUPOM_EM_CENTAVOS,
  avaliarQualificacao,
  codigoSugerido,
  descontoDoCupom,
  emCentavos,
  normalizarCodigo,
} from "@/lib/afiliados";
import { ValidationError } from "@/lib/errors";

/** O erro que a tela mostra quando a entrada não está mais disponível. */
export class EntradaIndisponivelError extends ValidationError {
  constructor(mensagem = "Entrada grátis não está mais disponível.") {
    super(mensagem);
    this.name = "EntradaIndisponivelError";
  }
}

/** Já gastou a entrada desta campanha. */
export class EntradaJaUsadaNoSorteioError extends ValidationError {
  constructor(mensagem = "Entrada grátis já utilizada neste sorteio.") {
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
 * O total que ESTA pessoa indicada já pagou de verdade, em centavos.
 *
 * Recalculado, e não acumulado: um acumulador cego não sabe desfazer estorno,
 * e um número que só sobe é o tipo de erro que ninguém percebe até alguém
 * conferir à mão. Aqui a conta é refeita das reservas toda vez.
 *
 * O que entra: reserva PAGA, da própria pessoa, confirmada depois do vínculo,
 * e cujo pagamento não foi estornado. `totalAmount` já nasce descontado do
 * cupom aplicado na compra, então cupom não vira progresso para ninguém, e
 * compra inteiramente grátis soma zero sozinha.
 */
async function totalPagoPeloIndicado(
  tx: Prisma.TransactionClient,
  indicadoId: string,
  desde: Date,
): Promise<number> {
  const linhas = await tx.$queryRaw<{ total: string | null }[]>`
    SELECT COALESCE(SUM(r."totalAmount"), 0)::text AS total
      FROM "Reservation" r
      LEFT JOIN "Payment" p ON p."reservationId" = r."id"
     WHERE r."userId" = ${indicadoId}
       AND r."status" = 'PAID'
       AND COALESCE(r."paidAt", r."createdAt") >= ${desde}::timestamptz
       AND (p."id" IS NULL OR p."status" <> 'REFUNDED')
  `;
  return emCentavos(Number(linhas[0]?.total ?? 0));
}

/**
 * Um pagamento confirmado de um indicado: recalcula e, se for a hora, concede.
 *
 * A REGRA, INTEIRA: cada pessoa indicada libera UM cupom quando os pagamentos
 * dela somarem R$ 10, e nunca mais outro. Não é progressivo. R$ 10 e R$ 1.000
 * do mesmo indicado dão o mesmo resultado.
 *
 * Chamada nos MESMOS seis pontos em que o XP é creditado: os quatro webhooks
 * de pagamento, a consulta que confirma um Pix pendente e a aprovação manual
 * pelo painel.
 *
 * A idempotência é por PESSOA, e não por compra: duas compras de R$ 5 do mesmo
 * indicado confirmando ao mesmo tempo somam R$ 10 e liberam UM cupom, não
 * dois. Quem garante é o cadeado por indicado mais a escrita condicional em
 * `qualificadoEm`, com o unique(indicadoId) por baixo.
 */
export async function processarCompraDeIndicado(
  reservationId: string,
): Promise<{ concedeu: boolean; pagoEmCentavos: number } | null> {
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

    const indicadoId = reserva.userId;

    return await prisma.$transaction(async (tx) => {
      // O cadeado é por PESSOA INDICADA, que é a granularidade da regra: duas
      // compras dela confirmando juntas precisam somar, e não competir.
      await travarIndicado(tx, indicadoId);

      const qualificacao = await tx.qualificacaoDeIndicado.upsert({
        where: { indicadoId },
        update: {},
        create: { affiliateId: afiliado.id, indicadoId },
        select: { id: true, criadoEm: true, qualificadoEm: true },
      });

      const pago = await totalPagoPeloIndicado(
        tx,
        indicadoId,
        qualificacao.criadoEm,
      );

      // O movimento da compra entra sempre, para o histórico saber quais
      // pagamentos formaram o total. O unique(reservationId, tipo) faz a
      // reentrega do webhook parar aqui, antes de qualquer concessão.
      const centavosDaCompra = emCentavos(Number(reserva.totalAmount));
      if (centavosDaCompra > 0) {
        await tx.movimentoDeAfiliado.create({
          data: {
            affiliateId: afiliado.id,
            tipo: "COMPRA_DE_INDICADO",
            centavos: centavosDaCompra,
            reservationId: reserva.id,
            indicadoId,
            raffleId: reserva.raffleId,
            descricao: "Compra de indicado",
          },
        });
      }

      const avaliacao = avaliarQualificacao({
        pagoEmCentavos: pago,
        jaQualificou: qualificacao.qualificadoEm != null,
      });

      if (!avaliacao.qualificou) {
        await tx.qualificacaoDeIndicado.update({
          where: { id: qualificacao.id },
          data: { pagoEmCentavos: pago },
        });
        return { concedeu: false, pagoEmCentavos: pago };
      }

      // A CONCESSÃO, UMA VEZ SÓ.
      //
      // A escrita é condicional em `qualificadoEm: null`: se outra transação
      // concedeu enquanto esta esperava o cadeado, esta não acha a linha e
      // sai sem criar cupom nenhum.
      const cupom = await tx.entradaGratis.create({
        data: {
          affiliateId: afiliado.id,
          valorEmCentavos: VALOR_DO_CUPOM_EM_CENTAVOS,
        },
        select: { id: true },
      });
      const marcou = await tx.qualificacaoDeIndicado.updateMany({
        where: { id: qualificacao.id, qualificadoEm: null },
        data: {
          pagoEmCentavos: pago,
          qualificadoEm: new Date(),
          entradaId: cupom.id,
        },
      });
      if (marcou.count === 0) {
        // Perdeu a corrida. O cupom recém-criado não tem dono e some junto
        // com a transação, que é abortada de propósito.
        throw new CupomJaConcedidoError();
      }

      await tx.movimentoDeAfiliado.create({
        data: {
          affiliateId: afiliado.id,
          tipo: "ENTRADA_LIBERADA",
          entradas: 1,
          indicadoId,
          raffleId: reserva.raffleId,
          descricao: "Cupom de Entrada liberado por indicado qualificado",
        },
      });

      console.info(
        `[afiliados] indicado ${indicadoId} qualificou com ${pago} centavos e liberou 1 cupom ao afiliado ${afiliado.id}`,
      );
      return { concedeu: true, pagoEmCentavos: pago };
    });
  } catch (err) {
    if (err instanceof CupomJaConcedidoError) {
      console.info(
        `[afiliados] concessão simultânea na reserva ${reservationId}, ignorada`,
      );
      return null;
    }
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

/** Interna: a corrida foi perdida e a transação precisa voltar atrás. */
class CupomJaConcedidoError extends Error {}

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
 * Um pagamento foi estornado: recalcula o indicado e desfaz o que couber.
 *
 * A ordem do estrago importa. Se o total cair abaixo do limiar:
 *
 *   cupom ainda DISPONIVEL   é recolhido, e a pessoa volta a poder qualificar
 *                            se pagar de novo. Nada se perdeu.
 *   cupom RESERVADO          a compra que o segura ainda não foi paga, então
 *                            ele é solto dali e recolhido igual.
 *   cupom já USADO           fica. A cota existiu, o sorteio já contou com
 *                            ela, e apagar título por causa de contabilidade
 *                            estraga mais do que conserta. A qualificação é
 *                            marcada como revertida: o caso vai para análise e
 *                            aquela pessoa continua sem poder gerar outro.
 */
export async function reverterCompraDeIndicado(
  reservationId: string,
): Promise<{ recolheu: boolean; pagoEmCentavos: number } | null> {
  try {
    const original = await prisma.movimentoDeAfiliado.findFirst({
      where: { reservationId, tipo: "COMPRA_DE_INDICADO" },
      select: { affiliateId: true, centavos: true, indicadoId: true },
    });
    if (!original?.indicadoId) return null;
    const indicadoId = original.indicadoId;

    return await prisma.$transaction(async (tx) => {
      await travarIndicado(tx, indicadoId);

      const qualificacao = await tx.qualificacaoDeIndicado.findUnique({
        where: { indicadoId },
        select: {
          id: true,
          criadoEm: true,
          qualificadoEm: true,
          entradaId: true,
          entrada: { select: { id: true, estado: true } },
        },
      });
      if (!qualificacao) return null;

      const pago = await totalPagoPeloIndicado(
        tx,
        indicadoId,
        qualificacao.criadoEm,
      );

      await tx.movimentoDeAfiliado.create({
        data: {
          affiliateId: original.affiliateId,
          tipo: "ESTORNO_DE_COMPRA",
          centavos: -original.centavos,
          reservationId,
          indicadoId,
          descricao: "Estorno de compra de indicado",
        },
      });

      const aindaQualifica = pago >= LIMIAR_DA_ENTRADA_EM_CENTAVOS;
      if (aindaQualifica || !qualificacao.qualificadoEm) {
        await tx.qualificacaoDeIndicado.update({
          where: { id: qualificacao.id },
          data: { pagoEmCentavos: pago },
        });
        return { recolheu: false, pagoEmCentavos: pago };
      }

      // Caiu abaixo do limiar com cupom concedido.
      const cupom = qualificacao.entrada;
      const podeRecolher =
        cupom != null &&
        (cupom.estado === "DISPONIVEL" || cupom.estado === "RESERVADA");

      if (podeRecolher) {
        await tx.entradaGratis.delete({ where: { id: cupom.id } });
        await tx.qualificacaoDeIndicado.update({
          where: { id: qualificacao.id },
          data: {
            pagoEmCentavos: pago,
            qualificadoEm: null,
            entradaId: null,
          },
        });
        await tx.movimentoDeAfiliado.create({
          data: {
            affiliateId: original.affiliateId,
            tipo: "QUALIFICACAO_REVERTIDA",
            entradas: -1,
            indicadoId,
            descricao:
              "Estorno derrubou o total do indicado: Cupom de Entrada recolhido",
          },
        });
        console.warn(
          `[afiliados] estorno recolheu o cupom do indicado ${indicadoId} (total agora ${pago} centavos)`,
        );
        return { recolheu: true, pagoEmCentavos: pago };
      }

      // Cupom já usado: fica de pé, e o caso vira registro.
      await tx.qualificacaoDeIndicado.update({
        where: { id: qualificacao.id },
        data: { pagoEmCentavos: pago, revertidoEm: new Date() },
      });
      await tx.movimentoDeAfiliado.create({
        data: {
          affiliateId: original.affiliateId,
          tipo: "QUALIFICACAO_REVERTIDA",
          indicadoId,
          descricao:
            "Estorno derrubou o total do indicado, mas o cupom já tinha sido usado: revisar",
        },
      });
      console.warn(
        `[afiliados] estorno do indicado ${indicadoId} com cupom JÁ USADO: revisar manualmente`,
      );
      return { recolheu: false, pagoEmCentavos: pago };
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

export interface SituacaoDaEntrada {
  /** A pessoa é afiliada ativa. Sem isso, o cartão nem aparece. */
  ehAfiliado: boolean;
  /** Quantas entradas prontas para usar. */
  disponiveis: number;
  /** Já gastou (ou reservou) a entrada desta campanha. */
  jaUsouNesteSorteio: boolean;
  /** A cota desta campanha custa mais que o valor de face do cupom. */
  cotaAcimaDoCupom: boolean;
  /** O valor de face do cupom, em centavos. Para a tela explicar o limite. */
  valorDoCupomEmCentavos: number;
  /** Dá para aplicar uma entrada nesta compra agora. */
  podeUsar: boolean;
}

/**
 * O que o checkout precisa saber, resolvido no servidor.
 *
 * A tela recebe isto pronto e não calcula nada: quem decide se a entrada
 * pode ser usada é a mesma função que a consome, e por isso não existe o
 * estado em que o botão aparece e a compra recusa.
 */
export async function situacaoDaEntrada(
  userId: string | null | undefined,
  raffleId: string,
): Promise<SituacaoDaEntrada> {
  const vazio: SituacaoDaEntrada = {
    ehAfiliado: false,
    disponiveis: 0,
    jaUsouNesteSorteio: false,
    cotaAcimaDoCupom: false,
    valorDoCupomEmCentavos: VALOR_DO_CUPOM_EM_CENTAVOS,
    podeUsar: false,
  };
  if (!userId) return vazio;

  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!afiliado || afiliado.status === "INACTIVE") return vazio;

  const [disponiveis, nesteSorteio, campanha] = await Promise.all([
    prisma.entradaGratis.count({
      where: { affiliateId: afiliado.id, estado: "DISPONIVEL" },
    }),
    prisma.entradaGratis.findFirst({
      where: { affiliateId: afiliado.id, raffleId },
      select: { id: true },
    }),
    prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { pricePerNumber: true, isFree: true },
    }),
  ]);

  // O TETO DO CUPOM.
  //
  // Ele vale R$ 10 e cobre UMA cota até esse valor. Numa campanha de cota mais
  // cara ele é recusado inteiro, porque não existe pagar a diferença: metade
  // de uma cota não é uma cota.
  const precoDaCota = campanha?.isFree ? 0 : Number(campanha?.pricePerNumber ?? 0);
  const { aceita } = descontoDoCupom({
    precoDaCotaEmCentavos: emCentavos(precoDaCota),
  });
  const cotaAcimaDoCupom = precoDaCota > 0 && !aceita;

  const jaUsouNesteSorteio = nesteSorteio != null;
  return {
    ehAfiliado: true,
    disponiveis,
    jaUsouNesteSorteio,
    cotaAcimaDoCupom,
    valorDoCupomEmCentavos: VALOR_DO_CUPOM_EM_CENTAVOS,
    podeUsar: disponiveis > 0 && !jaUsouNesteSorteio && !cotaAcimaDoCupom,
  };
}

/**
 * Reivindica uma entrada para uma compra, dentro da transação da compra.
 *
 * O SELECT ... FOR UPDATE SKIP LOCKED é o que resolve as duas abas: a segunda
 * transação pula a linha que a primeira travou, não acha outra disponível, e
 * a compra dela falha com "não está mais disponível" em vez de gastar a mesma
 * entrada duas vezes.
 *
 * O unique(affiliateId, raffleId) é a segunda trava, e pega o outro caso: duas
 * compras no MESMO sorteio, cada uma com a sua entrada. A primeira grava, a
 * segunda esbarra no índice.
 */
export async function reservarEntradaGratis(
  tx: Prisma.TransactionClient,
  affiliateId: string,
  raffleId: string,
  reservationId: string,
  jaPaga: boolean,
): Promise<string> {
  const agora = new Date();
  let linhas: { id: string }[];
  try {
    linhas = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "EntradaGratis"
         SET "estado" = ${jaPaga ? "USADA" : "RESERVADA"}::"EstadoDaEntradaGratis",
             "raffleId" = ${raffleId},
             "reservationId" = ${reservationId},
             "usadaEm" = ${jaPaga ? agora : null}
       WHERE "id" = (
         SELECT "id" FROM "EntradaGratis"
          WHERE "affiliateId" = ${affiliateId}
            AND "estado" = 'DISPONIVEL'
          ORDER BY "ganhaEm" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
      RETURNING "id"
    `;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new EntradaJaUsadaNoSorteioError();
    }
    // Consulta crua não vira P2002: o Prisma devolve "Raw query failed. Code:
    // 23505" com o nome das colunas. 23505 é unique_violation do Postgres, e
    // o único índice único que este UPDATE pode violar é o de uma entrada por
    // sorteio.
    if (err instanceof Error && /23505/.test(err.message)) {
      throw new EntradaJaUsadaNoSorteioError();
    }
    throw err;
  }

  const entrada = linhas[0];
  if (!entrada) throw new EntradaIndisponivelError();

  await tx.movimentoDeAfiliado.create({
    data: {
      affiliateId,
      tipo: "ENTRADA_USADA",
      entradas: -1,
      reservationId,
      raffleId,
      descricao: "Entrada Grátis aplicada na compra",
    },
  });

  return entrada.id;
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
  /** Cupons prontos para usar. */
  disponiveis: number;
  /** Presos a compras com Pix pendente. */
  reservadas: number;
  /** Tudo o que já ganhou, desde sempre. */
  conquistadas: number;
  usadas: number;
  /** Pessoas vinculadas ao código. */
  indicados: number;
  /** Indicados que já liberaram o cupom deles. */
  indicadosQualificados: number;
  /** Indicados que ainda não chegaram no limiar. */
  indicadosEmProgresso: number;
  limiarEmCentavos: number;
  valorDoCupomEmCentavos: number;
}

/** Tudo o que a página "Programa de Afiliados" mostra, num lugar só. */
export async function painelDoAfiliado(
  userId: string,
): Promise<PainelDoAfiliado | null> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, code: true, status: true },
  });
  if (!afiliado) return null;

  const [disponiveis, reservadas, usadas, conquistadas, indicados, qualificados] =
    await Promise.all([
      prisma.entradaGratis.count({
        where: { affiliateId: afiliado.id, estado: "DISPONIVEL" },
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
      prisma.qualificacaoDeIndicado.count({
        where: { affiliateId: afiliado.id, qualificadoEm: { not: null } },
      }),
    ]);

  return {
    codigo: afiliado.code,
    status: afiliado.status,
    disponiveis,
    reservadas,
    usadas,
    conquistadas: Math.max(0, conquistadas._sum.entradas ?? 0),
    indicados,
    indicadosQualificados: qualificados,
    // Em progresso é o resto: quem entrou pelo link e ainda não fechou os
    // R$ 10. Não existe "progresso do afiliado" para somar; cada pessoa tem
    // o seu, e é assim que a regra funciona.
    indicadosEmProgresso: Math.max(0, indicados - qualificados),
    limiarEmCentavos: LIMIAR_DA_ENTRADA_EM_CENTAVOS,
    valorDoCupomEmCentavos: VALOR_DO_CUPOM_EM_CENTAVOS,
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

  const movimentos = await prisma.movimentoDeAfiliado.findMany({
    where: { affiliateId: afiliado.id },
    orderBy: { criadoEm: "desc" },
    take: limite,
    select: {
      id: true,
      tipo: true,
      centavos: true,
      entradas: true,
      descricao: true,
      raffleId: true,
      criadoEm: true,
    },
  });

  // O nome da campanha vem numa consulta só, e não numa por linha.
  const idsDeCampanha = [
    ...new Set(movimentos.map((m) => m.raffleId).filter(Boolean) as string[]),
  ];
  const campanhas = idsDeCampanha.length
    ? await prisma.raffle.findMany({
        where: { id: { in: idsDeCampanha } },
        select: { id: true, title: true },
      })
    : [];
  const titulo = new Map(campanhas.map((c) => [c.id, c.title]));

  return movimentos.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    centavos: m.centavos,
    entradas: m.entradas,
    descricao: m.descricao,
    campanha: m.raffleId ? (titulo.get(m.raffleId) ?? null) : null,
    quando: m.criadoEm,
  }));
}

/**
 * Os indicados, com o progresso de cada um e sem dado pessoal nenhum.
 *
 * O que sai daqui: primeiro nome com a inicial do sobrenome, desde quando, e
 * quanto falta para aquela pessoa liberar o cupom. Telefone, CPF e e-mail não
 * saem: quem indicou não vira dono dos dados de quem foi indicado, e a página
 * do afiliado é o lugar mais fácil de esquecer disso.
 */
export async function indicadosDoAfiliado(
  userId: string,
  limite = 50,
): Promise<
  {
    id: string;
    nome: string;
    desde: Date;
    qualificado: boolean;
    pagoEmCentavos: number;
    limiarEmCentavos: number;
    time: string | null;
  }[]
> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!afiliado) return [];

  const indicados = await prisma.user.findMany({
    where: { referredByAffiliateId: afiliado.id },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      name: true,
      createdAt: true,
      favoriteTeamId: true,
      qualificacao: {
        select: { pagoEmCentavos: true, qualificadoEm: true },
      },
    },
  });

  return indicados.map((i) => ({
    id: i.id,
    nome: nomeMascarado(i.name),
    desde: i.createdAt,
    qualificado: i.qualificacao?.qualificadoEm != null,
    pagoEmCentavos: Math.min(
      LIMIAR_DA_ENTRADA_EM_CENTAVOS,
      i.qualificacao?.pagoEmCentavos ?? 0,
    ),
    limiarEmCentavos: LIMIAR_DA_ENTRADA_EM_CENTAVOS,
    time: i.favoriteTeamId,
  }));
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
      user: { select: { id: true, name: true, phone: true } },
      _count: {
        select: {
          indicados: true,
          entradas: true,
          qualificacoes: { where: { qualificadoEm: { not: null } } },
        },
      },
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
      qualificados: a._count.qualificacoes,
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
/**
 * Serializa quem mexe na qualificação da MESMA pessoa indicada.
 *
 * É esta a granularidade da regra nova: duas compras de R$ 5 do mesmo
 * indicado confirmando no mesmo instante precisam somar R$ 10 e liberar UM
 * cupom. Sem o cadeado, as duas leriam R$ 5 e nenhuma concederia; ou as duas
 * leriam R$ 10 e concederiam duas vezes.
 */
async function travarIndicado(
  tx: Prisma.TransactionClient,
  indicadoId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('afiliado:indicado'), hashtext(${indicadoId}))
  `;
}

async function travarAfiliado(
  tx: Prisma.TransactionClient,
  affiliateId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('afiliado'), hashtext(${affiliateId}))
  `;
}
