import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format";

export const metadata: Metadata = { title: "Relatórios" };

type GroupKey = "day" | "week" | "month";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Calcula a chave de agrupamento (segunda-feira da semana ISO) para uma data.
// Padrão ISO 8601: semana começa na segunda.
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 1); // segunda da mesma semana
  return date.toISOString().slice(0, 10);
}

function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

const GROUP_LABEL: Record<GroupKey, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
};

function formatBucketLabel(bucket: string, group: GroupKey): string {
  if (group === "month") {
    const [y, m] = bucket.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(date);
  }
  const date = new Date(bucket + "T00:00:00Z");
  if (group === "week") {
    return (
      "Sem. iniciada em " +
      new Intl.DateTimeFormat("pt-BR").format(date)
    );
  }
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    group?: string;
    raffleId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;
  const group = (["day", "week", "month"].includes(sp.group ?? "")
    ? sp.group
    : "day") as GroupKey;
  const raffleId = sp.raffleId === "all" ? undefined : sp.raffleId;

  // Padrão: últimos 30 dias.
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const from = sp.from ? new Date(sp.from) : defaultFrom;
  const to = sp.to ? new Date(sp.to + "T23:59:59") : now;

  // Carrega reservas PAGAS no intervalo. Considera apenas as confirmadas;
  // pendentes/expiradas não contam como venda. Filtra pelo tenant atual.
  const where: Prisma.ReservationWhereInput = {
    status: "PAID",
    paidAt: { gte: from, lte: to },
    raffle: { tenantId },
    ...(raffleId && { raffleId }),
  };

  const [reservations, raffleOptions] = await Promise.all([
    prisma.reservation.findMany({
      where,
      orderBy: { paidAt: "asc" },
      select: {
        paidAt: true,
        totalAmount: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.raffle.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  // Agrega in-memory pelo bucket escolhido.
  // Para escalar (centenas de milhares de reservas), trocar pra query SQL
  // com date_trunc, Prisma raw query. Por enquanto JS é suficiente.
  const bucketKeyFn =
    group === "day" ? isoDay : group === "week" ? isoWeek : isoMonth;

  const buckets = new Map<
    string,
    { count: number; tickets: number; total: number }
  >();

  for (const r of reservations) {
    if (!r.paidAt) continue;
    const key = bucketKeyFn(r.paidAt);
    const entry = buckets.get(key) ?? { count: 0, tickets: 0, total: 0 };
    entry.count += 1;
    entry.tickets += r._count.tickets;
    entry.total += Number(r.totalAmount);
    buckets.set(key, entry);
  }

  const rows = Array.from(buckets.entries()).sort(([a], [b]) =>
    a < b ? 1 : -1 // mais recente primeiro
  );

  const totalReservations = reservations.length;
  const totalTickets = reservations.reduce(
    (acc, r) => acc + r._count.tickets,
    0
  );
  const totalRevenue = reservations.reduce(
    (acc, r) => acc + Number(r.totalAmount),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Vendas confirmadas (status PAGO) agrupadas pelo período escolhido.
        </p>
      </div>

      <form className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tipo
          </label>
          <Select name="group" defaultValue={group}>
            <SelectTrigger className="w-full mt-1">
              <SelectValue
                labels={{
                  day: "Vendas por Dia",
                  week: "Vendas por Semana",
                  month: "Vendas por Mês",
                }}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Vendas por Dia</SelectItem>
              <SelectItem value="week">Vendas por Semana</SelectItem>
              <SelectItem value="month">Vendas por Mês</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sorteio
          </label>
          <Select name="raffleId" defaultValue={raffleId ?? "all"}>
            <SelectTrigger className="w-full mt-1">
              <SelectValue
                labels={{
                  all: "Todos os sorteios",
                  ...Object.fromEntries(
                    raffleOptions.map((r) => [r.id, r.title])
                  ),
                }}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os sorteios</SelectItem>
              {raffleOptions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            De
          </label>
          <Input
            type="date"
            name="from"
            defaultValue={from.toISOString().slice(0, 10)}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Até
          </label>
          <Input
            type="date"
            name="to"
            defaultValue={to.toISOString().slice(0, 10)}
            className="mt-1"
          />
        </div>
        <div className="md:col-span-4">
          <Button type="submit" className="w-full md:w-auto">
            Gerar Relatório
          </Button>
        </div>
      </form>

      {/* Totais agregados */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Reservas pagas
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {totalReservations.toLocaleString("pt-BR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Títulos vendidos
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {totalTickets.toLocaleString("pt-BR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Faturamento
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {formatBRL(totalRevenue)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela agrupada */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{GROUP_LABEL[group]}</TableHead>
              <TableHead className="text-right">Reservas</TableHead>
              <TableHead className="text-right">Títulos</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground py-10"
                >
                  Nenhuma venda no período selecionado.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(([bucket, data]) => (
                <TableRow key={bucket}>
                  <TableCell className="font-medium">
                    {formatBucketLabel(bucket, group)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {data.count.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {data.tickets.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatBRL(data.total)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
