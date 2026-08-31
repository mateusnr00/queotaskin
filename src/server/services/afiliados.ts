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
  LIMIAR_DA_ENTRADA_EM_CENTAVOS,
  calcularRecompensa,
  codigoSugerido,
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
    return vinculou.count > 0 ? afiliado.code : null;
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
 * Transforma uma compra paga em progresso e, quando fecha R$ 10, em entradas.
 *
 * Chamada nos MESMOS seis pontos em que o XP é creditado: os quatro webhooks
 * de pagamento, a consulta que confirma um Pix pendente e a aprovação manual
 * pelo painel. É lá que o sistema considera o dinheiro entrado, e ter dois
 * conceitos diferentes de "pago" seria a origem óbvia da próxima divergência.
 *
 * Idempotente por índice, não por leitura: a segunda entrega do webhook tenta
 * gravar o mesmo (reservationId, COMPRA_DE_INDICADO) e o banco recusa.
 */
export async function processarCompraDeIndicado(
  reservationId: string,
): Promise<{ entradas: number; centavos: number } | null> {
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
            referredByAffiliateId: true,
            referredByAffiliate: { select: { id: true, status: true } },
          },
        },
      },
    });

    // Compra de convidado não tem quem indicou.
    if (!reserva?.user?.referredByAffiliate) return null;
    if (reserva.status !== "PAID") return null;

    const afiliado = reserva.user.referredByAffiliate;
    // Suspenso não acumula. As entradas que já ganhou continuam valendo:
    // punir o passado é decisão do admin, com ajuste manual e motivo.
    if (afiliado.status !== "ACTIVE") return null;

    // O QUE FOI EFETIVAMENTE PAGO.
    //
    // totalAmount já nasce descontado da Entrada Grátis aplicada na compra
    // (createReservation subtrai uma cota do total). Então usar este campo é
    // exatamente "só dinheiro que entrou": compra de R$ 20 com R$ 10 cobertos
    // por entrada acumula R$ 10, e nunca R$ 20.
    const centavos = emCentavos(Number(reserva.totalAmount));
    if (centavos <= 0) return null;

    return await prisma.$transaction(async (tx) => {
      await travarAfiliado(tx, afiliado.id);

      const estado = await tx.affiliate.findUnique({
        where: { id: afiliado.id },
        select: { progressoEmCentavos: true },
      });
      if (!estado) return null;

      const recompensa = calcularRecompensa({
        progressoAnterior: estado.progressoEmCentavos,
        valorEmCentavos: centavos,
      });

      // Esta linha é a trava. Se a compra já foi processada, o unique
      // (reservationId, tipo) derruba a transação inteira, e nada do que vem
      // abaixo acontece.
      await tx.movimentoDeAfiliado.create({
        data: {
          affiliateId: afiliado.id,
          tipo: "COMPRA_DE_INDICADO",
          centavos,
          reservationId: reserva.id,
          indicadoId: reserva.userId,
          raffleId: reserva.raffleId,
          descricao: "Compra de indicado",
        },
      });

      if (recompensa.entradas > 0) {
        await tx.entradaGratis.createMany({
          data: Array.from({ length: recompensa.entradas }, () => ({
            affiliateId: afiliado.id,
          })),
        });
        await tx.movimentoDeAfiliado.create({
          data: {
            affiliateId: afiliado.id,
            tipo: "ENTRADA_LIBERADA",
            entradas: recompensa.entradas,
            indicadoId: reserva.userId,
            raffleId: reserva.raffleId,
            descricao:
              recompensa.entradas === 1
                ? "Entrada Grátis desbloqueada"
                : `${recompensa.entradas} Entradas Grátis desbloqueadas`,
          },
        });
      }

      await tx.affiliate.update({
        where: { id: afiliado.id },
        data: { progressoEmCentavos: recompensa.progressoRestante },
      });

      console.info(
        `[afiliados] compra ${reserva.id} creditou ${centavos} centavos e ${recompensa.entradas} entrada(s) ao afiliado ${afiliado.id}`,
      );
      return { entradas: recompensa.entradas, centavos };
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
 * Desfaz o progresso de uma compra estornada.
 *
 * O que volta é o progresso, nunca uma entrada já gasta: retirar da pessoa
 * uma cota que já está valendo num sorteio em andamento estragaria o sorteio
 * para consertar a contabilidade. Entrada ainda disponível é recolhida;
 * entrada já reservada ou usada fica, e o movimento registra a diferença
 * para o admin decidir.
 */
export async function reverterCompraDeIndicado(
  reservationId: string,
): Promise<{ centavos: number; entradasRecolhidas: number } | null> {
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
        select: { progressoEmCentavos: true },
      });
      if (!estado) return null;

      const depois = calcularRecompensa({
        progressoAnterior: estado.progressoEmCentavos,
        valorEmCentavos: -original.centavos,
      });

      // Quanto do estorno não coube no progresso vira entrada a recolher.
      const faltando =
        original.centavos - (estado.progressoEmCentavos - depois.progressoRestante);
      const entradasParaRecolher = Math.max(
        0,
        Math.floor(faltando / LIMIAR_DA_ENTRADA_EM_CENTAVOS),
      );

      let recolhidas = 0;
      if (entradasParaRecolher > 0) {
        const disponiveis = await tx.entradaGratis.findMany({
          where: { affiliateId: original.affiliateId, estado: "DISPONIVEL" },
          select: { id: true },
          orderBy: { ganhaEm: "desc" },
          take: entradasParaRecolher,
        });
        if (disponiveis.length > 0) {
          const apagadas = await tx.entradaGratis.deleteMany({
            where: {
              id: { in: disponiveis.map((e) => e.id) },
              estado: "DISPONIVEL",
            },
          });
          recolhidas = apagadas.count;
        }
      }

      await tx.movimentoDeAfiliado.create({
        data: {
          affiliateId: original.affiliateId,
          tipo: "ESTORNO_DE_COMPRA",
          centavos: -original.centavos,
          entradas: -recolhidas,
          reservationId,
          indicadoId: original.indicadoId,
          descricao:
            entradasParaRecolher > recolhidas
              ? "Estorno de compra de indicado (entradas já gastas não foram recolhidas)"
              : "Estorno de compra de indicado",
        },
      });

      await tx.affiliate.update({
        where: { id: original.affiliateId },
        data: { progressoEmCentavos: depois.progressoRestante },
      });

      console.warn(
        `[afiliados] estorno da compra ${reservationId}: -${original.centavos} centavos, ${recolhidas} entrada(s) recolhida(s)`,
      );
      return { centavos: original.centavos, entradasRecolhidas: recolhidas };
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
    podeUsar: false,
  };
  if (!userId) return vazio;

  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!afiliado || afiliado.status === "INACTIVE") return vazio;

  const [disponiveis, nesteSorteio] = await Promise.all([
    prisma.entradaGratis.count({
      where: { affiliateId: afiliado.id, estado: "DISPONIVEL" },
    }),
    prisma.entradaGratis.findFirst({
      where: { affiliateId: afiliado.id, raffleId },
      select: { id: true },
    }),
  ]);

  const jaUsouNesteSorteio = nesteSorteio != null;
  return {
    ehAfiliado: true,
    disponiveis,
    jaUsouNesteSorteio,
    podeUsar: disponiveis > 0 && !jaUsouNesteSorteio,
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
  /** Entradas prontas para usar. */
  disponiveis: number;
  /** Presas a compras com Pix pendente. */
  reservadas: number;
  /** Tudo o que já ganhou, desde sempre. */
  conquistadas: number;
  usadas: number;
  progressoEmCentavos: number;
  limiarEmCentavos: number;
  indicados: number;
  /** Indicados que já pagaram pelo menos uma compra. */
  indicadosAtivos: number;
}

/** Tudo o que a página "Programa de Afiliados" mostra, num lugar só. */
export async function painelDoAfiliado(
  userId: string,
): Promise<PainelDoAfiliado | null> {
  const afiliado = await prisma.affiliate.findUnique({
    where: { userId },
    select: { id: true, code: true, status: true, progressoEmCentavos: true },
  });
  if (!afiliado) return null;

  const [disponiveis, reservadas, usadas, conquistadas, indicados, ativos] =
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
      prisma.movimentoDeAfiliado
        .findMany({
          where: { affiliateId: afiliado.id, tipo: "COMPRA_DE_INDICADO" },
          select: { indicadoId: true },
          distinct: ["indicadoId"],
        })
        .then((linhas) => linhas.filter((l) => l.indicadoId).length),
    ]);

  return {
    codigo: afiliado.code,
    status: afiliado.status,
    disponiveis,
    reservadas,
    usadas,
    conquistadas: Math.max(0, conquistadas._sum.entradas ?? 0),
    progressoEmCentavos: afiliado.progressoEmCentavos,
    limiarEmCentavos: LIMIAR_DA_ENTRADA_EM_CENTAVOS,
    indicados,
    indicadosAtivos: ativos,
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
 * Os indicados, sem dado pessoal.
 *
 * Nome curto e data de entrada bastam para o afiliado reconhecer quem trouxe.
 * Telefone, CPF e e-mail não saem daqui: quem indicou não vira dono dos dados
 * de quem foi indicado.
 */
export async function indicadosDoAfiliado(
  userId: string,
  limite = 50,
): Promise<
  { id: string; nome: string; desde: Date; comprou: boolean; time: string | null }[]
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
    select: { id: true, name: true, createdAt: true, favoriteTeamId: true },
  });
  if (indicados.length === 0) return [];

  const compradores = await prisma.movimentoDeAfiliado.findMany({
    where: {
      affiliateId: afiliado.id,
      tipo: "COMPRA_DE_INDICADO",
      indicadoId: { in: indicados.map((i) => i.id) },
    },
    select: { indicadoId: true },
    distinct: ["indicadoId"],
  });
  const jaComprou = new Set(compradores.map((c) => c.indicadoId));

  return indicados.map((i) => ({
    id: i.id,
    nome: i.name,
    desde: i.createdAt,
    comprou: jaComprou.has(i.id),
    time: i.favoriteTeamId,
  }));
}

// ----------------------------------------------------------------- painel admin

/** Vira afiliado, ou reativa quem já foi. Devolve o código. */
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
      progressoEmCentavos: true,
      createdAt: true,
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
      progressoEmCentavos: a.progressoEmCentavos,
      indicados: a._count.indicados,
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
