// O motor de alocação de prêmios, um só para caixa surpresa e raspadinha.
//
// O PRINCÍPIO
//
//   pagamento confirmado
//     → combos dizem QUANTAS unidades
//     → unidades criadas
//     → saída diz QUAIS prêmios a compra desbloqueou
//     → distribuição diz EM QUAIS unidades eles caem
//     → gravado, e imutável a partir daí
//     → abrir ou raspar apenas revela
//
// Abrir não sorteia nada. O destino de cada unidade já está no banco quando a
// pessoa vê a tela pela primeira vez, então não depende da ordem de abertura,
// do aparelho, de recarregar a página, nem de duas abas ao mesmo tempo.
//
// POR QUE O LOCK COBRE TUDO
//
// Antes o cadeado por reserva cobria só a criação das unidades, e o sorteio
// acontecia depois, fora dele. Duas confirmações do mesmo pagamento (o webhook
// e a reconsulta de status, que acontecem juntas o tempo todo) podiam criar as
// unidades uma vez e entrar duas vezes no sorteio. Agora criar e alocar são a
// mesma região crítica: quem chega depois espera, encontra tudo ALOCADA e sai
// sem fazer nada.
//
// POR QUE `FOR UPDATE SKIP LOCKED` NO BOLO
//
// Duas compras confirmando no mesmo instante disputam os mesmos prêmios. Com
// `UPDATE ... WHERE claimedAt IS NULL` cada uma esperaria a outra soltar a
// linha, e duas compras grandes pegando prêmios em ordens diferentes podiam
// travar uma na outra. Com SKIP LOCKED cada transação enxerga só o que ninguém
// está segurando: sem espera, sem impasse, e a ordem de quem leva o quê é a
// ordem real em que os pagamentos foram confirmados.

import type { Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";

import { prisma } from "@/lib/db";
import { dddDoTelefone } from "@/lib/cpf";
import {
  distribuirPremios,
  sortearPorChance,
  type PremioComChance,
} from "@/lib/distribuicao";
import { podeSairAgora, type CompraQueAbre, type Saida } from "@/lib/saida";

export type TipoDeUnidade = "CAIXA" | "RASPADINHA";

export interface ResultadoDaAlocacao {
  /** Unidades que estavam esperando e foram resolvidas nesta passada. */
  unidades: number;
  /** Quantas delas saíram com prêmio. */
  premiadas: number;
}

const NADA: ResultadoDaAlocacao = { unidades: 0, premiadas: 0 };

/** Um prêmio do bolo, com as duas tabelas faladas na mesma língua. */
interface PremioParaAlocar {
  id: string;
  /** Porcentagem, quando o prêmio é de chance. Nulo entra na garantida. */
  chance: number | null;
  saida: Saida;
}

/** Uma linha crua do bolo, como as duas tabelas devolvem. */
interface LinhaDePremio {
  id: string;
  chance: number | string | null;
  tipoDeSaida: "PROGRESSO" | "PERSONALIZADO";
  saidaEmTitulos: number | null;
  saidaTitulosDe: number | null;
  saidaTitulosAte: number | null;
  saidaDataDe: Date | null;
  saidaDataAte: Date | null;
  saidaDdds: string[];
}

/**
 * O que muda entre caixa e raspadinha: os nomes das tabelas e das colunas.
 *
 * A regra é a mesma para as duas, e é por isso que ela mora num lugar só. O
 * que difere é vocabulário do banco, e cabe aqui.
 */
interface Fonte {
  /** As unidades desta reserva que ainda esperam decisão, em ordem estável. */
  pendentes(
    tx: Prisma.TransactionClient,
    reservationId: string,
  ): Promise<{ id: string }[]>;
  /** O bolo do sorteio, já travado para esta transação. */
  bolo(
    tx: Prisma.TransactionClient,
    raffleId: string,
  ): Promise<LinhaDePremio[]>;
  /** Marca um prêmio como levado. Falso quando outro chegou antes. */
  reservar(tx: Prisma.TransactionClient, premioId: string): Promise<boolean>;
  /** Grava o destino de uma unidade. */
  gravar(
    tx: Prisma.TransactionClient,
    unidadeId: string,
    premioId: string | null,
    venda: { antes: number; depois: number },
  ): Promise<void>;
}

const DA_CAIXA: Fonte = {
  pendentes: (tx, reservationId) =>
    tx.surpriseBox.findMany({
      where: { reservationId, alocacao: "PENDENTE" },
      select: { id: true },
      // As unidades de uma compra nascem no MESMO instante, num createMany só:
      // sem o id desempatando, a ordem fica por conta do banco e o sorteio
      // percorreria uma ordem enquanto a tela mostra outra.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  bolo: async (tx, raffleId) =>
    tx.$queryRaw<LinhaDePremio[]>`
      SELECT id,
             CASE WHEN mode = 'PERCENT' THEN odds ELSE NULL END AS chance,
             "tipoDeSaida", "saidaEmTitulos", "saidaTitulosDe",
             "saidaTitulosAte", "saidaDataDe", "saidaDataAte", "saidaDdds"
        FROM "SurpriseBoxPrize"
       WHERE "raffleId" = ${raffleId}
         AND locked = false
         AND "claimedAt" IS NULL
       ORDER BY "saidaEmTitulos" ASC NULLS LAST, id ASC
         FOR UPDATE SKIP LOCKED
    `,
  reservar: async (tx, premioId) => {
    const r = await tx.surpriseBoxPrize.updateMany({
      where: { id: premioId, claimedAt: null, locked: false },
      data: { claimedAt: new Date() },
    });
    return r.count === 1;
  },
  gravar: async (tx, unidadeId, premioId, venda) => {
    await tx.surpriseBox.updateMany({
      where: { id: unidadeId, alocacao: "PENDENTE" },
      data: {
        prizeId: premioId,
        alocacao: "ALOCADA",
        premioSorteadoEm: new Date(),
        vendidosAntes: venda.antes,
        vendidosNaSaida: venda.depois,
      },
    });
  },
};

const DA_RASPADINHA: Fonte = {
  pendentes: (tx, reservationId) =>
    tx.raspadinha.findMany({
      where: { reservationId, alocacao: "PENDENTE" },
      select: { id: true },
      orderBy: [{ numero: "asc" }],
    }),
  bolo: async (tx, raffleId) =>
    tx.$queryRaw<LinhaDePremio[]>`
      SELECT id, chance, "tipoDeSaida", "saidaEmTitulos", "saidaTitulosDe",
             "saidaTitulosAte", "saidaDataDe", "saidaDataAte", "saidaDdds"
        FROM "RaspadinhaPremio"
       WHERE "raffleId" = ${raffleId}
         AND travado = false
         AND "claimedAt" IS NULL
       ORDER BY "saidaEmTitulos" ASC NULLS LAST, id ASC
         FOR UPDATE SKIP LOCKED
    `,
  reservar: async (tx, premioId) => {
    const r = await tx.raspadinhaPremio.updateMany({
      where: { id: premioId, claimedAt: null, travado: false },
      data: { claimedAt: new Date() },
    });
    return r.count === 1;
  },
  gravar: async (tx, unidadeId, premioId, venda) => {
    await tx.raspadinha.updateMany({
      where: { id: unidadeId, alocacao: "PENDENTE" },
      data: {
        premioId,
        alocacao: "ALOCADA",
        alocadoEm: new Date(),
        vendidosAntes: venda.antes,
        vendidosNaSaida: venda.depois,
      },
    });
  },
};

function fonteDe(tipo: TipoDeUnidade): Fonte {
  return tipo === "CAIXA" ? DA_CAIXA : DA_RASPADINHA;
}

/**
 * Decide o destino das unidades desta reserva que ainda esperam.
 *
 * Já dentro da transação e do cadeado de quem chamou. Use quando a geração das
 * unidades e a alocação precisam ser a mesma operação, que é o caso normal.
 *
 * Idempotente: só toca em quem está PENDENTE. Chamada de novo depois de pronto,
 * não encontra nada e devolve zero. Nunca reembaralha, nunca troca prêmio de
 * lugar, nunca substitui o que já foi decidido.
 */
export async function alocarNaTransacao(
  tx: Prisma.TransactionClient,
  reservationId: string,
  tipo: TipoDeUnidade,
): Promise<ResultadoDaAlocacao> {
  const fonte = fonteDe(tipo);

  const unidades = await fonte.pendentes(tx, reservationId);
  if (unidades.length === 0) return NADA;

  const reserva = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      paidAt: true,
      createdAt: true,
      participantPhone: true,
      _count: {
        select: { tickets: { where: { status: { in: ["PAID", "AWARDED"] } } } },
      },
    },
  });
  if (!reserva) return NADA;

  // O INTERVALO QUE ESTA COMPRA ATRAVESSOU.
  //
  // `depois` é a venda com esta compra já dentro, e `antes` é ela menos os
  // títulos da própria reserva. Os dois juntos dizem de onde até onde a venda
  // andou por causa desta compra, e é assim que um prêmio marcado para o
  // título 14 é capturado por quem comprou do 13 ao 37.
  //
  // A elegibilidade olha `depois`, e não o intervalo fechado, de propósito:
  // prêmio de ponto já ultrapassado que ninguém levou (porque a compra que
  // atravessou aquele ponto foi cancelada, por exemplo) continua devendo sair,
  // e some do bolo na primeira compra seguinte em vez de ficar preso para
  // sempre num intervalo que já passou.
  const depois = await tx.ticket.count({
    where: { raffleId: reserva.raffleId, status: "PAID" },
  });
  const antes = Math.max(0, depois - reserva._count.tickets);

  const compra: CompraQueAbre = {
    titulos: reserva._count.tickets,
    quando: reserva.paidAt ?? reserva.createdAt,
    ddd: dddDoTelefone(reserva.participantPhone),
  };

  const bolo = (await fonte.bolo(tx, reserva.raffleId)).map(paraPremio);
  const liberados = bolo.filter((p) =>
    podeSairAgora(p.saida, { vendidos: depois, compra }),
  );

  // Prêmio sem chance cadastrada é distribuição garantida: os elegíveis saem,
  // espalhados. Prêmio com chance é raridade, e continua rolando por unidade,
  // senão um prêmio de 1% viraria prêmio certo no fim de toda compra grande.
  const garantidos = liberados.filter((p) => p.chance == null).map((p) => p.id);
  const comChance: PremioComChance[] = liberados
    .filter((p) => p.chance != null)
    .map((p) => ({ id: p.id, chance: p.chance! }));

  const destino = sortearPorChance(
    distribuirPremios(unidades.length, garantidos, (teto) =>
      teto <= 1 ? 0 : randomInt(teto),
    ),
    comChance,
    () => randomInt(0, 10_000) / 100,
    embaralhar,
  );

  // A reserva do prêmio vem ANTES da gravação da unidade: se por qualquer
  // motivo ela falhar, a unidade fica sem prêmio em vez de dois donos para o
  // mesmo item. As linhas já estão travadas por esta transação, então aqui a
  // falha é teórica, e o código não depende disso ser verdade.
  let premiadas = 0;
  for (let i = 0; i < unidades.length; i++) {
    const premioId = destino[i] ?? null;
    let levou: string | null = null;
    if (premioId) {
      levou = (await fonte.reservar(tx, premioId)) ? premioId : null;
    }
    await fonte.gravar(tx, unidades[i]!.id, levou, { antes, depois });
    if (levou) premiadas++;
  }

  return { unidades: unidades.length, premiadas };
}

/**
 * O mesmo, abrindo a própria transação e o próprio cadeado.
 *
 * Para quem chama de fora de uma transação: a retomada do que ficou PENDENTE
 * por falha, e a conferência do painel. Pode ser chamada quantas vezes quiser.
 */
export async function alocarPremiosDaReserva(
  reservationId: string,
  tipo: TipoDeUnidade,
): Promise<ResultadoDaAlocacao> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('alocacao'), hashtext(${reservationId}))
      `;
      return alocarNaTransacao(tx, reservationId, tipo);
    },
    // Folga para uma compra grande: são poucas consultas por unidade, mas o
    // padrão de cinco segundos é apertado para um lote de cinquenta caixas num
    // banco distante.
    { timeout: 30_000, maxWait: 15_000 },
  );
}

function paraPremio(linha: LinhaDePremio): PremioParaAlocar {
  return {
    id: linha.id,
    chance: linha.chance == null ? null : Number(linha.chance),
    saida: {
      tipo: linha.tipoDeSaida,
      emTitulos: linha.saidaEmTitulos,
      titulosDe: linha.saidaTitulosDe,
      titulosAte: linha.saidaTitulosAte,
      dataDe: linha.saidaDataDe,
      dataAte: linha.saidaDataAte,
      ddds: linha.saidaDdds ?? [],
    },
  };
}

/** Sem viés de ordem de cadastro entre prêmios de mesma chance. */
function embaralhar<T>(lista: readonly T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
