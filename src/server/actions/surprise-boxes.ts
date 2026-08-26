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

import { z } from "zod";

import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
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
  raw: unknown
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
          select: { status: true, raffle: { select: { tenantId: true } } },
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
      const drawn = await drawPrize(box.raffleId);

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
      const result = await prisma
        .$transaction(async (tx) => {
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
  boxId: string
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
  raffleId: string
): Promise<{ id: string } | null> {
  const available = await prisma.surpriseBoxPrize.findMany({
    where: { raffleId, locked: false, claimedAt: null },
    select: { id: true, mode: true, odds: true },
  });
  if (available.length === 0) return null;

  const percent = available.filter(
    (p) => p.mode === "PERCENT" && p.odds != null
  );
  const random = available.filter((p) => p.mode === "RANDOM");

  // Roll 0-100. Prêmios PERCENT ocupam faixas cumulativas; se o roll cai
  // numa faixa, ganhou esse prêmio. Caso contrário, cai pro pool RANDOM.
  const roll = Math.random() * 100;
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
  if (random.length > 0) {
    const pick = random[Math.floor(Math.random() * random.length)]!;
    return { id: pick.id };
  }

  // Sem RANDOM e nenhum PERCENT casou → vazio.
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
