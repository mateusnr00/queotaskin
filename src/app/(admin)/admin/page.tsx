import Link from "next/link";
import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import {
  MessageCircle,
  ShoppingBag,
  Sparkles,
  TicketCheck,
  TrendingUp,
  Users,
  Activity,
  CalendarClock,
  Eye,
} from "lucide-react";

import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SalesChart,
  type SalesChartPoint,
} from "@/components/admin/sales-chart";
import { formatBRL } from "@/lib/format";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth-helpers";
import { resumoDeVisitas } from "@/server/services/visitas";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Início" };

const TZ = "America/Sao_Paulo";

// Limite inferior do "hoje" em Brasília, devolvido como Date em UTC pra usar
// na query. Como o Postgres armazena TIMESTAMP, comparamos no instante UTC.
function startOfTodayBrasilia(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  // 00:00 BRT = 03:00 UTC (sem DST no BR desde 2019)
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

// Bucketiza as reservas dos últimos 60 minutos em 12 fatias de 5 minutos.
// Retorna array no formato esperado pelo SalesChart.
function bucketize(
  reservations: { createdAt: Date; status: string }[],
  now: Date,
): SalesChartPoint[] {
  const points: SalesChartPoint[] = [];
  const labelFmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  for (let i = 11; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 5 * 60_000);
    const start = new Date(end.getTime() - 5 * 60_000);
    const bucket = reservations.filter(
      (r) => r.createdAt >= start && r.createdAt < end,
    );
    points.push({
      label: labelFmt.format(end),
      paid: bucket.filter((r) => r.status === "PAID").length,
      reserved: bucket.filter((r) => r.status === "PENDING").length,
      expired: bucket.filter((r) => r.status === "EXPIRED").length,
    });
  }
  return points;
}

/**
 * "12% a mais que ontem", ou nada quando ontem foi zero.
 *
 * Sem o caso do zero, o primeiro dia de vida do site mostraria um aumento
 * infinito, e dividir por zero na tela é pior que não dizer nada.
 */
function comparacaoComOntem(hoje: number, ontem: number): string | undefined {
  if (ontem === 0) return hoje > 0 ? "primeiro dia com movimento" : undefined;
  const variacao = Math.round(((hoje - ontem) / ontem) * 100);
  if (variacao === 0) return "igual a hoje";
  return variacao > 0
    ? `hoje está ${variacao}% acima`
    : `hoje está ${Math.abs(variacao)}% abaixo`;
}

export default async function AdminDashboardPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const firstName =
    session?.user?.name?.split(" ")[0] ?? session?.user?.name ?? "Admin";
  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60_000);
  const todayStart = startOfTodayBrasilia();

  const [
    paidAgg,
    activeRaffles,
    participantsTodayRows,
    participantesTotalRows,
    visitas,
    lastHourReservations,
    topBuyersRaw,
  ] = await Promise.all([
    prisma.reservation.aggregate({
      where: { status: "PAID", raffle: { tenantId } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.raffle.count({ where: { status: "ACTIVE", tenantId } }),
    // Distinct buyers (PAID) hoje, usa raw para distinct count.
    // Filtra pelo tenant via JOIN com Raffle.
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT r."participantCpf")::bigint AS count
      FROM "Reservation" r
      JOIN "Raffle" rf ON rf.id = r."raffleId"
      WHERE r."status" = 'PAID'
        AND r."createdAt" >= ${todayStart}
        AND r."participantCpf" IS NOT NULL
        AND rf."tenantId" = ${tenantId}
    `),
    // Participantes de todos os tempos, e não só de hoje: é o tamanho da
    // base, o número que se compara com as visitas para saber quantos dos
    // que entraram viraram comprador.
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT r."participantCpf")::bigint AS count
      FROM "Reservation" r
      JOIN "Raffle" rf ON rf.id = r."raffleId"
      WHERE r."status" = 'PAID'
        AND r."participantCpf" IS NOT NULL
        AND rf."tenantId" = ${tenantId}
    `),
    resumoDeVisitas(tenantId, now),
    prisma.reservation.findMany({
      where: {
        createdAt: { gte: lastHour },
        raffle: { tenantId },
      },
      select: { createdAt: true, status: true },
    }),
    // Top 5 por valor pago, agrupado por CPF (que é o identificador real
    // do comprador, mesmo quando a reserva ainda não tinha userId).
    prisma.reservation.groupBy({
      by: ["participantCpf"],
      where: {
        status: "PAID",
        participantCpf: { not: null },
        raffle: { tenantId },
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5,
    }),
  ]);

  const faturamento = Number(paidAgg._sum.totalAmount ?? 0);
  const compras = paidAgg._count._all;
  const ticketMedio = compras > 0 ? faturamento / compras : 0;
  const participantsToday = Number(participantsTodayRows[0]?.count ?? 0);
  const participantesTotal = Number(participantesTotalRows[0]?.count ?? 0);

  // Para cada CPF top, busca o último nome/telefone usado.
  const cpfs = topBuyersRaw
    .map((b) => b.participantCpf)
    .filter((c): c is string => Boolean(c));
  const buyerProfiles =
    cpfs.length === 0
      ? []
      : await prisma.reservation.findMany({
          where: {
            participantCpf: { in: cpfs },
            raffle: { tenantId },
          },
          orderBy: { createdAt: "desc" },
          select: {
            participantCpf: true,
            participantName: true,
            participantPhone: true,
          },
        });
  const profileByCpf = new Map<
    string,
    { name: string; phone: string | null }
  >();
  for (const p of buyerProfiles) {
    if (!p.participantCpf || profileByCpf.has(p.participantCpf)) continue;
    profileByCpf.set(p.participantCpf, {
      name: p.participantName,
      phone: p.participantPhone,
    });
  }
  const topBuyers = topBuyersRaw.map((b) => ({
    cpf: b.participantCpf!,
    total: Number(b._sum.totalAmount ?? 0),
    count: b._count._all,
    name: profileByCpf.get(b.participantCpf!)?.name ?? "Comprador",
    phone: profileByCpf.get(b.participantCpf!)?.phone ?? null,
  }));

  const chartData = bucketize(lastHourReservations, now);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Banner de boas-vindas. Fundo escuro com gradiente sutil + brilho
          radial atrás do texto pra garantir contraste do título mesmo em
          telas com brilho alto. Texto sempre claro, sem dependência da
          cor de tema do site. */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-950 p-6 md:p-8 text-zinc-50">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,var(--primary)_0%,transparent_55%)] opacity-40"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-primary/30 blur-3xl"
        />
        <div className="relative max-w-xl">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Bem-vindo de volta
          </p>
          <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-white">
            Olá, {firstName} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-300 max-w-md leading-relaxed">
            Visão geral da sua plataforma: vendas, reservas e clientes em tempo
            real.
          </p>
          <div className="mt-5 flex gap-2 flex-wrap">
            <Link
              href="/admin/sorteios/novo"
              className={buttonVariants({ size: "sm" })}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Novo sorteio
            </Link>
            <Link
              href="/admin/sorteios"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-[0.8rem] font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            >
              Ver sorteios
            </Link>
          </div>
        </div>
      </div>

      {/* Duas fileiras, e não uma só de sete. Em cima o dinheiro, embaixo o
          público: são perguntas diferentes, e sete cartões em fila viram uma
          régua onde o olho não sabe onde parar. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Faturamento Total"
          value={formatBRL(faturamento)}
          icon={TrendingUp}
          accent="from-orange-500/15 to-orange-500/0"
          iconBg="bg-orange-500/15 text-orange-600 dark:text-orange-300"
        />
        <KpiCard
          label="Compras"
          value={compras.toLocaleString("pt-BR")}
          icon={ShoppingBag}
          accent="from-emerald-500/15 to-emerald-500/0"
          iconBg="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
        />
        <KpiCard
          label="Ticket Médio"
          value={formatBRL(ticketMedio)}
          icon={TicketCheck}
          accent="from-blue-500/15 to-blue-500/0"
          iconBg="bg-blue-500/15 text-blue-600 dark:text-blue-300"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Visitas Hoje"
          value={visitas.hoje.toLocaleString("pt-BR")}
          subline={`${visitas.visitantesHoje.toLocaleString("pt-BR")} pessoa(s) diferente(s)`}
          icon={Eye}
          accent="from-sky-500/15 to-sky-500/0"
          iconBg="bg-sky-500/15 text-sky-600 dark:text-sky-300"
        />
        <KpiCard
          label="Visitas Ontem"
          value={visitas.ontem.toLocaleString("pt-BR")}
          subline={comparacaoComOntem(visitas.hoje, visitas.ontem)}
          icon={CalendarClock}
          accent="from-violet-500/15 to-violet-500/0"
          iconBg="bg-violet-500/15 text-violet-600 dark:text-violet-300"
        />
        <KpiCard
          label="Visitas Total"
          value={visitas.total.toLocaleString("pt-BR")}
          icon={Activity}
          accent="from-cyan-500/15 to-cyan-500/0"
          iconBg="bg-cyan-500/15 text-cyan-600 dark:text-cyan-300"
        />
        <KpiCard
          label="Participantes"
          value={participantesTotal.toLocaleString("pt-BR")}
          subline={`${participantsToday.toLocaleString("pt-BR")} hoje · ${activeRaffles} sorteio(s) ativo(s)`}
          icon={Users}
          accent="from-fuchsia-500/15 to-fuchsia-500/0"
          iconBg="bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300"
        />
      </div>

      {/* Chart + Top buyers */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Vendas na última hora</h2>
            <span className="text-xs text-muted-foreground">
              Atualiza ao recarregar
            </span>
          </div>
          <SalesChart data={chartData} />
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">Top 5 Compradores</h2>
            <span className="text-xs text-muted-foreground">
              por valor pago
            </span>
          </div>
          {topBuyers.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma venda paga ainda.
            </div>
          ) : (
            <ul className="space-y-3">
              {topBuyers.map((b) => {
                const phone = b.phone?.replace(/\D/g, "") ?? "";
                const wa =
                  phone.length >= 10 ? `https://wa.me/55${phone}` : null;
                const initial = b.name.charAt(0).toUpperCase();
                return (
                  <li key={b.cpf} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground">
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm leading-tight truncate">
                        {b.name}
                      </div>
                      <div className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
                        {formatCpf(b.cpf)}
                        {b.phone ? ` · ${formatPhone(b.phone)}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {b.count}x · {formatBRL(b.total)}
                      </div>
                    </div>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-[#25D366] hover:bg-[#25D366]/10"
                        aria-label="WhatsApp"
                      >
                        <MessageCircle className="h-5 w-5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subline,
  icon: Icon,
  accent,
  iconBg,
}: {
  label: string;
  value: string;
  subline?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  accent: string;
  iconBg: string;
}) {
  return (
    <Card
      className={cn("relative overflow-hidden p-5 bg-gradient-to-br", accent)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl md:text-3xl font-bold tracking-tight mt-1 tabular-nums truncate">
            {value}
          </div>
          {subline && (
            <div className="text-xs text-muted-foreground mt-1">{subline}</div>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl shrink-0",
            iconBg,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
