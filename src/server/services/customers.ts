import { prisma } from "@/lib/db";

export type CustomerSort = "spent" | "recent" | "purchases" | "name";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  /** Total pago por ele neste tenant. */
  spent: number;
  purchases: number;
  tickets: number;
  lastPurchaseAt: Date | null;
  xp: number;
}

export interface CustomerTotals {
  clientes: number;
  novos30d: number;
  receita: number;
  ticketMedio: number;
  /** Clientes que compraram mais de uma vez — indicador de recorrência. */
  recorrentes: number;
}

const PAGE_SIZE = 25;

/**
 * Painel de clientes de um tenant.
 *
 * "Cliente" aqui é quem já pagou pelo menos uma reserva — não todo usuário
 * cadastrado. Quem só criou conta aparece em Usuários; aqui é a lista de
 * quem sustenta a operação.
 *
 * Tudo sai de agregações: buscar reserva por usuário num laço daria uma
 * query por linha da tabela.
 */
export async function listCustomers(
  tenantId: string,
  opts: { search?: string; sort?: CustomerSort; page?: number } = {},
) {
  const { search = "", sort = "spent" } = opts;
  const page = Math.max(1, opts.page ?? 1);

  // 1. Gasto, volume e última compra por usuário, restrito ao tenant.
  const stats = await prisma.reservation.groupBy({
    by: ["userId"],
    where: { status: "PAID", userId: { not: null }, raffle: { tenantId } },
    _sum: { totalAmount: true },
    _count: { _all: true },
    _max: { paidAt: true },
  });

  const porUsuario = new Map(
    stats.map((s) => [
      s.userId!,
      {
        spent: Number(s._sum.totalAmount ?? 0),
        purchases: s._count._all,
        lastPurchaseAt: s._max.paidAt,
      },
    ]),
  );

  const todosIds = [...porUsuario.keys()];
  if (todosIds.length === 0) {
    return {
      customers: [] as Customer[],
      total: 0,
      pages: 1,
      page: 1,
      totals: { clientes: 0, novos30d: 0, receita: 0, ticketMedio: 0, recorrentes: 0 },
    };
  }

  // 2. Dados cadastrais, já filtrados pela busca.
  const termo = search.trim();
  const digitos = termo.replace(/\D/g, "");
  const users = await prisma.user.findMany({
    where: {
      id: { in: todosIds },
      ...(termo
        ? {
            OR: [
              { name: { contains: termo, mode: "insensitive" as const } },
              { email: { contains: termo, mode: "insensitive" as const } },
              ...(digitos ? [{ phone: { contains: digitos } }] : []),
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      createdAt: true,
    },
  });

  // 3. XP e números comprados, em duas agregações.
  const ids = users.map((u) => u.id);
  const [progresso, ticketsPorUsuario] = await Promise.all([
    prisma.userProgress.findMany({
      where: { tenantId, userId: { in: ids } },
      select: { userId: true, xp: true },
    }),
    prisma.$queryRaw<{ userId: string; total: bigint }[]>`
      SELECT r."userId" AS "userId", COUNT(t.id)::bigint AS total
      FROM "Ticket" t
      JOIN "Reservation" r ON r.id = t."reservationId"
      JOIN "Raffle" rf ON rf.id = r."raffleId"
      WHERE r."userId" = ANY(${ids}::text[])
        AND rf."tenantId" = ${tenantId}
        AND t.status IN ('PAID', 'AWARDED')
      GROUP BY r."userId"
    `,
  ]);

  const xpPorUsuario = new Map(progresso.map((p) => [p.userId, p.xp]));
  const numerosPorUsuario = new Map(
    ticketsPorUsuario.map((t) => [t.userId, Number(t.total)]),
  );

  const customers: Customer[] = users.map((u) => {
    const s = porUsuario.get(u.id)!;
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      createdAt: u.createdAt,
      spent: s.spent,
      purchases: s.purchases,
      tickets: numerosPorUsuario.get(u.id) ?? 0,
      lastPurchaseAt: s.lastPurchaseAt,
      xp: xpPorUsuario.get(u.id) ?? 0,
    };
  });

  const ordenadores: Record<CustomerSort, (a: Customer, b: Customer) => number> = {
    spent: (a, b) => b.spent - a.spent,
    purchases: (a, b) => b.purchases - a.purchases,
    name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    recent: (a, b) =>
      (b.lastPurchaseAt?.getTime() ?? 0) - (a.lastPurchaseAt?.getTime() ?? 0),
  };
  customers.sort(ordenadores[sort]);

  // Os totais consideram a base inteira, não a página nem a busca — senão o
  // card "Receita" mudaria a cada vez que o admin digitasse no filtro.
  const receita = [...porUsuario.values()].reduce((s, v) => s + v.spent, 0);
  const compras = [...porUsuario.values()].reduce((s, v) => s + v.purchases, 0);
  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const totals: CustomerTotals = {
    clientes: todosIds.length,
    novos30d: await prisma.user.count({
      where: { id: { in: todosIds }, createdAt: { gte: trintaDias } },
    }),
    receita,
    ticketMedio: compras > 0 ? receita / compras : 0,
    recorrentes: [...porUsuario.values()].filter((v) => v.purchases > 1).length,
  };

  const total = customers.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inicio = (Math.min(page, pages) - 1) * PAGE_SIZE;

  return {
    customers: customers.slice(inicio, inicio + PAGE_SIZE),
    total,
    pages,
    page: Math.min(page, pages),
    totals,
  };
}

/** Link de conversa no WhatsApp a partir de um celular brasileiro. */
export function whatsappLink(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  return `https://wa.me/55${d}`;
}
