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
import { cn } from "@/lib/utils";
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

  // O CUSTO DAS SKINS, no mesmo intervalo.
  //
  // O gasto é lançado na data em que a skin SAIU. Quando não há data de envio,
  // que é o caso de prêmio pago em Pix, cai na data do sorteio: o dinheiro saiu
  // por causa daquela campanha, e deixá-lo fora do relatório mostraria lucro
  // que não existe.
  const custoWhere: Prisma.RaffleWhereInput = {
    tenantId,
    deliveryCost: { not: null },
    ...(raffleId && { id: raffleId }),
    OR: [
      { deliveredAt: { gte: from, lte: to } },
      { deliveredAt: null, winnerDrawnAt: { gte: from, lte: to } },
    ],
  };

  const [reservations, raffleOptions, entregas, tenant] = await Promise.all([
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
    prisma.raffle.findMany({
      where: custoWhere,
      select: {
        deliveryCost: true,
        deliveredAt: true,
        winnerDrawnAt: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cnyToBrl: true },
    }),
  ]);

  // O custo é gravado em YUAN. Sem a taxa cadastrada não há como somar com o
  // faturamento, que é em real, e a tela diz isso em vez de misturar moedas.
  const cnyToBrl = tenant?.cnyToBrl != null ? Number(tenant.cnyToBrl) : null;
  const temTaxa = cnyToBrl != null && cnyToBrl > 0;

  // Agrega in-memory pelo bucket escolhido.
  // Para escalar (centenas de milhares de reservas), trocar pra query SQL
  // com date_trunc, Prisma raw query. Por enquanto JS é suficiente.
  const bucketKeyFn =
    group === "day" ? isoDay : group === "week" ? isoWeek : isoMonth;

  const buckets = new Map<
    string,
    { count: number; tickets: number; total: number; custo: number }
  >();
  const vazio = () => ({ count: 0, tickets: 0, total: 0, custo: 0 });

  for (const r of reservations) {
    if (!r.paidAt) continue;
    const key = bucketKeyFn(r.paidAt);
    const entry = buckets.get(key) ?? vazio();
    entry.count += 1;
    entry.tickets += r._count.tickets;
    entry.total += Number(r.totalAmount);
    buckets.set(key, entry);
  }

  // O custo entra nos mesmos baldes do faturamento, para a linha do período
  // mostrar as duas pontas lado a lado.
  let custoEmYuan = 0;
  for (const e of entregas) {
    const quando = e.deliveredAt ?? e.winnerDrawnAt;
    if (!quando) continue;
    const emYuan = Number(e.deliveryCost);
    custoEmYuan += emYuan;
    if (!temTaxa) continue;
    const key = bucketKeyFn(quando);
    const entry = buckets.get(key) ?? vazio();
    entry.custo += emYuan * cnyToBrl!;
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
  const totalCusto = temTaxa ? custoEmYuan * cnyToBrl! : null;
  const resultado = totalCusto == null ? null : totalRevenue - totalCusto;
  // Margem sobre o faturamento. Sem faturamento não há percentual: dividir por
  // zero daria Infinity na tela.
  const margem =
    resultado == null || totalRevenue === 0
      ? null
      : (resultado / totalRevenue) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Vendas confirmadas (status PAGO) e o custo das skins entregues, no
          período escolhido.
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

      {!temTaxa && custoEmYuan > 0 && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Há {custoEmYuan.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{" "}
          yuan de custo no período, mas a taxa de câmbio não está cadastrada,
          então ele não entra no resultado. Cadastre em Entregas, no botão
          Taxas.
        </p>
      )}

      {/* Totais agregados */}
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
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
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Custo das skins
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {totalCusto == null ? "-" : formatBRL(totalCusto)}
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              ¥{" "}
              {custoEmYuan.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Resultado
            </div>
            <div
              className={cn(
                "mt-1 text-2xl font-bold tabular-nums",
                resultado != null &&
                  (resultado >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"),
              )}
            >
              {resultado == null ? "-" : formatBRL(resultado)}
            </div>
            {margem != null && (
              <div className="text-[11px] text-muted-foreground tabular-nums">
                margem de {margem.toFixed(1).replace(".", ",")}%
              </div>
            )}
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
              <TableHead className="text-right">Custo das skins</TableHead>
              <TableHead className="text-right">Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-10"
                >
                  Nenhum lançamento no período selecionado.
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
                  <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                    {data.custo > 0 ? formatBRL(data.custo) : "-"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold tabular-nums",
                      data.total - data.custo >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {formatBRL(data.total - data.custo)}
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
