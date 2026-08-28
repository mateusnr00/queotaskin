import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import type { Prisma, ReservationStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { RaffleComprasView } from "@/components/admin/raffle-compras-view";
import { raffleUrl } from "@/lib/raffle-url";
import {
  contarOcupados,
  contarVendidos,
} from "@/server/services/vendidos";

export const metadata: Metadata = { title: "Lista de Compras" };

const PAGE_SIZE = 5;

type TabKey = "all" | "paid" | "pending" | "expired" | "cancelled" | "affiliates";

export default async function ComprasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    ticket?: string;
    page?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const { id } = await params;
  const sp = await searchParams;
  const tab = (sp.tab ?? "all") as TabKey;
  const q = (sp.q ?? "").trim();
  const ticketQ = (sp.ticket ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const raffle = await prisma.raffle.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      surpriseBoxCombos: { orderBy: { threshold: "asc" } },
      surpriseBoxPrizes: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!raffle || raffle.tenantId !== tenantId) notFound();

  // Nome, raridade e em quais desgastes a skin existe: é o que a sugestão
  // do prêmio precisa. A ficha completa de centenas de skins, com foto,
  // float e valor, não tem por que atravessar a rede.
  // As caixas que já foram distribuídas, com quem levou e o que saiu. A
  // tabela existia com o cabeçalho pronto e o corpo fixo em "Sem Registros",
  // com um comentário dizendo que vinha depois: nunca veio, e por isso o
  // prêmio sorteado não aparecia em lugar nenhum como premiação.
  const caixasDistribuidas = await prisma.surpriseBox.findMany({
    where: { raffleId: id },
    orderBy: [{ openedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      openedAt: true,
      createdAt: true,
      prize: { select: { id: true, title: true, prize: true, skinRarity: true } },
      reservation: {
        select: {
          participantName: true,
          participantPhone: true,
          status: true,
          paidAt: true,
          // O país mora na conta, e não na reserva. Sem conta o link assume
          // Brasil, que é o padrão do cadastro.
          user: { select: { phoneCountry: true } },
        },
      },
    },
  });

  const catalogoDePremios = (
    await prisma.skinTemplate.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { name: true, skinRarity: true, skinWears: true },
    })
  ).map((sk) => ({
    name: sk.name,
    skinRarity: sk.skinRarity,
    desgastes: sk.skinWears,
  }));

  // Filtros aplicados na lista (não nos contadores das abas, abas mostram
  // o universo total da rifa, não respeitam search).
  const tabWhere: Prisma.ReservationWhereInput = (() => {
    if (tab === "paid") return { status: "PAID" };
    if (tab === "pending") return { status: "PENDING" };
    if (tab === "expired") return { status: "EXPIRED" };
    if (tab === "cancelled") return { status: "CANCELLED" };
    if (tab === "affiliates") return { affiliateId: { not: null } };
    return {};
  })();

  const digits = q.replace(/\D/g, "");
  const searchWhere: Prisma.ReservationWhereInput = q
    ? {
        OR: [
          { participantName: { contains: q, mode: "insensitive" } },
          ...(digits ? [{ participantCpf: { contains: digits } }] : []),
          ...(digits ? [{ participantPhone: { contains: digits } }] : []),
        ],
      }
    : {};
  const ticketWhere: Prisma.ReservationWhereInput = ticketQ
    ? { tickets: { some: { number: Number(ticketQ) || -1 } } }
    : {};

  const listWhere: Prisma.ReservationWhereInput = {
    raffleId: raffle.id,
    ...tabWhere,
    ...searchWhere,
    ...ticketWhere,
  };

  // Batch único pra montar header, abas, stats e lista.
  const [
    countAll,
    countPaid,
    countPending,
    countExpired,
    countCancelled,
    countAffiliates,
    paidAgg,
    pendingAgg,
    soldTickets,
    ocupados,
    totalRows,
    reservations,
  ] = await Promise.all([
    prisma.reservation.count({ where: { raffleId: raffle.id } }),
    prisma.reservation.count({
      where: { raffleId: raffle.id, status: "PAID" },
    }),
    prisma.reservation.count({
      where: { raffleId: raffle.id, status: "PENDING" },
    }),
    prisma.reservation.count({
      where: { raffleId: raffle.id, status: "EXPIRED" },
    }),
    prisma.reservation.count({
      where: { raffleId: raffle.id, status: "CANCELLED" },
    }),
    prisma.reservation.count({
      where: { raffleId: raffle.id, affiliateId: { not: null } },
    }),
    prisma.reservation.aggregate({
      where: { raffleId: raffle.id, status: "PAID" },
      _sum: { totalAmount: true },
    }),
    prisma.reservation.aggregate({
      where: { raffleId: raffle.id, status: "PENDING" },
      _sum: { totalAmount: true },
    }),
    // Vendidos para o percentual, ocupados para "Livres": um número em
    // reserva aberta não é venda, mas também não está livre.
    contarVendidos(raffle.id),
    contarOcupados(raffle.id),
    prisma.reservation.count({ where: listWhere }),
    prisma.reservation.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        _count: { select: { tickets: true } },
        tickets: {
          select: { number: true },
          orderBy: { number: "asc" },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const soldPercent =
    raffle.totalNumbers > 0
      ? Math.round((soldTickets / raffle.totalNumbers) * 10000) / 100
      : 0;
  const livres = Math.max(0, raffle.totalNumbers - ocupados);

  const status =
    raffle.status === "ACTIVE"
      ? "Ativo"
      : raffle.status === "FINISHED"
        ? "Concluído"
        : raffle.status === "CANCELLED"
          ? "Cancelado"
          : "Rascunho";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Lista de Compras
          </h1>
          <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/admin/sorteios" className="hover:text-foreground">
              Sorteios
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate">Sorteio: {raffle.id}</span>
          </nav>
        </div>
      </div>

      <RaffleComprasView
        raffle={{
          id: raffle.id,
          slug: raffle.slug,
          // Resolvida no servidor: a view é componente de cliente e não tem
          // como saber o host público sozinha.
          urlPublica: await raffleUrl(raffle.slug),
          title: raffle.title,
          shortDescription: raffle.shortDescription,
          status,
          isFree: raffle.isFree,
          pricePerNumber: Number(raffle.pricePerNumber),
          totalNumbers: raffle.totalNumbers,
          imageUrl: raffle.images[0]?.url ?? null,
          winnerTicketNumber: raffle.winnerTicketNumber,
          winnerDrawnAt: raffle.winnerDrawnAt?.toISOString() ?? null,
          winnerNote: raffle.winnerNote,
        }}
        stats={{
          soldTickets,
          livres,
          reservados: countPending,
          pagos: countPaid,
          paidTotal: Number(paidAgg._sum.totalAmount ?? 0),
          pendingTotal: Number(pendingAgg._sum.totalAmount ?? 0),
          soldPercent,
        }}
        counts={{
          all: countAll,
          paid: countPaid,
          pending: countPending,
          expired: countExpired,
          cancelled: countCancelled,
          affiliates: countAffiliates,
        }}
        reservations={reservations.map((r) => ({
          id: r.id,
          participantName: r.participantName,
          participantPhone: r.participantPhone,
          participantCpf: r.participantCpf,
          participantEmail: r.participantEmail,
          createdAt: r.createdAt.toISOString(),
          status: r.status as ReservationStatus,
          ticketsCount: r._count.tickets,
          ticketNumbers: r.tickets.map((t) => t.number),
          totalAmount: Number(r.totalAmount),
          unitPrice: Number(raffle.pricePerNumber),
        }))}
        filters={{ tab, q, ticket: ticketQ, page, pageSize: PAGE_SIZE }}
        totalRows={totalRows}
        totalPages={totalPages}
        surpriseBox={{
          catalogo: catalogoDePremios,
          caixas: caixasDistribuidas.map((c) => ({
            id: c.id,
            status: c.status,
            abertaEm: (c.openedAt ?? c.createdAt).toISOString(),
            premioId: c.prize?.id ?? null,
            premioTitulo: c.prize?.title ?? null,
            premio: c.prize?.prize ?? null,
            raridade: c.prize?.skinRarity ?? null,
            ganhador: c.reservation.participantName,
            telefone: c.reservation.participantPhone,
            paisDoTelefone: c.reservation.user?.phoneCountry ?? null,
            pagoEm: c.reservation.paidAt?.toISOString() ?? null,
          })),
          enabled: raffle.surpriseBoxEnabled,
          accumulative: raffle.surpriseBoxCombosAccumulative,
          abrirTodas: raffle.surpriseBoxAbrirTodas,
          exibirGanhadores: raffle.surpriseBoxExibirGanhadores,
          displayOrder: raffle.surpriseBoxDisplayOrder,
          combos: raffle.surpriseBoxCombos.map((c) => ({
            id: c.id,
            threshold: c.threshold,
            boxCount: c.boxCount,
            visible: c.visible,
            highlighted: c.highlighted,
          })),
          prizes: raffle.surpriseBoxPrizes.map((p) => ({
            id: p.id,
            title: p.title,
            prize: p.prize,
            mode: p.mode,
            odds: p.odds != null ? Number(p.odds) : null,
            locked: p.locked,
            claimed: p.claimedAt != null,
          })),
        }}
      />
    </div>
  );
}
