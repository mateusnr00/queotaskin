import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import type { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsersFilters } from "@/components/admin/users-filters";
import { formatBRL } from "@/lib/format";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Usuários" };

const PAGE_SIZE = 20;

const ROLE_META: Record<
  Role,
  { label: string; className: string }
> = {
  SUPER_ADMIN: {
    label: "Super admin",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  ADMIN: {
    label: "Admin",
    className:
      "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
  },
  AFFILIATE: {
    label: "Afiliado",
    className:
      "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  PARTICIPANT: {
    label: "Participante",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string;
    name?: string;
    cpf?: string;
    email?: string;
    phone?: string;
    page?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;
  const role = sp.role && sp.role !== "all" ? (sp.role as Role) : undefined;
  const name = (sp.name ?? "").trim();
  const cpf = (sp.cpf ?? "").trim().replace(/\D/g, "");
  const email = (sp.email ?? "").trim();
  const phone = (sp.phone ?? "").trim().replace(/\D/g, "");
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // Mostra só usuários relevantes pra esse tenant: membros (ADMIN/AFFILIATE
  // com tenantId batendo) ou participantes que já compraram em alguma rifa
  // do tenant.
  const where: Prisma.UserWhereInput = {
    OR: [
      { tenantId },
      { reservations: { some: { raffle: { tenantId } } } },
    ],
    ...(role && { role }),
    ...(name && { name: { contains: name, mode: "insensitive" } }),
    ...(cpf && { cpf: { contains: cpf } }),
    ...(email && { email: { contains: email, mode: "insensitive" } }),
    ...(phone && { phone: { contains: phone } }),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        phone: true,
        role: true,
        createdAt: true,
        affiliate: { select: { code: true } },
      },
    }),
  ]);

  // Estatísticas por usuário (reservas + tickets pagos + valor) restritas
  // ao tenant atual — admins não veem somatórios de compras feitas em
  // outros tenants.
  const userIds = users.map((u) => u.id);
  const [resStats, tixStats] =
    userIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.reservation.groupBy({
            by: ["userId"],
            where: {
              userId: { in: userIds },
              raffle: { tenantId },
            },
            _count: { _all: true },
            _sum: { totalAmount: true },
          }),
          prisma.ticket.groupBy({
            by: ["reservationId"],
            where: {
              status: "PAID",
              reservation: {
                userId: { in: userIds },
                raffle: { tenantId },
              },
            },
            _count: { _all: true },
          }),
        ]);

  const resByUser = new Map<
    string,
    { orderCount: number; valor: number }
  >();
  for (const r of resStats) {
    if (!r.userId) continue;
    resByUser.set(r.userId, {
      orderCount: r._count._all,
      valor: Number(r._sum.totalAmount ?? 0),
    });
  }

  // tickets agrupados por reservationId; precisamos reagrupar por userId.
  // Para isso, fazemos uma query separada que junta tickets→reservation→user.
  const ticketsByUser =
    userIds.length === 0
      ? new Map<string, number>()
      : await prisma.$queryRaw<{ userId: string; count: bigint }[]>`
          SELECT r."userId" AS "userId", COUNT(t.id)::bigint AS count
          FROM "Ticket" t
          JOIN "Reservation" r ON r.id = t."reservationId"
          JOIN "Raffle" rf ON rf.id = r."raffleId"
          WHERE r."userId" = ANY(${userIds}::text[])
            AND rf."tenantId" = ${tenantId}
          GROUP BY r."userId"
        `.then(
          (rows) =>
            new Map<string, number>(
              rows.map((r) => [r.userId, Number(r.count)])
            )
        );
  // suprime no-unused
  void tixStats;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (name) params.set("name", name);
    if (cpf) params.set("cpf", cpf);
    if (email) params.set("email", email);
    if (phone) params.set("phone", phone);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      {/* Header com breadcrumb */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Usuários
          </h1>
          <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/admin/usuarios" className="hover:text-foreground">
              Usuários
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Lista</span>
          </nav>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString("pt-BR")} usuário(s)
        </span>
      </div>

      <UsersFilters />

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Afiliado</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Pedidos</TableHead>
              <TableHead className="text-center">Números</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Nenhum usuário encontrado para os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const initial = u.name.charAt(0).toUpperCase();
                const meta = ROLE_META[u.role];
                const stats = resByUser.get(u.id);
                const orderCount = stats?.orderCount ?? 0;
                const valor = stats?.valor ?? 0;
                const numbers = ticketsByUser.get(u.id) ?? 0;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-foreground text-sm">
                          {initial}
                        </span>
                        <span className="font-medium text-sm truncate max-w-[16rem]">
                          {u.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {u.phone ? formatPhone(u.phone) : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[12rem]">
                      {u.email ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {u.cpf ? formatCpf(u.cpf) : "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.affiliate ? (
                        <span className="font-mono rounded bg-muted px-2 py-0.5">
                          {u.affiliate.code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          meta.className
                        )}
                      >
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs font-medium">
                        Ativo
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {orderCount}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {numbers}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">
                      {formatBRL(valor)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/usuarios/${u.id}/editar`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        Editar
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            Página {page} de {totalPages} ·{" "}
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} de {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
