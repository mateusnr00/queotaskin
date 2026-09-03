// A Caixa de Boost de XP por Level Up.
//
// O QUE ESTE ARQUIVO NÃO FAZ
//
// Não calcula XP e não decide nível. XP tem um lugar só neste projeto,
// `awardXpForReservation`, e nível é derivado do XP por `levelFromXp`. Aqui
// mora só o que é da caixa: conceder, abrir, sortear e consumir.
//
// A CONCESSÃO É POR DEGRAU
//
// Uma compra que leva do nível 10 ao 13 gera TRÊS caixas, uma por degrau. E a
// trava contra duplicidade é o índice único (usuário, painel, nível), no
// banco: webhook reentregue, retry e duas confirmações simultâneas esbarram
// nele. `createMany` com `skipDuplicates` usa ON CONFLICT DO NOTHING, que não
// derruba a transação, e isso importa porque no Postgres um statement que
// falha aborta tudo o que veio antes.
//
// O CONSUMO É COMPARE-AND-SET
//
// Quem consome roda dentro da transação de XP, que já segura um
// `pg_advisory_xact_lock` por (usuário, painel): duas confirmações do mesmo
// usuário já não correm em paralelo. Mesmo assim o consumo é um update
// condicional que confere a contagem de linhas afetadas, porque garantia de
// dinheiro não se apoia numa camada só. Um boost, uma compra.

import { cache } from "react";
import { randomInt } from "node:crypto";

import type { LevelUpBoxRarity, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { levelFromXp } from "@/lib/rank";
import {
  DROPS_PADRAO,
  MINUTOS_PADRAO,
  niveisConquistados,
  sortearDrop,
  type DropDaCaixa,
} from "@/lib/xp/caixa-de-level-up";

/** A configuração do painel que interessa à caixa. */
interface ConfigDoPainel {
  ligado: boolean;
  ligadoEm: Date | null;
  minutos: number;
}

async function configDoPainel(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<ConfigDoPainel> {
  const t = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: {
      levelUpBoxesEnabled: true,
      levelUpBoxesEnabledAt: true,
      levelUpBoostMinutes: true,
    },
  });
  return {
    ligado: t?.levelUpBoxesEnabled ?? false,
    ligadoEm: t?.levelUpBoxesEnabledAt ?? null,
    minutos: t?.levelUpBoostMinutes ?? MINUTOS_PADRAO,
  };
}

/**
 * Os drops configurados no painel, ou a tabela padrão enquanto ninguém
 * configurou nada.
 *
 * Cair no padrão é melhor que não sortear: um painel que ligou o recurso e
 * não mexeu na tabela precisa funcionar com a economia que veio de fábrica.
 */
export async function dropsDoPainel(
  tenantId: string,
  cliente: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<(DropDaCaixa & { id?: string })[]> {
  const linhas = await cliente.levelUpBoxDrop.findMany({
    where: { tenantId, ativo: true },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      multiplier: true,
      rarity: true,
      probabilityBps: true,
      color: true,
    },
  });
  if (linhas.length === 0) return [...DROPS_PADRAO];
  return linhas.map((l) => ({
    id: l.id,
    multiplier: Number(l.multiplier),
    rarity: l.rarity,
    probabilityBps: l.probabilityBps,
    color: l.color,
  }));
}

/**
 * Concede uma caixa por nível conquistado nesta operação de XP.
 *
 * Roda DENTRO da transação de XP, com o lock já tomado, e depois do total
 * recalculado: é a comparação entre o nível de antes e o de depois que diz o
 * que foi conquistado.
 *
 * NADA RETROATIVO. Só concede quando o recurso está ligado e a subida
 * aconteceu depois da data de ativação. Quem já estava no nível 15 na estreia
 * não ganha quinze caixas, porque não houve quinze subidas: houve uma, a
 * próxima que ele fizer.
 */
export async function concederCaixasPorLevelUp(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    tenantId: string;
    xpAntes: number;
    xpDepois: number;
    quando: Date;
  },
): Promise<number[]> {
  const config = await configDoPainel(tx, params.tenantId);
  if (!config.ligado) return [];
  if (config.ligadoEm && params.quando < config.ligadoEm) return [];

  const niveis = niveisConquistados(
    levelFromXp(params.xpAntes),
    levelFromXp(params.xpDepois),
  );
  if (niveis.length === 0) return [];

  await tx.levelUpBox.createMany({
    data: niveis.map((sourceLevel) => ({
      userId: params.userId,
      tenantId: params.tenantId,
      sourceLevel,
      status: "FECHADA" as const,
      createdAt: params.quando,
    })),
    // A idempotência de verdade: o índice único recusa o repetido e o
    // ON CONFLICT DO NOTHING não derruba a transação.
    skipDuplicates: true,
  });

  return niveis;
}

export interface BoostReservado {
  boxId: string;
  multiplicador: number;
  sourceLevel: number;
}

/**
 * Reserva o boost ativo para ESTA compra, se houver um.
 *
 * Chamada ANTES de calcular o XP, e de propósito: se a reserva falhasse
 * depois do XP já ter sido creditado com o multiplicador, a compra teria
 * ganhado um boost que ninguém pagou. Aqui, ou a linha muda para CONSUMIDA
 * agora, ou não há boost nenhum nesta compra.
 *
 * O update condicional é o que impede duas compras de usarem o mesmo boost:
 * a segunda encontra `status` diferente de ATIVA e afeta zero linhas.
 */
export async function reservarBoostParaCompra(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    tenantId: string;
    reservationId: string;
    quando: Date;
  },
): Promise<BoostReservado | null> {
  const config = await configDoPainel(tx, params.tenantId);
  // Recurso desligado não consome boost antigo: ele fica lá, e volta a valer
  // se alguém religar.
  if (!config.ligado) return null;

  // O prazo é conferido contra o instante da CONFIRMAÇÃO do pagamento, que é
  // este. PIX gerado dentro do prazo e pago depois não pega o boost.
  const candidata = await tx.levelUpBox.findFirst({
    where: {
      userId: params.userId,
      tenantId: params.tenantId,
      status: "ATIVA",
      consumedAt: null,
      expiresAt: { gt: params.quando },
    },
    orderBy: { expiresAt: "asc" },
    select: { id: true, multiplier: true, sourceLevel: true },
  });
  if (!candidata?.multiplier) return null;

  const { count } = await tx.levelUpBox.updateMany({
    where: { id: candidata.id, status: "ATIVA", consumedAt: null },
    data: {
      status: "CONSUMIDA",
      consumedAt: params.quando,
      consumedByReservationId: params.reservationId,
    },
  });
  // Zero linhas quer dizer que outra transação levou este boost primeiro.
  if (count !== 1) return null;

  return {
    boxId: candidata.id,
    multiplicador: Number(candidata.multiplier),
    sourceLevel: candidata.sourceLevel,
  };
}

/**
 * Guarda na caixa o que a compra rendeu.
 *
 * Separado da reserva porque o XP só é conhecido depois do cálculo, e a
 * reserva precisa acontecer antes dele. As duas escritas estão na mesma
 * transação, então ou as duas valem ou nenhuma vale.
 */
export async function registrarRendimentoDoBoost(
  tx: Prisma.TransactionClient,
  params: { boxId: string; baseXp: number; bonusXp: number; finalXp: number },
): Promise<void> {
  await tx.levelUpBox.update({
    where: { id: params.boxId },
    data: {
      baseXp: params.baseXp,
      bonusXp: params.bonusXp,
      finalXp: params.finalXp,
    },
  });
}

export type ResultadoDaAbertura =
  | {
      ok: true;
      boxId: string;
      sourceLevel: number;
      multiplicador: number;
      raridade: LevelUpBoxRarity;
      /** A cor do retrato, para o badge e a revelação. */
      cor: string;
      expiraEm: string;
    }
  | { ok: false; erro: string };

/**
 * Abre uma caixa: sorteia o multiplicador no servidor e começa o relógio.
 *
 * O SORTEIO ACONTECE UMA VEZ SÓ.
 *
 * O resultado é gravado antes de voltar para a tela, e a mudança de status é
 * condicional: recarregar a página, clicar duas vezes ou mandar a mesma
 * requisição de novo encontram a caixa já ATIVA e recebem o mesmo prêmio, não
 * um sorteio novo.
 *
 * O acaso vem de `randomInt` do módulo de criptografia, e não de
 * `Math.random`: é prêmio, e prêmio previsível é prêmio escolhido.
 */
export async function abrirCaixa(params: {
  boxId: string;
  userId: string;
  tenantId: string;
}): Promise<ResultadoDaAbertura> {
  return prisma.$transaction(async (tx) => {
    // O mesmo lock do XP: abrir duas caixas ao mesmo tempo não pode furar a
    // regra de um boost ativo por vez.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${params.userId}), hashtext(${params.tenantId}))
    `;

    const config = await configDoPainel(tx, params.tenantId);

    const caixa = await tx.levelUpBox.findFirst({
      // O dono entra no WHERE: id de caixa alheia simplesmente não encontra.
      where: {
        id: params.boxId,
        userId: params.userId,
        tenantId: params.tenantId,
      },
      select: {
        id: true,
        status: true,
        sourceLevel: true,
        multiplier: true,
        rarity: true,
        color: true,
        expiresAt: true,
      },
    });
    if (!caixa) return { ok: false as const, erro: "Caixa não encontrada." };

    if (caixa.status === "ATIVA" && caixa.multiplier && caixa.rarity) {
      // Já aberta. Devolve o MESMO resultado, sem sortear de novo. É o que
      // faz recarregar a página mostrar o mesmo prêmio.
      return {
        ok: true as const,
        boxId: caixa.id,
        sourceLevel: caixa.sourceLevel,
        multiplicador: Number(caixa.multiplier),
        raridade: caixa.rarity,
        cor: caixa.color ?? "#A1A1AA",
        expiraEm: (caixa.expiresAt ?? new Date()).toISOString(),
      };
    }
    if (caixa.status === "CONSUMIDA") {
      return { ok: false as const, erro: "Esta caixa já foi usada." };
    }
    if (caixa.status === "EXPIRADA") {
      return { ok: false as const, erro: "Esta caixa já foi aberta e o prazo dela terminou." };
    }

    // Um boost ativo por vez. Abrir outra empilharia prazos e criaria dúvida
    // sobre qual vale na próxima compra.
    const jaAtiva = await tx.levelUpBox.findFirst({
      where: {
        userId: params.userId,
        tenantId: params.tenantId,
        status: "ATIVA",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (jaAtiva) {
      return {
        ok: false as const,
        erro: "Você já possui um Boost de XP ativo. Use-o na próxima compra ou aguarde ele expirar para abrir outra caixa.",
      };
    }

    const drops = await dropsDoPainel(params.tenantId, tx);
    // randomInt é do módulo de criptografia: prêmio previsível é prêmio
    // escolhido. A divisão devolve um número em [0, 1).
    const sorteio = randomInt(0, 1_000_000) / 1_000_000;
    const drop = sortearDrop(drops, sorteio);
    if (!drop) {
      return {
        ok: false as const,
        erro: "As recompensas não estão configuradas neste momento. Tente de novo mais tarde.",
      };
    }

    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + config.minutos * 60_000);

    // Condicional: só sai de FECHADA. Dois cliques ao mesmo tempo, e o
    // segundo afeta zero linhas em vez de sortear outra vez.
    const { count } = await tx.levelUpBox.updateMany({
      where: { id: caixa.id, status: "FECHADA" },
      data: {
        status: "ATIVA",
        multiplier: drop.multiplier,
        rarity: drop.rarity,
        // O RETRATO. Copiado, não referenciado: repintar o drop amanhã não
        // pode mudar o prêmio ganho hoje.
        color: drop.color,
        dropId: (drop as { id?: string }).id ?? null,
        probabilityBps: drop.probabilityBps,
        openedAt: agora,
        expiresAt: expiraEm,
      },
    });
    if (count !== 1) {
      return { ok: false as const, erro: "Esta caixa já foi aberta." };
    }

    return {
      ok: true as const,
      boxId: caixa.id,
      sourceLevel: caixa.sourceLevel,
      multiplicador: drop.multiplier,
      raridade: drop.rarity,
      cor: drop.color,
      expiraEm: expiraEm.toISOString(),
    };
  });
}

export interface BoostAtivo {
  boxId: string;
  multiplicador: number;
  raridade: LevelUpBoxRarity;
  cor: string;
  sourceLevel: number;
  expiraEm: string;
}

export interface CaixaFechada {
  id: string;
  sourceLevel: number;
  createdAt: string;
}

/**
 * O que o usuário tem agora: o boost ativo e as caixas fechadas.
 *
 * Marca como EXPIRADA, de passagem, o que passou do prazo. É varredura
 * preguiçosa em vez de tarefa agendada: o estado só importa quando alguém
 * olha, e uma linha vencida no banco não faz mal a ninguém até ser lida.
 */
export async function recompensasDoUsuario(params: {
  userId: string;
  tenantId: string;
}): Promise<{ ativo: BoostAtivo | null; fechadas: CaixaFechada[] }> {
  const agora = new Date();

  await prisma.levelUpBox.updateMany({
    where: {
      userId: params.userId,
      tenantId: params.tenantId,
      status: "ATIVA",
      expiresAt: { lte: agora },
    },
    data: { status: "EXPIRADA", expiredAt: agora },
  });

  const [ativa, fechadas] = await Promise.all([
    prisma.levelUpBox.findFirst({
      where: {
        userId: params.userId,
        tenantId: params.tenantId,
        status: "ATIVA",
        expiresAt: { gt: agora },
      },
      orderBy: { expiresAt: "asc" },
      select: {
        id: true,
        multiplier: true,
        rarity: true,
        color: true,
        sourceLevel: true,
        expiresAt: true,
      },
    }),
    prisma.levelUpBox.findMany({
      where: {
        userId: params.userId,
        tenantId: params.tenantId,
        status: "FECHADA",
      },
      orderBy: { sourceLevel: "asc" },
      select: { id: true, sourceLevel: true, createdAt: true },
    }),
  ]);

  return {
    ativo:
      ativa?.multiplier && ativa.rarity && ativa.expiresAt
        ? {
            boxId: ativa.id,
            multiplicador: Number(ativa.multiplier),
            raridade: ativa.rarity,
            cor: ativa.color ?? "#A1A1AA",
            sourceLevel: ativa.sourceLevel,
            expiraEm: ativa.expiresAt.toISOString(),
          }
        : null,
    fechadas: fechadas.map((c) => ({
      id: c.id,
      sourceLevel: c.sourceLevel,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

/**
 * Só o boost ativo, memorizado por requisição.
 *
 * O cabeçalho e a home mostram o mesmo selo na mesma renderização, e sem isto
 * seriam duas idas ao banco para responder a mesma pergunta. Os argumentos são
 * primitivos de propósito: `cache` do React compara por identidade, e um
 * objeto novo a cada chamada não bateria com o anterior.
 *
 * Compartilha a varredura preguiçosa de `recompensasDoUsuario`: o que passou do
 * prazo é marcado como expirado de passagem.
 */
export const boostAtivoAgora = cache(
  async (userId: string, tenantId: string): Promise<BoostAtivo | null> => {
    const r = await recompensasDoUsuario({ userId, tenantId });
    return r.ativo;
  },
);
