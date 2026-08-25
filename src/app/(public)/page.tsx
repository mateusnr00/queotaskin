import Link from "next/link";
import { TicketCheck, Trophy } from "lucide-react";

import { prisma } from "@/lib/db";
import { formatBRL, formatDate } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

const MAX_RAFFLES = 12;
const MAX_WINNERS = 6;

// Home pública — layout inspirado no Sorteamos:
// 2 colunas no desktop (Campanhas | Ganhadores). Mobile empilha.
// Primeira campanha aparece em formato hero/destacado; demais como cards
// compactos (imagem esquerda + conteúdo direita).
//
// Multi-tenant: mostra só os sorteios do tenant resolvido pelo host atual.
// Host desconhecido → 404.
export default async function HomePage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  // Lê as preferências da home do tenant atual: textos customizados e
  // toggle de ganhadores. Vazio = não renderizar o cabeçalho da seção.
  const tenantPrefs = await prisma.tenant
    .findUnique({
      where: { id: tenant.id },
      select: {
        homeCampaignsTitle: true,
        homeCampaignsCaption: true,
        showWinnersOnHome: true,
      },
    })
    .catch(() => null);

  const campaignsTitle = tenantPrefs?.homeCampaignsTitle?.trim() ?? "";
  const campaignsCaption = tenantPrefs?.homeCampaignsCaption?.trim() ?? "";
  const showHeader = Boolean(campaignsTitle || campaignsCaption);
  const showWinners = tenantPrefs?.showWinnersOnHome ?? false;

  const activeRaffles = await prisma.raffle.findMany({
    where: {
      status: "ACTIVE",
      privacy: "PUBLIC",
      tenantId: tenant.id,
    },
    take: MAX_RAFFLES,
    orderBy: [{ showOnHome: "desc" }, { createdAt: "desc" }],
    include: {
      images: { where: { isCover: true }, take: 1 },
    },
  });

  const awarded = showWinners
    ? await prisma.awardedTicket.findMany({
        where: { raffle: { tenantId: tenant.id } },
        take: MAX_WINNERS,
        orderBy: { id: "desc" },
        include: {
          raffle: {
            select: {
              title: true,
              slug: true,
              drawDate: true,
              images: { where: { isCover: true }, take: 1 },
            },
          },
        },
      })
    : [];

  // Pra cada awarded ticket, descobre o ticket pago correspondente e o
  // participante (name + phone). Faz uma só query agregada.
  const winnerKeys = awarded.map((a) => ({
    raffleId: a.raffleId,
    number: a.number,
  }));
  const winnerTickets = winnerKeys.length
    ? await prisma.ticket.findMany({
        where: { OR: winnerKeys },
        include: {
          reservation: {
            select: { participantName: true, participantPhone: true },
          },
        },
      })
    : [];
  const winnerByKey = new Map<string, { name: string; phone: string | null }>();
  for (const t of winnerTickets) {
    if (!t.reservation) continue;
    winnerByKey.set(`${t.raffleId}:${t.number}`, {
      name: t.reservation.participantName,
      phone: t.reservation.participantPhone,
    });
  }

  const [featured, ...rest] = activeRaffles;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 md:py-10">
      <div
        className={
          showWinners
            ? "grid gap-8 lg:grid-cols-[1.6fr_1fr]"
            : "max-w-3xl mx-auto"
        }
      >
        {/* ============ Campanhas ============ */}
        <section className="space-y-3">
          {showHeader && (
            <SectionHeader title={campaignsTitle} caption={campaignsCaption} />
          )}

          {!featured ? (
            <EmptyState
              icon={TicketCheck}
              message="Nenhuma campanha ativa no momento. Volte em breve!"
            />
          ) : (
            <>
              <FeaturedRaffleCard raffle={featured} />
              {rest.map((r) => (
                <CompactRaffleCard key={r.id} raffle={r} />
              ))}
            </>
          )}
        </section>

        {/* ============ Ganhadores (só renderiza se admin ligou o toggle) ============ */}
        {showWinners && awarded.length > 0 && (
          <section className="space-y-3">
            <SectionHeader title="Ganhadores" caption="sortudos" />
            <div className="space-y-3">
              {awarded.map((a) => {
                const win = winnerByKey.get(`${a.raffleId}:${a.number}`);
                return (
                  <WinnerCard
                    key={a.id}
                    raffleTitle={a.raffle.title}
                    raffleSlug={a.raffle.slug}
                    coverUrl={a.raffle.images[0]?.url ?? null}
                    prizeDescription={a.prizeDescription}
                    number={a.number}
                    drawDate={a.raffle.drawDate}
                    winnerName={win?.name ?? "Ganhador"}
                    winnerPhone={win?.phone ?? null}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  caption,
}: {
  title?: string;
  caption?: string;
}) {
  if (!title && !caption) return null;
  return (
    <div className="flex items-baseline gap-2 px-1 flex-wrap">
      {title && (
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
      )}
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  message: string;
}) {
  return (
    <div className="rounded-xl border bg-card py-12 text-center px-4">
      <Icon className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface RaffleCardData {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  statusText: string | null;
  pricePerNumber: unknown;
  isFree: boolean;
  freeLabel: string | null;
  images: { url: string }[];
}

// Texto exibido no lugar do preço. Rifas gratuitas usam o freeLabel
// (default "Grátis" pra caber em listagens compactas), pagas mostram
// o valor formatado.
function priceLabel(raffle: RaffleCardData): string {
  if (raffle.isFree) return raffle.freeLabel || "Grátis";
  return formatBRL(Number(raffle.pricePerNumber));
}

// Card grande de destaque — primeira campanha. Imagem grande no topo,
// título e descrição abaixo + badge de status.
function FeaturedRaffleCard({ raffle }: { raffle: RaffleCardData }) {
  const cover = raffle.images[0]?.url ?? null;
  return (
    <Link
      href={`/s/${raffle.slug}`}
      className="block rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt={raffle.title}
          className="w-full aspect-[4/3] object-cover"
        />
      ) : (
        <div className="w-full aspect-[4/3] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <TicketCheck className="h-16 w-16 text-primary/40" />
        </div>
      )}
      <div className="p-4 space-y-2">
        <h3 className="font-bold text-base leading-tight line-clamp-2">
          {raffle.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {raffle.shortDescription ?? "Participe e concorra!"}
        </p>
        <div className="flex items-center justify-between pt-1">
          <span
            className={cn(
              "text-sm font-medium",
              raffle.isFree ? "text-primary uppercase tracking-wider" : "tabular-nums"
            )}
          >
            {priceLabel(raffle)}
          </span>
          <StatusBadge text={raffle.statusText ?? "Adquira já!"} />
        </div>
      </div>
    </Link>
  );
}

// Card compacto — imagem à esquerda, conteúdo à direita.
function CompactRaffleCard({ raffle }: { raffle: RaffleCardData }) {
  const cover = raffle.images[0]?.url ?? null;
  return (
    <Link
      href={`/s/${raffle.slug}`}
      className="block rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex gap-3 p-3">
        <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-lg overflow-hidden bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={raffle.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-primary/40">
              <TicketCheck className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-sm leading-snug line-clamp-2">
              {raffle.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {raffle.shortDescription ?? "Participe e concorra!"}
            </p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span
              className={cn(
                "text-xs font-medium",
                raffle.isFree
                  ? "text-primary uppercase tracking-wider"
                  : "tabular-nums text-muted-foreground"
              )}
            >
              {priceLabel(raffle)}
            </span>
            <StatusBadge text={raffle.statusText ?? "Adquira já!"} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function StatusBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
      {text}
    </span>
  );
}

// Mascara telefone: (XX) ****-****
function maskPhone(phone: string | null): string {
  if (!phone) return "(--) ****-****";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return "(--) ****-****";
  return `(${digits.slice(0, 2)}) ****-****`;
}

function WinnerCard({
  raffleTitle,
  raffleSlug,
  coverUrl,
  prizeDescription,
  number,
  drawDate,
  winnerName,
  winnerPhone,
}: {
  raffleTitle: string;
  raffleSlug: string;
  coverUrl: string | null;
  prizeDescription: string;
  number: number;
  drawDate: Date | null;
  winnerName: string;
  winnerPhone: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex gap-3">
        <div className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-muted">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={raffleTitle}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-amber-500/40">
              <Trophy className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-xs space-y-0.5">
          <div className="font-bold text-sm truncate">{winnerName}</div>
          <Link
            href={`/s/${raffleSlug}`}
            className="block text-muted-foreground line-clamp-1 hover:text-foreground"
          >
            {raffleTitle}
          </Link>
          <div className="text-muted-foreground">
            Prêmio: <span className="text-foreground">{prizeDescription}</span>
          </div>
          <div className="text-muted-foreground">
            Número da sorte:{" "}
            <strong className="text-foreground tabular-nums">
              {String(number).padStart(4, "0")}
            </strong>
          </div>
          <div className="text-muted-foreground">
            Premiação:{" "}
            <strong className="text-foreground">{formatDate(drawDate)}</strong>
          </div>
          <div className="text-muted-foreground tabular-nums">
            Telefone {maskPhone(winnerPhone)}
          </div>
        </div>
      </div>
    </div>
  );
}

