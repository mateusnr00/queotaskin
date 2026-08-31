"use server";

// Server action de abertura de Caixa Surpresa.
//
// Segurança (spec do Mateus):
// - Resultado vem SOMENTE do backend; o frontend não decide nada.
// - Idempotente: abrir uma caixa já aberta retorna o mesmo resultado.
// - Atômico: o mesmo prêmio nunca sai pra 2 caixas (UPDATE com
//   claimedAt IS NULL como guarda + retry curto).
// - Prêmios bloqueados nunca saem.
// - Caixa só pode ser aberta pela reserva dona dela (link público com
//   reservationId, mesmo modelo de ownership do comprovante).
//
// Sorteio:
// - Roll 0-100.
// - Prêmios PERCENT (com odds): cada um ocupa uma faixa cumulativa.
//   Se o roll cai numa faixa, esse prêmio é o escolhido.
// - Se nenhum PERCENT casa, escolhe uniformemente entre os RANDOM.
// - Se pool vazio (todos claimed ou todos locked), caixa vira
//   OPENED_EMPTY ("não foi dessa vez!").

import { randomInt } from "node:crypto";
import {
  podeSairAgora,
  premioDaVez,
  soltaNestaAbertura,
  type CompraQueAbre,
} from "@/lib/saida";
import { dddDoTelefone } from "@/lib/cpf";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { sessionMayAccessOwnedResource } from "@/lib/auth-helpers";
import type { ActionResult } from "@/server/actions/auth";

const MAX_DRAW_RETRIES = 3;

const openSchema = z.object({
  reservationId: z.string().cuid(),
  boxId: z.string().cuid(),
});

export interface OpenedBoxResult {
  status: "OPENED_PRIZE" | "OPENED_EMPTY";
  prize: {
    id: string;
    title: string;
    prize: string;
  } | null;
}

export async function openSurpriseBoxAction(
  raw: unknown,
): Promise<ActionResult<OpenedBoxResult>> {
  try {
    const parsed = openSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }
    const { reservationId, boxId } = parsed.data;

    const tenant = await getCurrentTenant();
    if (!tenant) return { ok: false, error: "Tenant inválido" };

    // Valida ownership: caixa pertence à reserva, reserva pertence ao tenant
    // ativo, reserva está PAID.
    const box = await prisma.surpriseBox.findUnique({
      where: { id: boxId },
      select: {
        id: true,
        status: true,
        reservationId: true,
        raffleId: true,
        prizeId: true,
        prize: { select: { id: true, title: true, prize: true } },
        reservation: {
          select: {
            status: true,
            userId: true,
            paidAt: true,
            createdAt: true,
            participantPhone: true,
            _count: { select: { tickets: true } },
            raffle: { select: { tenantId: true } },
          },
        },
      },
    });
    if (!box) return { ok: false, error: "Caixa não encontrada" };
    if (box.reservationId !== reservationId) {
      return { ok: false, error: "Caixa não pertence a essa reserva" };
    }
    if (box.reservation.raffle.tenantId !== tenant.id) {
      return { ok: false, error: "Caixa não encontrada" };
    }
    // Isolamento: logado só abre a própria caixa (admin também); deslogado
    // passa pelo link (cuid), a credencial do comprovante.
    if (!(await sessionMayAccessOwnedResource(box.reservation.userId))) {
      return { ok: false, error: "Caixa não encontrada" };
    }
    if (box.reservation.status !== "PAID") {
      return { ok: false, error: "Reserva não está paga" };
    }

    // Idempotência: caixa já aberta retorna o mesmo resultado.
    if (box.status === "OPENED_PRIZE" && box.prize) {
      return {
        ok: true,
        data: { status: "OPENED_PRIZE", prize: box.prize },
      };
    }
    if (box.status === "OPENED_EMPTY") {
      return { ok: true, data: { status: "OPENED_EMPTY", prize: null } };
    }

    // Tenta até 3x, race em concorrência (prize foi pego por outra caixa).
    for (let attempt = 0; attempt < MAX_DRAW_RETRIES; attempt++) {
      // Recontado a cada tentativa: a caixa de agora ainda está UNOPENED, e
      // é ela que faz a última abertura soltar garantido.
      const caixasRestantes = await prisma.surpriseBox.count({
        where: { reservationId: box.reservationId, status: "UNOPENED" },
      });
      const drawn = await drawPrize(
        box.raffleId,
        {
          titulos: box.reservation._count.tickets,
          quando: box.reservation.paidAt ?? box.reservation.createdAt,
          ddd: dddDoTelefone(box.reservation.participantPhone),
        },
        caixasRestantes,
      );

      if (!drawn) {
        // Pool vazio → caixa vazia.
        const updated = await prisma.surpriseBox.updateMany({
          where: { id: boxId, status: "UNOPENED" },
          data: { status: "OPENED_EMPTY", openedAt: new Date() },
        });
        if (updated.count === 0) {
          // Outra request abriu a mesma caixa no meio do caminho, re-lê.
          return await refetchOpened(boxId);
        }
        return { ok: true, data: { status: "OPENED_EMPTY", prize: null } };
      }

      // Tenta reservar o prêmio atomicamente.
      const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.surpriseBoxPrize.updateMany({
          where: { id: drawn.id, claimedAt: null, locked: false },
          data: { claimedAt: new Date() },
        });
        if (claimed.count === 0) return null; // race, outro vencedor

        const boxUpdated = await tx.surpriseBox.updateMany({
          where: { id: boxId, status: "UNOPENED" },
          data: {
            status: "OPENED_PRIZE",
            prizeId: drawn.id,
            openedAt: new Date(),
          },
        });
        if (boxUpdated.count === 0) {
          // A caixa foi aberta por outra request (raríssimo). Devolve o
          // prêmio pro pool (rollback do claim).
          await tx.surpriseBoxPrize.update({
            where: { id: drawn.id },
            data: { claimedAt: null },
          });
          return "BOX_RACE" as const;
        }

        const prize = await tx.surpriseBoxPrize.findUnique({
          where: { id: drawn.id },
          select: { id: true, title: true, prize: true },
        });
        return prize;
      });

      if (result === "BOX_RACE") {
        // Outra request foi mais rápida, re-lê o resultado.
        return await refetchOpened(boxId);
      }
      if (result) {
        return {
          ok: true,
          data: { status: "OPENED_PRIZE", prize: result },
        };
      }
      // result === null → race no prize, tenta de novo (retry loop).
    }

    // Todos os retries falharam, sela como vazio pra não travar o usuário.
    await prisma.surpriseBox.updateMany({
      where: { id: boxId, status: "UNOPENED" },
      data: { status: "OPENED_EMPTY", openedAt: new Date() },
    });
    return { ok: true, data: { status: "OPENED_EMPTY", prize: null } };
  } catch (err) {
    console.error("[openSurpriseBoxAction]", err);
    return { ok: false, error: "Erro ao abrir caixa" };
  }
}

// Lê o estado pós-abertura quando uma race aconteceu, outra request
// fechou o estado, só precisamos retornar o que ficou gravado.
async function refetchOpened(
  boxId: string,
): Promise<ActionResult<OpenedBoxResult>> {
  const box = await prisma.surpriseBox.findUnique({
    where: { id: boxId },
    select: {
      status: true,
      prize: { select: { id: true, title: true, prize: true } },
    },
  });
  if (!box) return { ok: false, error: "Caixa não encontrada" };
  if (box.status === "OPENED_PRIZE" && box.prize) {
    return { ok: true, data: { status: "OPENED_PRIZE", prize: box.prize } };
  }
  if (box.status === "OPENED_EMPTY") {
    return { ok: true, data: { status: "OPENED_EMPTY", prize: null } };
  }
  return { ok: false, error: "Estado inconsistente, tente de novo" };
}

// Sorteio do prêmio. Não modifica nada, só decide quem ganha. O claim
// atômico é feito pelo caller via updateMany com claimedAt IS NULL.
//
// Returns null se pool vazio.
async function drawPrize(
  raffleId: string,
  compra: CompraQueAbre,
  /** Caixas desta compra que ainda não foram abertas, contando a de agora. */
  caixasRestantes: number,
): Promise<{ id: string } | null> {
  const available = await prisma.surpriseBoxPrize.findMany({
    where: { raffleId, locked: false, claimedAt: null },
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
  if (available.length === 0) return null;

  // A SAÍDA AGENDADA MANDA; A CHANCE É A RESERVA.
  //
  // O ponto de saída é promessa: o prêmio vai para a primeira caixa aberta a
  // partir dele. Então ele vem ANTES do sorteio, e não concorre com ele. Só
  // quando nada está agendado para agora é que o sorteio por chance decide,
  // que é o comportamento que os prêmios antigos, sem ponto, continuam tendo.
  const vendidos = await prisma.ticket.count({
    where: { raffleId, status: "PAID" },
  });
  const agendado = premioDaVez(
    available.map((p) => ({
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
  // SÓ QUEM JÁ PODE SAIR ENTRA NO SORTEIO.
  //
  // O agendamento valia só para um lado: empurrava o prêmio para fora na hora
  // marcada, mas não o segurava antes dela. O sorteio por chance e o uniforme
  // continuavam pegando qualquer prêmio do bolo, inclusive um marcado para
  // 60%, então uma compra grande no começo esvaziava tudo de uma vez e os
  // pontos cadastrados não valiam nada. Foi exatamente o relato: vinte e cinco
  // por cento vendido e sete prêmios saindo juntos.
  const liberados = available.filter((p) =>
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

  // OS PRÊMIOS SE ESPALHAM PELAS CAIXAS DA COMPRA.
  //
  // Enquanto sobrava prêmio no bolo, TODA caixa ganhava: quem comprava
  // cinquenta e quatro caixas com quatro prêmios em pé via os quatro saírem
  // nas quatro primeiras e cinquenta vazias em fila. O sorteio estava certo e
  // o resultado também, mas quem abre lê que os prêmios acabaram na quarta
  // caixa e que o resto é formalidade.
  //
  // Conta em soltaNestaAbertura: prêmios sobre caixas que ainda faltam. Todos
  // saem até o fim da compra, só que espalhados.
  //
  // Os PERCENT ficam de fora desta conta e continuam rolando a chance deles em
  // toda caixa: ali a raridade é a regra, e forçar a saída no fim da compra
  // transformaria um prêmio de 1% em prêmio garantido.
  const emPe = new Set(random.map((p) => p.id));
  if (agendado) emPe.add(agendado);
  const solta = soltaNestaAbertura(
    { premios: emPe.size, aberturasRestantes: caixasRestantes },
    randomInt(0, 10_000) / 10_000,
  );

  if (agendado && solta) return { id: agendado };

  // Roll 0-100. Prêmios PERCENT ocupam faixas cumulativas; se o roll cai
  // numa faixa, ganhou esse prêmio. Caso contrário, cai pro pool RANDOM.
  // randomInt (CSPRNG) no lugar de Math.random: o sorteio distribui prêmios de
  // valor real, então não pode usar PRNG enviesável. 0.00 a 99.99.
  const roll = randomInt(0, 10000) / 100;
  let cumulative = 0;
  // Shuffle pra evitar viés de ordem de cadastro entre PERCENT iguais.
  const shuffledPercent = shuffle(percent);
  for (const p of shuffledPercent) {
    cumulative += Number(p.odds);
    if (roll < cumulative) {
      return { id: p.id };
    }
  }

  // Nenhum PERCENT casou, picks uniforme entre os RANDOM disponíveis.
  if (random.length > 0 && solta) {
    const pick = random[randomInt(random.length)]!;
    return { id: pick.id };
  }

  // Sem RANDOM e nenhum PERCENT casou → vazio.
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
