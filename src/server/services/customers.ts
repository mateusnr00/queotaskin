import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db";

export type CustomerSort = "spent" | "recent" | "purchases" | "name";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  role: Role;
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
  opts: {
    nome?: string;
    cpf?: string;
    email?: string;
    telefone?: string;
    sort?: CustomerSort;
    page?: number;
  } = {},
) {
  const { sort = "spent" } = opts;
  const page = Math.max(1, opts.page ?? 1);

  const nome = (opts.nome ?? "").trim();
  const cpf = (opts.cpf ?? "").replace(/\D/g, "");
  const email = (opts.email ?? "").trim();
  const telefone = (opts.telefone ?? "").replace(/\D/g, "");

  // Todo mundo ligado ao tenant: membros e quem já reservou. Uma pessoa que
  // criou conta e ainda não comprou aparece com os números zerados — é
  // cliente em potencial, e sumir com ela esconderia metade da base.
  const where = {
    AND: [
      {
        OR: [
          { tenantId },
          { reservations: { some: { raffle: { tenantId } } } },
        ],
      },
      ...(nome ? [{ name: { contains: nome, mode: "insensitive" as const } }] : []),
      ...(cpf ? [{ cpf: { contains: cpf } }] : []),
      ...(email ? [{ email: { contains: email, mode: "insensitive" as const } }] : []),
      ...(telefone ? [{ phone: { contains: telefone } }] : []),
    ],
  };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      cpf: true,
      role: true,
      createdAt: true,
    },
  });

  const ids = users.map((u) => u.id);
  if (ids.length === 0) {
    return {
      customers: [] as Customer[],
      total: 0,
      pages: 1,
      page: 1,
      totals: await calcularTotais(tenantId),
    };
  }

  // Gasto, pedidos, última compra, XP e números — cinco agregações, nenhuma
  // por linha. Buscar reserva dentro de um laço daria uma query por cliente.
  const [stats, progresso, ticketsPorUsuario] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["userId"],
      where: { status: "PAID", userId: { in: ids }, raffle: { tenantId } },
      _sum: { totalAmount: true },
      _count: { _all: true },
      _max: { paidAt: true },
    }),
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
  const xpPorUsuario = new Map(progresso.map((p) => [p.userId, p.xp]));
  const numerosPorUsuario = new Map(
    ticketsPorUsuario.map((t) => [t.userId, Number(t.total)]),
  );

  const customers: Customer[] = users.map((u) => {
    const s = porUsuario.get(u.id);
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      cpf: u.cpf,
      role: u.role,
      createdAt: u.createdAt,
      spent: s?.spent ?? 0,
      purchases: s?.purchases ?? 0,
      tickets: numerosPorUsuario.get(u.id) ?? 0,
      lastPurchaseAt: s?.lastPurchaseAt ?? null,
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

  const total = customers.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inicio = (Math.min(page, pages) - 1) * PAGE_SIZE;

  return {
    customers: customers.slice(inicio, inicio + PAGE_SIZE),
    total,
    pages,
    page: Math.min(page, pages),
    totals: await calcularTotais(tenantId),
  };
}

/**
 * Totais da base inteira — de propósito fora do filtro. Se respondessem à
 * busca, o card "Receita" mudaria a cada tecla digitada, o que não faz
 * sentido para um número que deveria servir de referência fixa.
 */
async function calcularTotais(tenantId: string): Promise<CustomerTotals> {
  const stats = await prisma.reservation.groupBy({
    by: ["userId"],
    where: { status: "PAID", userId: { not: null }, raffle: { tenantId } },
    _sum: { totalAmount: true },
    _count: { _all: true },
  });

  const receita = stats.reduce((s, v) => s + Number(v._sum.totalAmount ?? 0), 0);
  const compras = stats.reduce((s, v) => s + v._count._all, 0);
  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return {
    clientes: stats.length,
    novos30d: await prisma.user.count({
      where: {
        createdAt: { gte: trintaDias },
        OR: [{ tenantId }, { reservations: { some: { raffle: { tenantId } } } }],
      },
    }),
    receita,
    ticketMedio: compras > 0 ? receita / compras : 0,
    recorrentes: stats.filter((v) => v._count._all > 1).length,
  };
}

/** Link de conversa no WhatsApp a partir de um celular brasileiro. */
export function whatsappLink(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  return `https://wa.me/55${d}`;
}
