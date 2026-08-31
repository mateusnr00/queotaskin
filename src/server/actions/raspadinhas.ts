"use server";

// Revelação de uma Raspadinha Premiada.
//
// O RESULTADO NUNCA VEM DO NAVEGADOR
//
// O bilhete chega na tela sem saber o que tem embaixo da película: a lista de
// raspadinhas é entregue com status e número, e nada mais. O prêmio é
// sorteado aqui, no momento em que a pessoa começa a raspar, e só então
// desce. Quem abrir o inspetor antes de raspar não encontra o resultado
// porque ele ainda não existe.
//
// As quatro garantias são as mesmas da Caixa Surpresa, de propósito:
//
//   resultado só do servidor   nada de Math.random no cliente
//   idempotente                revelar de novo devolve o mesmo prêmio
//   atômico                    o mesmo prêmio nunca sai em dois bilhetes
//   dono                       só a reserva dona raspa o próprio bilhete
//
// Copiar a forma da caixa, e não inventar outra, faz as duas se comportarem
// igual em vez de terem bugs diferentes.

import { randomInt } from "node:crypto";
import { premioDaVez, type CompraQueAbre } from "@/lib/saida";
import { dddDoTelefone } from "@/lib/cpf";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { sessionMayAccessOwnedResource } from "@/lib/auth-helpers";
import type { ActionResult } from "@/server/actions/auth";

/** Quantas vezes tentar quando outro bilhete leva o prêmio no meio do caminho. */
const TENTATIVAS = 3;

const revelarSchema = z.object({
  reservationId: z.string().cuid(),
  raspadinhaId: z.string().cuid(),
});

export interface PremioDaRaspadinha {
  id: string;
  tipo: "PIX" | "SKIN";
  rotulo: string;
  valor: number | null;
}

export interface ResultadoDaRaspadinha {
  status: "PREMIADA" | "SEM_PREMIO";
  premio: PremioDaRaspadinha | null;
}

function paraFora(p: {
  id: string;
  tipo: "PIX" | "SKIN";
  rotulo: string;
  valor: unknown;
}): PremioDaRaspadinha {
  return {
    id: p.id,
    tipo: p.tipo,
    rotulo: p.rotulo,
    valor: p.valor == null ? null : Number(p.valor),
  };
}

export async function revelarRaspadinhaAction(
  raw: unknown,
): Promise<ActionResult<ResultadoDaRaspadinha>> {
  try {
    const parsed = revelarSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Dados inválidos" };
    const { reservationId, raspadinhaId } = parsed.data;

    const tenant = await getCurrentTenant();
    if (!tenant) return { ok: false, error: "Tenant inválido" };

    const bilhete = await prisma.raspadinha.findUnique({
      where: { id: raspadinhaId },
      select: {
        id: true,
        status: true,
        reservationId: true,
        raffleId: true,
        premio: { select: { id: true, tipo: true, rotulo: true, valor: true } },
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

    // A mesma mensagem para bilhete inexistente e para bilhete de outra
    // pessoa: distinguir os dois contaria a um estranho que aquele id existe.
    const naoEncontrada = {
      ok: false as const,
      error: "Raspadinha não encontrada",
    };
    if (!bilhete) return naoEncontrada;
    if (bilhete.reservationId !== reservationId) return naoEncontrada;
    if (bilhete.reservation.raffle.tenantId !== tenant.id) return naoEncontrada;
    if (!(await sessionMayAccessOwnedResource(bilhete.reservation.userId))) {
      return naoEncontrada;
    }
    if (bilhete.reservation.status !== "PAID") {
      return { ok: false, error: "Reserva não está paga" };
    }

    // Idempotência. A raspagem é gesto, e gesto se repete: a pessoa recarrega
    // a página no meio, o dedo escorrega, a conexão cai e ela tenta de novo.
    // Sem isto, a segunda tentativa sortearia outro prêmio.
    if (bilhete.status === "PREMIADA" && bilhete.premio) {
      return {
        ok: true,
        data: { status: "PREMIADA", premio: paraFora(bilhete.premio) },
      };
    }
    if (bilhete.status === "SEM_PREMIO") {
      return { ok: true, data: { status: "SEM_PREMIO", premio: null } };
    }

    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
      const sorteado = await sortearPremio(bilhete.raffleId, {
        titulos: bilhete.reservation._count.tickets,
        quando: bilhete.reservation.paidAt ?? bilhete.reservation.createdAt,
        ddd: dddDoTelefone(bilhete.reservation.participantPhone),
      });

      if (!sorteado) {
        // Acabaram os prêmios disponíveis. O bilhete fecha sem prêmio, e não
        // fica pendente: pendente faria a pessoa raspar de novo para sempre.
        await prisma.raspadinha.updateMany({
          where: { id: bilhete.id, status: "DISPONIVEL" },
          data: { status: "SEM_PREMIO", raspadaEm: new Date() },
        });
        return { ok: true, data: { status: "SEM_PREMIO", premio: null } };
      }

      // A trava: só leva quem encontrar claimedAt ainda nulo. Dois bilhetes
      // revelados no mesmo instante disputam esta linha, e um só ganha.
      const levou = await prisma.raspadinhaPremio.updateMany({
        where: { id: sorteado.id, claimedAt: null, travado: false },
        data: { claimedAt: new Date() },
      });
      if (levou.count === 0) continue; // outro bilhete chegou antes; sorteia de novo

      const gravou = await prisma.raspadinha.updateMany({
        where: { id: bilhete.id, status: "DISPONIVEL" },
        data: {
          status: "PREMIADA",
          premioId: sorteado.id,
          raspadaEm: new Date(),
        },
      });

      if (gravou.count === 0) {
        // O bilhete foi revelado por outra aba enquanto este sorteava.
        // Devolve o prêmio para o bolo, senão ele sumiria sem dono.
        await prisma.raspadinhaPremio.updateMany({
          where: { id: sorteado.id, claimedAt: { not: null } },
          data: { claimedAt: null },
        });
        const atual = await prisma.raspadinha.findUnique({
          where: { id: bilhete.id },
          select: {
            status: true,
            premio: {
              select: { id: true, tipo: true, rotulo: true, valor: true },
            },
          },
        });
        return atual?.status === "PREMIADA" && atual.premio
          ? {
              ok: true,
              data: { status: "PREMIADA", premio: paraFora(atual.premio) },
            }
          : { ok: true, data: { status: "SEM_PREMIO", premio: null } };
      }

      return {
        ok: true,
        data: { status: "PREMIADA", premio: paraFora(sorteado) },
      };
    }

    // Três disputas perdidas seguidas: a essa altura o bolo esvaziou.
    await prisma.raspadinha.updateMany({
      where: { id: bilhete.id, status: "DISPONIVEL" },
      data: { status: "SEM_PREMIO", raspadaEm: new Date() },
    });
    return { ok: true, data: { status: "SEM_PREMIO", premio: null } };
  } catch (err) {
    console.error("[revelarRaspadinhaAction]", err);
    return { ok: false, error: "Erro ao revelar a raspadinha" };
  }
}

/**
 * Escolhe um prêmio entre os disponíveis.
 *
 * Prêmio com chance ocupa uma faixa; o sorteio cai numa faixa ou em nenhuma.
 * Não caindo em nenhuma, escolhe entre os sem chance definida, que são o
 * bolo comum. Sem nenhum dos dois, devolve nulo e o bilhete sai sem prêmio.
 *
 * randomInt do node:crypto, e não Math.random: aqui se decide dinheiro, e o
 * gerador comum é previsível o bastante para não servir.
 */
async function sortearPremio(raffleId: string, compra: CompraQueAbre) {
  const disponiveis = await prisma.raspadinhaPremio.findMany({
    where: { raffleId, travado: false, claimedAt: null },
    select: {
      id: true,
      tipo: true,
      rotulo: true,
      valor: true,
      chance: true,
      tipoDeSaida: true,
      saidaEmTitulos: true,
      saidaTitulosDe: true,
      saidaTitulosAte: true,
      saidaDataDe: true,
      saidaDataAte: true,
      saidaDdds: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (disponiveis.length === 0) return null;

  // A SAÍDA AGENDADA MANDA; A CHANCE É A RESERVA.
  //
  // Mesma regra da caixa surpresa, e pelo mesmo motivo: o ponto de saída é
  // promessa, então vem ANTES do sorteio em vez de concorrer com ele. Só
  // quando nada está agendado para agora é que a chance decide, que é o
  // comportamento que os prêmios sem ponto continuam tendo.
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
  if (agendado) {
    const escolhido = disponiveis.find((p) => p.id === agendado);
    if (escolhido) return escolhido;
  }

  const comChance = disponiveis.filter((p) => p.chance != null);
  const semChance = disponiveis.filter((p) => p.chance == null);

  // Sorteio em milésimos de ponto: chance é DECIMAL(5,2), então 12,34% cabe
  // exato. Em inteiro não haveria como representar meio por cento.
  const rolagem = randomInt(0, 10_000);
  let acumulado = 0;
  for (const premio of comChance) {
    acumulado += Math.round(Number(premio.chance) * 100);
    if (rolagem < acumulado) return premio;
  }

  if (semChance.length === 0) return null;
  return semChance[randomInt(0, semChance.length)];
}
