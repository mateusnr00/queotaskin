import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { TicketCheck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Meus títulos" };

// Página que lista todas as reservas do usuário logado, com status e
// (quando pago) os números reservados. Inspirada no padrão "Meus títulos"
// de plataformas concorrentes, cartão por reserva com capa da campanha.
//
// Reservas EXPIRADAS/CANCELADAS continuam aparecendo: o histórico é parte
// da experiência ("já tentei essa, não paguei a tempo"). Só PAGAS expõem
// os números, porque PENDING libera no checkout e EXPIRED tem 0 tickets.
export default async function MyTicketsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?redirect=/meus-titulos");
  }
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  // Filtra pelo tenant atual, o participante pode ter comprado em vários
  // tenants, mas "Meus títulos" no domínio do Mateus só lista os do Mateus.
  const reservations = await prisma.reservation.findMany({
    where: {
      userId: session.user.id,
      raffle: { tenantId: tenant.id },
    },
    orderBy: { createdAt: "desc" },
    include: {
      raffle: {
        select: {
          title: true,
          slug: true,
          images: { where: { isCover: true }, take: 1 },
        },
      },
      tickets: {
        select: { number: true },
        orderBy: { number: "asc" },
      },
    },
  });

  // Snapshot do "agora" no servidor, o React Compiler proíbe Date.now()
  // dentro do render dos componentes filhos.
  const now = new Date().getTime();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 md:py-10">
      <div className="flex items-baseline gap-2 px-1 mb-4">
        <h1 className="text-base font-bold tracking-tight">Meus títulos</h1>
        <span className="text-xs text-muted-foreground">
          {reservations.length === 0
            ? "Você ainda não tem reservas"
            : `${reservations.length} reserva${reservations.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {reservations.length === 0 ? (
        <div className="rounded-xl border bg-card py-12 text-center px-4">
          <TicketCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Quando você comprar números, eles aparecem aqui.
          </p>
          <Link
            href="/sorteios"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Ver campanhas
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((r) => (
            <ReservationCard key={r.id} reservation={r} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

type ReservationWithRaffle = Awaited<
  ReturnType<typeof prisma.reservation.findMany>
>[number] & {
  raffle: {
    title: string;
    slug: string;
    images: { url: string }[];
  };
  tickets: { number: number }[];
};

function ReservationCard({
  reservation,
  now,
}: {
  reservation: ReservationWithRaffle;
  now: number;
}) {
  const cover = reservation.raffle.images[0]?.url ?? null;
  const isPaid = reservation.status === "PAID";
  const isPending = reservation.status === "PENDING";
  // Pendente vira ativo só enquanto não expirou. Após expiresAt, mesmo que
  // o status ainda esteja PENDING (cron não rodou), tratamos como expirado
  // pra UI, a próxima visita à rifa libera os números.
  const stillPending = isPending && reservation.expiresAt.getTime() > now;
  const linkable = isPaid || stillPending;
  const href = linkable ? `/comprovante/${reservation.id}` : null;

  const card = (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md">
      <div className="flex gap-3 p-3">
        <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-lg overflow-hidden bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={reservation.raffle.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-primary/40">
              <TicketCheck className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">
            {formatDateTime(reservation.createdAt)}
          </div>
          <h3 className="font-semibold text-sm leading-snug line-clamp-2">
            {reservation.raffle.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <StatusBadge
              status={reservation.status}
              stillPending={stillPending}
            />
            <span className="text-muted-foreground">
              {reservation.tickets.length || "-"} título
              {reservation.tickets.length === 1 ? "" : "s"}
            </span>
            <span className="font-medium text-foreground">
              {formatBRL(Number(reservation.totalAmount))}
            </span>
          </div>
        </div>
      </div>

      {isPaid && reservation.tickets.length > 0 && (
        <div className="border-t bg-muted/30 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Seus números
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reservation.tickets.map((t) => (
              <span
                key={t.number}
                className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border bg-background px-1.5 font-mono text-xs font-semibold"
              >
                {t.number}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function StatusBadge({
  status,
  stillPending,
}: {
  status: ReservationWithRaffle["status"];
  stillPending: boolean;
}) {
  if (status === "PAID") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        Pago
      </span>
    );
  }
  if (status === "PENDING" && stillPending) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        Aguardando pagamento
      </span>
    );
  }
  // PENDING vencido cai no mesmo balde de EXPIRED.
  if (status === "EXPIRED" || status === "PENDING") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Expirado
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Cancelado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Reembolsado
    </span>
  );
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
