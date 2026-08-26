"use server";

// Estatísticas agregadas por sorteio, usadas no modal "Ranking de Compras"
// dentro de /admin/sorteios/[id]/compras. Top 10 compradores agrupados por
// (participantName, participantPhone) somando tickets pagos no período.

import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import type { ActionResult } from "@/server/actions/auth";

const inputSchema = z.object({
  raffleId: z.string().min(1),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

export interface TopBuyer {
  rank: number;
  name: string;
  phone: string | null;
  ticketCount: number;
  totalAmount: number;
}

export async function getTopBuyersAction(
  raw: unknown
): Promise<ActionResult<{ buyers: TopBuyer[] }>> {
  try {
    const session = await requireAdmin();
    const tenantId = await getActiveTenantIdForAdmin(session.user);
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos" };
    }
    const { raffleId, startDate, endDate } = parsed.data;

    // Bloqueia cross-tenant: rifa precisa pertencer ao tenant ativo.
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { tenantId: true },
    });
    if (!raffle || raffle.tenantId !== tenantId) {
      return { ok: false, error: "Sorteio não encontrado" };
    }

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    // Agrega só PAID (compras de fato concluídas) no range. Sem range =
    // histórico completo do sorteio.
    const grouped = await prisma.reservation.groupBy({
      by: ["participantName", "participantPhone"],
      where: {
        raffleId,
        status: "PAID",
        ...(start || end
          ? {
              paidAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    // groupBy não soma tickets, busca contagem real (PAID/AWARDED) por par.
    const buyers: TopBuyer[] = await Promise.all(
      grouped.map(async (g) => {
        const ticketCount = await prisma.ticket.count({
          where: {
            raffleId,
            status: { in: ["PAID", "AWARDED"] },
            reservation: {
              participantName: g.participantName,
              participantPhone: g.participantPhone,
            },
          },
        });
        return {
          rank: 0, // preenchido após sort
          name: g.participantName,
          phone: g.participantPhone,
          ticketCount,
          totalAmount: Number(g._sum.totalAmount ?? 0),
        };
      })
    );

    buyers.sort((a, b) => b.ticketCount - a.ticketCount);
    const top = buyers.slice(0, 10).map((b, i) => ({ ...b, rank: i + 1 }));

    return { ok: true, data: { buyers: top } };
  } catch (err) {
    console.error("[getTopBuyersAction]", err);
    return { ok: false, error: "Erro ao buscar ranking" };
  }
}
