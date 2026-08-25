import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle, Search, X } from "lucide-react";
import type { Prisma, ReservationStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { cn } from "@/lib/utils";
import { MarkReservationPaidButton } from "@/components/admin/mark-reservation-paid-button";

export const metadata: Metadata = { title: "Reservas" };

const PAGE_SIZE = 20;

const STATUS_TABS: {
  value: "all" | ReservationStatus;
  label: string;
}[] = [
  { value: "all", label: "Todos" },
  { value: "PAID", label: "Pagos" },
  { value: "PENDING", label: "Reservado" },
  { value: "EXPIRED", label: "Expirados" },
  { value: "CANCELLED", label: "Cancelados" },
];

const STATUS_META: Record<
  ReservationStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PENDING: { label: "Reservado", variant: "secondary" },
  PAID: { label: "Pago", variant: "default" },
  EXPIRED: { label: "Expirado", variant: "destructive" },
  CANCELLED: { label: "Cancelado", variant: "destructive" },
  REFUNDED: { label: "Reembolsado", variant: "outline" },
};

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    title?: string;
    raffleId?: string;
    page?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;
  const status = (sp.status ?? "all") as "all" | ReservationStatus;
  const q = (sp.q ?? "").trim();
  const titleQ = (sp.title ?? "").trim();
  const raffleId = (sp.raffleId ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // Quando filtra por sorteio específico, carrega os dados do sorteio pra
  // mostrar no header. Bloqueia cross-tenant: se o raffleId não pertence
  // ao tenant ativo, ignora o filtro.
  const filteredRaffle = raffleId
    ? await prisma.raffle.findUnique({
        where: { id: raffleId },
        select: { id: true, title: true, slug: true, tenantId: true },
      })
    : null;
  const validRaffleId =
    filteredRaffle && filteredRaffle.tenantId === tenantId
      ? filteredRaffle.id
      : null;

  const digits = q.replace(/\D/g, "");
  const where: Prisma.ReservationWhereInput = {
    raffle: {
      tenantId,
      // raffleId exato tem prioridade sobre o filtro por título (parcial).
      ...(validRaffleId
        ? { id: validRaffleId }
        : titleQ
        ? { title: { contains: titleQ, mode: "insensitive" } }
        : {}),
    },
    ...(status !== "all" && { status }),
    ...(q && {
      OR: [
        { participantName: { contains: q, mode: "insensitive" } },
        ...(digits ? [{ participantCpf: { contains: digits } }] : []),
        ...(digits ? [{ participantPhone: { contains: digits } }] : []),
      ],
    }),
  };

  const [total, reservations] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        raffle: { select: { id: true, title: true, slug: true, pricePerNumber: true } },
        _count: { select: { tickets: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function tabHref(s: typeof status) {
    const p = new URLSearchParams();
    if (s !== "all") p.set("status", s);
    if (q) p.set("q", q);
    if (titleQ) p.set("title", titleQ);
    if (validRaffleId) p.set("raffleId", validRaffleId);
    return `?${p.toString()}`;
  }

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    if (titleQ) params.set("title", titleQ);
    if (validRaffleId) params.set("raffleId", validRaffleId);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  // URL pra limpar SÓ o filtro de sorteio (mantém demais filtros).
  function hrefWithoutRaffle() {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    if (titleQ) params.set("title", titleQ);
    return params.toString() ? `?${params.toString()}` : "/admin/reservas";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString("pt-BR")} reserva(s). Gerencie pagamentos e contato.
        </p>
      </div>

      {/* Chip de filtro por sorteio específico (quando vier da página do sorteio) */}
      {validRaffleId && filteredRaffle && (
        <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sorteio:
          </span>
          <span className="text-sm font-medium flex-1 min-w-0 truncate">
            {filteredRaffle.title}
          </span>
          <Link
            href={hrefWithoutRaffle()}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Limpar filtro
          </Link>
        </div>
      )}

      {/* Tabs de status */}
      <div className="flex flex-wrap gap-2 border-b">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <Link
              key={tab.value}
              href={tabHref(tab.value)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Busca */}
      <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, CPF ou telefone"
            className="pl-9"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="title"
            defaultValue={titleQ}
            placeholder="Buscar por título do sorteio"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {status !== "all" && (
            <input type="hidden" name="status" value={status} />
          )}
          {validRaffleId && (
            <input type="hidden" name="raffleId" value={validRaffleId} />
          )}
          <Button type="submit" className="flex-1">
            Buscar
          </Button>
          {(q || titleQ) && (
            <Link
              href={tabHref(status)}
              className={buttonVariants({ variant: "outline", size: "icon" })}
              aria-label="Limpar"
            >
              <X className="h-4 w-4" />
            </Link>
          )}
        </div>
      </form>

      {/* Lista */}
      <div className="space-y-3">
        {reservations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma reserva encontrada para os filtros atuais.
            </CardContent>
          </Card>
        ) : (
          reservations.map((r) => {
            const initial = r.participantName.charAt(0).toUpperCase();
            const meta = STATUS_META[r.status];
            const whatsappPhone = r.participantPhone?.replace(/\D/g, "") ?? "";
            const whatsappHref =
              whatsappPhone.length >= 10
                ? `https://wa.me/55${whatsappPhone}`
                : null;

            return (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                    {initial}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight">
                      {r.participantName}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                      {(r.participantCpf || r.participantPhone) && (
                        <div>
                          {[
                            r.participantCpf && formatCpf(r.participantCpf),
                            r.participantPhone && formatPhone(r.participantPhone),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      <div className="truncate">
                        <Link
                          href={`/admin/sorteios/${r.raffle.id}/editar`}
                          className="hover:underline"
                        >
                          {r.raffle.title}
                        </Link>
                      </div>
                      <div>{formatDateTime(r.createdAt)}</div>
                    </div>
                  </div>

                  <div className="text-right text-sm tabular-nums">
                    <div className="text-xs text-muted-foreground">
                      {r._count.tickets} ×{" "}
                      {formatBRL(Number(r.raffle.pricePerNumber))}
                    </div>
                    <div className="font-bold text-base">
                      {formatBRL(Number(r.totalAmount))}
                    </div>
                  </div>

                  <Badge variant={meta.variant}>{meta.label}</Badge>

                  <div className="flex flex-wrap gap-1 justify-end">
                    {(r.status === "PENDING" || r.status === "EXPIRED") && (
                      <MarkReservationPaidButton
                        reservationId={r.id}
                        participantName={r.participantName}
                      />
                    )}
                    {whatsappHref && (
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({
                          variant: "outline",
                          size: "icon",
                        })}
                        aria-label="Abrir WhatsApp"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4 text-[#25D366]" />
                      </a>
                    )}
                    <Link
                      href={`/comprovante/${r.id}`}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      Ver
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {page} de {totalPages} · {total} resultado(s)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                })}
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                })}
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
