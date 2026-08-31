// Distribuição automática de Caixas Surpresas após pagamento aprovado.
//
// Chamado pelo webhook (SyncPay/CodePay) e pelo markReservationPaidAction
// quando uma reservation vai pra PAID. Idempotente: se já existem
// SurpriseBox pra essa reserva, não cria duplicatas (UNOPENED count vs.
// expectativa do combo).
//
// Lógica:
// 1. Conta quantos tickets PAID/AWARDED a reserva tem.
// 2. Carrega os combos visíveis da rifa.
// 3. Calcula quantas caixas o comprador ganha:
//    - Acumulativo: soma todos os combos com threshold ≤ tickets.
//    - Não acumulativo: pega só o combo com maior threshold ≤ tickets.
// 4. Cria N SurpriseBox em status UNOPENED e SORTEIA O PRÊMIO DE CADA UMA
//    aqui mesmo, na confirmação do pagamento.
//
// O SORTEIO MUDOU DE MOMENTO, e isso é o que faz o painel enxergar.
//
// Antes ele acontecia no instante da abertura, e uma caixa fechada não dizia
// nada: quem administra só descobria que alguém tinha ganhado depois que a
// pessoa clicasse, e um prêmio já com dono ficava invisível para quem precisa
// entregar. Podia levar dias, ou nunca. Agora a caixa nasce com o resultado
// dentro, e abrir é só revelar o que já estava lá.
//
// O resultado NÃO viaja para o navegador antes da abertura: quem monta a tela
// do comprovante manda o prêmio só das caixas já abertas, senão bastaria abrir
// o inspetor para saber qual caixa vale a pena.

import { randomInt } from "node:crypto";

import { prisma } from "@/lib/db";
import { dddDoTelefone } from "@/lib/cpf";
import {
  podeSairAgora,
  premioDaVez,
  soltaNestaAbertura,
  type CompraQueAbre,
} from "@/lib/saida";

export async function autoGenerateSurpriseBoxesForReservation(
  reservationId: string,
): Promise<number> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      raffleId: true,
      raffle: {
        select: {
          surpriseBoxEnabled: true,
          surpriseBoxCombosAccumulative: true,
        },
      },
      _count: {
        select: {
          tickets: { where: { status: { in: ["PAID", "AWARDED"] } } },
        },
      },
    },
  });

  if (!reservation || !reservation.raffle.surpriseBoxEnabled) return 0;
  const ticketCount = reservation._count.tickets;
  if (ticketCount === 0) return 0;

  const combos = await prisma.surpriseBoxCombo.findMany({
    where: { raffleId: reservation.raffleId },
    orderBy: { threshold: "asc" },
    select: { threshold: true, boxCount: true },
  });
  if (combos.length === 0) return 0;

  const eligible = combos.filter((c) => ticketCount >= c.threshold);
  if (eligible.length === 0) return 0;

  const expected = reservation.raffle.surpriseBoxCombosAccumulative
    ? eligible.reduce((sum, c) => sum + c.boxCount, 0)
    : Math.max(...eligible.map((c) => c.boxCount));

  // Idempotência sob concorrência: dois webhooks APPROVED (ou dois polls
  // com force:true) para a mesma reserva podem ler existing=0 ao mesmo tempo
  // e ambos criar o combo inteiro, dobrando os prêmios sem pagamento a mais.
  // Advisory lock por reserva serializa o par count→createMany, o mesmo
  // padrão do crédito de XP (xp.ts). A transação garante o lock por toda a
  // janela; ele é liberado ao fim dela.
  const raffleId = reservation.raffleId;
  const criadas = await prisma.$transaction(async (tx) => {
    // Forma de dois argumentos (int,int), igual ao lock de XP em xp.ts: casa
    // com a sobrecarga sem cast. O primeiro argumento é um namespace fixo
    // ('surprise_box') pra não colidir com locks de outras features.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext('surprise_box'), hashtext(${reservationId}))
    `;

    const existing = await tx.surpriseBox.count({ where: { reservationId } });
    const toCreate = expected - existing;
    if (toCreate <= 0) return 0;

    await tx.surpriseBox.createMany({
      data: Array.from({ length: toCreate }, () => ({
        raffleId,
        reservationId,
      })),
    });

    return toCreate;
  });

  if (criadas > 0) await sortearPremiosDaReserva(reservationId);
  return criadas;
}

/**
 * Decide o prêmio de cada caixa desta compra que ainda não foi sorteada.
 *
 * FORA DA TRANSAÇÃO DA CRIAÇÃO, de propósito. Reservar prêmio é disputa com
 * os outros compradores, e prender isso na mesma transação que segura o
 * cadeado da reserva faria uma compra grande travar o pagamento de todo mundo
 * enquanto sorteia.
 *
 * Caixa por caixa, e não tudo de uma vez, porque cada sorteio depende do que
 * sobrou depois do anterior: o ponto de saída agendado é sequencial e o bolo
 * encolhe a cada prêmio reservado.
 */
async function sortearPremiosDaReserva(reservationId: string): Promise<void> {
  const reserva = await prisma.reservation.findUnique({
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
  if (!reserva) return;

  const aSortear = await prisma.surpriseBox.findMany({
    where: { reservationId, premioSorteadoEm: null, status: "UNOPENED" },
    select: { id: true },
    // Mesma ordem que a tela mostra, e com o id desempatando: as caixas nascem
    // no mesmo instante, e sem isso o sorteio percorreria uma ordem e a tela
    // mostraria outra.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (aSortear.length === 0) return;

  const compra: CompraQueAbre = {
    titulos: reserva._count.tickets,
    quando: reserva.paidAt ?? reserva.createdAt,
    ddd: dddDoTelefone(reserva.participantPhone),
  };

  for (let i = 0; i < aSortear.length; i++) {
    // Uma caixa que falha não derruba as outras. Sem isto, um prêmio em
    // estado inconsistente fazia a compra inteira ficar sem sorteio nenhum, e
    // em silêncio: quem chama esta função engole o erro para não travar a
    // confirmação do pagamento.
    try {
      await sortearUmaCaixa(
        aSortear[i]!.id,
        reserva.raffleId,
        compra,
        aSortear.length - i,
      );
    } catch (err) {
      console.error("[sortearPremiosDaReserva] caixa", aSortear[i]!.id, err);
    }
  }
}

/** Quantas vezes tentar quando outro comprador leva o prêmio no meio. */
const TENTATIVAS_DE_SORTEIO = 3;

/**
 * Sorteia e reserva o prêmio de UMA caixa, ou a marca como sem prêmio.
 *
 * A reserva do prêmio é a mesma trava de sempre: só leva quem encontrar
 * `claimedAt` nulo. Dois compradores sorteando o mesmo prêmio no mesmo
 * instante disputam esta linha, e um só ganha; o outro tenta de novo.
 */
async function sortearUmaCaixa(
  boxId: string,
  raffleId: string,
  compra: CompraQueAbre,
  caixasRestantes: number,
): Promise<void> {
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_SORTEIO; tentativa++) {
    const escolhido = await sortearPremio(raffleId, compra, caixasRestantes);
    if (!escolhido) {
      await prisma.surpriseBox.updateMany({
        where: { id: boxId, premioSorteadoEm: null },
        data: { premioSorteadoEm: new Date() },
      });
      return;
    }

    const levou = await prisma.$transaction(async (tx) => {
      const claimed = await tx.surpriseBoxPrize.updateMany({
        where: { id: escolhido, claimedAt: null, locked: false },
        data: { claimedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await tx.surpriseBox.updateMany({
        where: { id: boxId, premioSorteadoEm: null },
        data: { prizeId: escolhido, premioSorteadoEm: new Date() },
      });
      return true;
    });
    if (levou) return;
  }

  // Perdeu as três disputas: fecha sem prêmio, senão a caixa ficaria para
  // sempre sem sorteio e a abertura não saberia o que mostrar.
  await prisma.surpriseBox.updateMany({
    where: { id: boxId, premioSorteadoEm: null },
    data: { premioSorteadoEm: new Date() },
  });
}

/**
 * Qual prêmio sai agora, ou nulo para caixa vazia.
 *
 * Mesmas regras de sempre, na mesma ordem: o agendado que já venceu manda, a
 * chance é a reserva, e prêmio marcado para mais adiante nem entra no bolo.
 * Só mudou o momento em que isto roda.
 */
async function sortearPremio(
  raffleId: string,
  compra: CompraQueAbre,
  caixasRestantes: number,
): Promise<string | null> {
  const disponiveis = await prisma.surpriseBoxPrize.findMany({
    // `claimedByBox: null` além do `claimedAt`: são duas marcas da mesma
    // coisa, e elas podem discordar (uma correção no banco que zera uma e
    // esquece a outra, por exemplo). Quando discordam, o prêmio entra no bolo
    // já preso a outra caixa, e a gravação bate no unique de prizeId e derruba
    // o sorteio da compra inteira. Perguntar pelas duas fecha essa porta.
    where: { raffleId, locked: false, claimedAt: null, claimedByBox: null },
    select: {
      id: true,
      mode: true,
      odds: true,
      tipoDeSaida: true,
      saidaEmTitulos: true,
      saidaTitulosDe: true,
      saidaTitulosAte: true,
      saidaDataDe: true,
      saidaDataAte: true,
      saidaDdds: true,
    },
  });
  if (disponiveis.length === 0) return null;

  const vendidos = await prisma.ticket.count({
    where: { raffleId, status: "PAID" },
  });

  const agendado = premioDaVez(
    disponiveis.map((p) => ({
      id: p.id,
      saida: {
        tipo: p.tipoDeSaida,
        emTitulos: p.saidaEmTitulos,
        titulosDe: p.saidaTitulosDe,
        titulosAte: p.saidaTitulosAte,
        dataDe: p.saidaDataDe,
        dataAte: p.saidaDataAte,
        ddds: p.saidaDdds,
      },
    })),
    { vendidos, compra },
  );

  const liberados = disponiveis.filter((p) =>
    podeSairAgora(
      {
        tipo: p.tipoDeSaida,
        emTitulos: p.saidaEmTitulos,
        titulosDe: p.saidaTitulosDe,
        titulosAte: p.saidaTitulosAte,
        dataDe: p.saidaDataDe,
        dataAte: p.saidaDataAte,
        ddds: p.saidaDdds,
      },
      { vendidos, compra },
    ),
  );

  const percent = liberados.filter(
    (p) => p.mode === "PERCENT" && p.odds != null,
  );
  const random = liberados.filter((p) => p.mode === "RANDOM");

  const emPe = new Set(random.map((p) => p.id));
  if (agendado) emPe.add(agendado);
  const solta = soltaNestaAbertura(
    { premios: emPe.size, aberturasRestantes: caixasRestantes },
    randomInt(0, 10_000) / 10_000,
  );

  if (agendado && solta) return agendado;

  const rolagem = randomInt(0, 10000) / 100;
  let acumulado = 0;
  for (const p of embaralhar(percent)) {
    acumulado += Number(p.odds);
    if (rolagem < acumulado) return p.id;
  }

  if (random.length > 0 && solta) {
    return random[randomInt(random.length)]!.id;
  }
  return null;
}

/** Sem viés de ordem de cadastro entre prêmios de mesma chance. */
function embaralhar<T>(lista: T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
