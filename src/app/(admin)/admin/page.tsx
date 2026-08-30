import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle, Sparkles, TrendingUp, Percent } from "lucide-react";

import { prisma } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SalesChart, type SalesChartPoint } from "@/components/admin/sales-chart";
import { StatDeHoje } from "@/components/admin/estatisticas/stat-de-hoje";
import { SeletorDePeriodo } from "@/components/admin/estatisticas/seletor-de-periodo";
import { GraficoDeVendas } from "@/components/admin/estatisticas/grafico-de-vendas";
import { Funil } from "@/components/admin/estatisticas/funil";
import { ListaPorCanal } from "@/components/admin/estatisticas/lista-por-canal";
import { Risco } from "@/components/admin/estatisticas/risco";
import { ProgressoCampanhas } from "@/components/admin/estatisticas/progresso-campanhas";
import { formatBRL } from "@/lib/format";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { requireAdmin } from "@/lib/auth-helpers";
import { resumoDeVisitas } from "@/server/services/visitas";
import {
  serieDeVendas,
  funilDeConversao,
  faturamentoPorCanal,
  reservasEmRisco,
  progressoDasCampanhas,
  totaisComparativo,
} from "@/server/services/estatisticas";
import { limitarIntervalo } from "@/lib/periodo";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Início" };

const TZ = "America/Sao_Paulo";
const PRESETS = [7, 30, 90, 180];

// Limite inferior do "hoje" em Brasília, como Date em UTC para a query.
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
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // 00:00 BRT = 03:00 UTC
}

// Bucketiza as reservas dos últimos 60 minutos em 12 fatias de 5 minutos.
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

function umValor(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// O período da seção de análise: intervalo custom (de/até, com teto de 180
// dias) tem prioridade; senão um preset em dias; senão 30 dias.
function resolverPeriodo(sp: Record<string, string | string[] | undefined>): {
  from: Date;
  to: Date;
  diasAtivo: number | null;
  de?: string;
  ate?: string;
  rotulo: string;
} {
  const now = new Date();
  const de = umValor(sp.de);
  const ate = umValor(sp.ate);
  if (de && ate) {
    const from0 = new Date(`${de}T00:00:00`);
    const to0 = new Date(`${ate}T23:59:59.999`);
    if (
      !Number.isNaN(from0.getTime()) &&
      !Number.isNaN(to0.getTime()) &&
      from0 <= to0
    ) {
      const { from, to } = limitarIntervalo(from0, to0);
      const fmt = new Intl.DateTimeFormat("pt-BR");
      return {
        from,
        to,
        diasAtivo: null,
        de,
        ate,
        rotulo: `${fmt.format(from)} a ${fmt.format(to)}`,
      };
    }
  }
  const diasRaw = Number(umValor(sp.dias));
  const dias = PRESETS.includes(diasRaw) ? diasRaw : 30;
  const from = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000);
  return { from, to: now, diasAtivo: dias, rotulo: `últimos ${dias} dias` };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const firstName =
    session?.user?.name?.split(" ")[0] ?? session?.user?.name ?? "Admin";
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp);

  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60_000);
  const hojeInicio = startOfTodayBrasilia();

  const [
    kpiHoje,
    visitas,
    serie,
    funil,
    canais,
    risco,
    campanhas,
    lastHourReservations,
    topBuyersRaw,
  ] = await Promise.all([
    totaisComparativo({ tenantId, from: hojeInicio, to: now }),
    resumoDeVisitas(tenantId, now),
    serieDeVendas({ tenantId, from: periodo.from, to: periodo.to }),
    funilDeConversao({ tenantId, from: periodo.from, to: periodo.to }),
    faturamentoPorCanal({ tenantId, from: periodo.from, to: periodo.to }),
    reservasEmRisco({ tenantId, now }),
    progressoDasCampanhas(tenantId),
    prisma.reservation.findMany({
      where: { createdAt: { gte: lastHour }, raffle: { tenantId } },
      select: { createdAt: true, status: true },
    }),
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

  const conversaoHoje =
    visitas.visitantesHoje > 0
      ? Math.round((kpiHoje.atual.reservas / visitas.visitantesHoje) * 100)
      : null;

  // Perfil (nome/telefone) dos top compradores, a partir do CPF.
  const cpfs = topBuyersRaw
    .map((b) => b.participantCpf)
    .filter((c): c is string => Boolean(c));
  const buyerProfiles =
    cpfs.length === 0
      ? []
      : await prisma.reservation.findMany({
          where: { participantCpf: { in: cpfs }, raffle: { tenantId } },
          orderBy: { createdAt: "desc" },
          select: {
            participantCpf: true,
            participantName: true,
            participantPhone: true,
          },
        });
  const profileByCpf = new Map<string, { name: string; phone: string | null }>();
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
    <div className="max-w-7xl space-y-6">
      {/* Banner de boas-vindas. */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-950 p-6 text-zinc-50 md:p-8">
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">
            Olá, {firstName} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-300">
            Visão geral da sua plataforma: vendas, reservas e clientes.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
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

      {/* KPIs de hoje, em tempo real, com delta vs a mesma janela de ontem. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatDeHoje
          label="Faturamento hoje"
          value={formatBRL(kpiHoje.atual.faturamento)}
          delta={kpiHoje.variacao.faturamento}
        />
        <StatDeHoje
          label="Reservas pagas hoje"
          value={kpiHoje.atual.reservas.toLocaleString("pt-BR")}
          delta={kpiHoje.variacao.reservas}
        />
        <StatDeHoje
          label="Ticket médio hoje"
          value={formatBRL(kpiHoje.atual.ticketMedio)}
          delta={kpiHoje.variacao.ticketMedio}
        />
        <StatDeHoje
          label="Conversão hoje"
          value={conversaoHoje != null ? `${conversaoHoje}%` : "—"}
          hint={`${kpiHoje.atual.reservas.toLocaleString("pt-BR")} de ${visitas.visitantesHoje.toLocaleString("pt-BR")} visitantes`}
        />
      </div>

      {/* Seção de análise: o período controla os três cards abaixo. */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Análise
          </h2>
          <p className="text-xs text-muted-foreground">{periodo.rotulo}</p>
        </div>
        <SeletorDePeriodo
          diasAtivo={periodo.diasAtivo}
          de={periodo.de}
          ate={periodo.ate}
        />
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Vendas no tempo</h3>
        <GraficoDeVendas pontos={serie.pontos} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Funil de conversão</h3>
          <Funil funil={funil} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Faturamento por canal</h3>
          <ListaPorCanal canais={canais} />
        </Card>
      </div>

      {/* Operação / agora: independe do período. */}
      <div className="border-t pt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Percent className="h-4 w-4 text-primary" />
          Operação · agora
        </h2>
        <p className="text-xs text-muted-foreground">Tempo real</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Reservas em risco</h3>
          <Risco risco={risco} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Campanhas ativas</h3>
          <ProgressoCampanhas campanhas={campanhas} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Vendas na última hora</h3>
            <span className="text-xs text-muted-foreground">
              Atualiza ao recarregar
            </span>
          </div>
          <SalesChart data={chartData} />
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-semibold">Top 5 compradores</h3>
            <span className="text-xs text-muted-foreground">por valor pago</span>
          </div>
          {topBuyers.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma venda paga ainda.
            </div>
          ) : (
            <ul className="space-y-3">
              {topBuyers.map((b) => {
                const phone = b.phone?.replace(/\D/g, "") ?? "";
                const wa = phone.length >= 10 ? `https://wa.me/55${phone}` : null;
                const initial = b.name.charAt(0).toUpperCase();
                return (
                  <li key={b.cpf} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground">
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">
                        {b.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                        {formatCpf(b.cpf)}
                        {b.phone ? ` · ${formatPhone(b.phone)}` : ""}
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
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
