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
// POR QUE O BOLO É LIDO COM `FOR UPDATE` E NÃO COM `SKIP LOCKED`
//
// Era SKIP LOCKED, para duas compras grandes não travarem uma na outra pegando
// prêmios em ordens diferentes. O preço era alto e silencioso: prêmio travado
// por qualquer outra transação some da consulta, a compra é gravada sem ele, e
// como a unidade deixa de estar PENDENTE ninguém volta lá. Um bolo
// momentaneamente invisível virava compra sem prêmio, para sempre.
//
// Com o cadeado por campanha (abaixo), duas alocações da mesma campanha não
// se sobrepõem, e alocações de campanhas diferentes tocam linhas diferentes.
// Sem sobreposição não há impasse a evitar, e esperar é melhor que enxergar um
// bolo vazio. `claimedAt` continua sendo a segunda tranca.

import { Prisma } from "@prisma/client";
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

/**
 * Por quanto tempo uma compra paga segura o ponto dela contra a varredura.
 *
 * Dez minutos é folga enorme para o que a janela protege (o intervalo entre
 * confirmar o pagamento e alocar, que é de milissegundos) e curto o bastante
 * para não prender um prêmio órfão de verdade.
 */
const JANELA_DE_ORDEM_MS = 10 * 60 * 1000;

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
  /** A tabela das unidades. Só para a consulta crua de ordem de confirmação. */
  tabela: string;
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
  tabela: "SurpriseBox",
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
         FOR UPDATE
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
  tabela: "Raspadinha",
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
         FOR UPDATE
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

  // O SEGUNDO CADEADO, POR CAMPANHA.
  //
  // O de reserva impede a mesma compra de ser alocada duas vezes; ele não
  // encosta em duas compras DIFERENTES da mesma campanha, que é justamente
  // quem disputa os mesmos pontos de saída. Este serializa a definição do
  // intervalo e a tomada do bolo dentro de uma campanha: é curto (algumas
  // consultas), não é global, e campanhas diferentes seguem em paralelo.
  //
  // A ORDEM DE AQUISIÇÃO É SEMPRE reserva → campanha. Quem chama já segurou o
  // cadeado da reserva antes de entrar aqui, e inverter a ordem em um só lugar
  // seria o suficiente para dois processos travarem um no outro.
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('alocacao:campanha'), hashtext(${reserva.raffleId}))
  `;

  const carimbo = reserva.paidAt ?? reserva.createdAt;

  // O INTERVALO QUE ESTA COMPRA ATRAVESSOU.
  //
  // Sai da ORDEM DE CONFIRMAÇÃO, e não da venda no instante em que a alocação
  // roda. A diferença decide a divisão comercial:
  //
  //   40 vendidos, A compra 15, B compra 15, prêmios em 45, 52, 58 e 67.
  //   A confirma primeiro, então A atravessou 40 → 55 e leva 45 e 52;
  //   B atravessou 55 → 70 e leva 58 e 67.
  //
  // Com a conta antiga (venda atual menos os meus títulos), bastava os dois
  // pagamentos entrarem antes de qualquer alocação para as duas compras
  // calcularem o MESMO intervalo (55 → 70) e a primeira a rodar levar tudo. A
  // outra ficava sem nada, e o "saiu em X%" do painel mostrava o intervalo
  // errado. Medido: acontecia em todo webhook simultâneo.
  //
  // `antes` passa a ser quantos títulos já estavam pagos nas compras
  // confirmadas ANTES desta, pelo carimbo de pagamento com o id desempatando.
  // Dois pagamentos no mesmo milissegundo continuam tendo uma ordem objetiva,
  // e ela é a mesma toda vez que a conta for refeita.
  const anteriores = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n
      FROM "Ticket" t
      JOIN "Reservation" r ON r."id" = t."reservationId"
     WHERE t."raffleId" = ${reserva.raffleId}
       AND t."status" IN ('PAID', 'AWARDED')
       AND (COALESCE(r."paidAt", r."createdAt"), r."id")
           < (${carimbo}::timestamptz, ${reservationId})
  `;
  const antes = Number(anteriores[0]?.n ?? 0);
  const depois = antes + reserva._count.tickets;

  // ALGUÉM NA FRENTE AINDA NÃO ALOCOU?
  //
  // A varredura de órfão existe para o prêmio cujo ponto já passou e ninguém
  // levou (a compra que atravessou aquele ponto foi cancelada, por exemplo):
  // ele volta ao bolo e sai na próxima compra, em vez de ficar preso para
  // sempre. Só que ela também é a porta pela qual uma compra posterior levava
  // o ponto de uma anterior que ainda estava em processamento.
  //
  // Então a varredura fica suspensa enquanto existir, logo à frente na fila,
  // uma compra paga há pouco que ainda não alocou. Passada a janela, o ponto é
  // órfão de verdade e volta a ser varrido: um pagamento confirmado há dez
  // minutos e sem unidade alocada não vai mais alocar sozinho.
  const anteriorPendente = await tx.$queryRaw<{ existe: number }[]>`
    SELECT 1 AS existe
      FROM "Reservation" r
     WHERE r."raffleId" = ${reserva.raffleId}
       AND r."status" = 'PAID'
       AND (COALESCE(r."paidAt", r."createdAt"), r."id")
           < (${carimbo}::timestamptz, ${reservationId})
       AND COALESCE(r."paidAt", r."createdAt")
           > ${new Date(carimbo.getTime() - JANELA_DE_ORDEM_MS)}::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM "${Prisma.raw(fonte.tabela)}" u
          WHERE u."reservationId" = r."id" AND u."alocacao" = 'ALOCADA'
       )
     LIMIT 1
  `;
  const varreOrfaos = anteriorPendente.length === 0;

  const compra: CompraQueAbre = {
    titulos: reserva._count.tickets,
    quando: carimbo,
    ddd: dddDoTelefone(reserva.participantPhone),
  };

  const bolo = (await fonte.bolo(tx, reserva.raffleId)).map(paraPremio);
  const liberados = bolo.filter((p) => {
    if (!podeSairAgora(p.saida, { vendidos: depois, compra })) return false;
    // Ponto abaixo do meu intervalo é de quem veio antes, e só é meu quando
    // ninguém na frente ainda o deve. Prêmio sem ponto (chance, personalizado)
    // não tem dono por intervalo e segue a regra de sempre.
    const ponto = p.saida.tipo === "PROGRESSO" ? p.saida.emTitulos : null;
    if (ponto == null) return true;
    return ponto > antes || varreOrfaos;
  });

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
