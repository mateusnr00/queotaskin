import Link from "next/link";
import { CalendarClock, Plus, Ticket } from "lucide-react";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import { Moldura } from "@/components/ui/moldura";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ORDEM_DO_PAINEL } from "@/lib/vitrine";
import { buttonVariants } from "@/components/ui/button";
import { RaffleCard } from "@/components/admin/raffle-card";
import { RafflesFilters } from "@/components/admin/raffles-filters";
import { raffleUrl } from "@/lib/raffle-url";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { contarVendidosPorRifa } from "@/server/services/vendidos";

export const metadata: Metadata = { title: "Sorteios" };

const PAGE_SIZE = 10;

type ParsedStatus =
  | "DRAFT"
  | "QUEUED"
  | "ACTIVE"
  | "FINISHED"
  | "CANCELLED";
type ParsedPrivacy = "PUBLIC" | "PRIVATE";

export default async function AdminRafflesListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    privacy?: string;
    drawDate?: string;
    page?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status =
    sp.status && sp.status !== "all" ? (sp.status as ParsedStatus) : undefined;
  const privacy =
    sp.privacy && sp.privacy !== "all"
      ? (sp.privacy as ParsedPrivacy)
      : undefined;
  const drawDate = sp.drawDate?.trim() || undefined;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // Faixa de "este dia" em UTC pra filtro de data (a coluna é TIMESTAMP).
  let drawDateFilter: { gte: Date; lt: Date } | undefined;
  if (drawDate && /^\d{4}-\d{2}-\d{2}$/.test(drawDate)) {
    const start = new Date(`${drawDate}T03:00:00.000Z`); // 00:00 BRT
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    drawDateFilter = { gte: start, lt: end };
  }

  const where: Prisma.RaffleWhereInput = {
    tenantId,
    ...(q && { title: { contains: q, mode: "insensitive" } }),
    ...(status && { status }),
    ...(privacy && { privacy }),
    ...(drawDateFilter && { drawDate: drawDateFilter }),
  };

  const [total, raffles] = await Promise.all([
    prisma.raffle.count({ where }),
    prisma.raffle.findMany({
      where,
      orderBy: ORDEM_DO_PAINEL,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        showOnHome: true,
        principal: true,
        totalNumbers: true,
        drawDate: true,
        createdAt: true,
        images: {
          where: { isCover: true },
          take: 1,
          select: { url: true },
        },
      },
    }),
  ]);

  // Vendidos por rifa pra calcular % de compras. Contava só PAID e deixava
  // AWARDED de fora, então um título premiado sumia da conta no instante em
  // que era contemplado.
  const paidByRaffle = await contarVendidosPorRifa(raffles.map((r) => r.id));

  // Pré-resolve as URLs públicas em paralelo (raffleUrl agora é async pra
  // captar o host do tenant).
  const publicUrls = await Promise.all(raffles.map((r) => raffleUrl(r.slug)));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (privacy) params.set("privacy", privacy);
    if (drawDate) params.set("drawDate", drawDate);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <CabecalhoDeAdmin
        etiqueta="Campanhas"
        icone={<Ticket aria-hidden className="h-3 w-3" />}
        titulo="Sorteios"
        migalha={[{ rotulo: "Admin", href: "/admin" }, { rotulo: "Sorteios" }]}
        acoes={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/sorteios/cronograma"
              className={buttonVariants({ variant: "outline", className: "h-10" })}
            >
              <CalendarClock className="mr-1.5 h-4 w-4" />
              Cronograma
            </Link>
            <Link
              href="/admin/sorteios/novo"
              className={buttonVariants({ className: "h-10" })}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo sorteio
            </Link>
          </div>
        }
      />

      {/* Filtros */}
      <RafflesFilters />

      {/* Lista */}
      <div className="space-y-3">
        {raffles.length === 0 ? (
          <Moldura>
            <div className="px-4 py-14 text-center">
              <Ticket
                aria-hidden
                className="mx-auto h-8 w-8 text-muted-foreground/30"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-sm font-semibold">
                Nenhum sorteio com esses filtros.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Troque o filtro acima, ou comece uma campanha nova.
              </p>
              <Link
                href="/admin/sorteios/novo"
                className={buttonVariants({ className: "mt-4" })}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Criar primeiro sorteio
              </Link>
            </div>
          </Moldura>
        ) : (
          raffles.map((r, i) => (
            <RaffleCard
              key={r.id}
              publicUrl={publicUrls[i]}
              raffle={{
                id: r.id,
                title: r.title,
                slug: r.slug,
                coverUrl: r.images[0]?.url ?? null,
                status: r.status,
                drawDate: r.drawDate ? r.drawDate.toISOString() : null,
                createdAt: r.createdAt.toISOString(),
                showOnHome: r.showOnHome,
                principal: r.principal,
                totalNumbers: r.totalNumbers,
                soldTickets: paidByRaffle.get(r.id) ?? 0,
              }}
            />
          ))
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground tabular-nums">
            Página {page} de {totalPages} · {total}{" "}
            {total === 1 ? "sorteio" : "sorteios"}
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
