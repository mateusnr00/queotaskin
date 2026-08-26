import Link from "next/link";
import { TicketCheck, Trophy } from "lucide-react";

import { prisma } from "@/lib/db";
import { statusDaCampanha } from "@/lib/campanha-status";
import { getConfiguracaoDeStatus } from "@/lib/campanha-status-server";
import type { SkinRarity } from "@prisma/client";

import { RaffleCover } from "@/components/public/raffle-cover";
import { formatBRL, formatDate } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

const MAX_RAFFLES = 12;
const MAX_WINNERS = 6;

// Home pública, layout inspirado no Sorteamos:
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

  // `select` em vez de `include`: a Raffle tem ~70 colunas e o card usa oito.
  // Puxar a linha inteira de sete campanhas era tráfego e parse à toa.
  const activeRaffles = await prisma.raffle.findMany({
    where: {
      status: "ACTIVE",
      privacy: "PUBLIC",
      tenantId: tenant.id,
    },
    take: MAX_RAFFLES,
    orderBy: [{ showOnHome: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      statusText: true,
      pricePerNumber: true,
      isFree: true,
      freeLabel: true,
      totalNumbers: true,
      showProgressBar: true,
      images: { where: { isCover: true }, take: 1, select: { url: true } },
      // A raridade do prêmio principal colore a capa quando não há arte.
      prizes: {
        orderBy: { position: "asc" },
        take: 1,
        select: { skinName: true, skinRarity: true },
      },
    },
  });

  // Quantos números já saíram de cada campanha, numa agregação só.
  const vendidos = await prisma.ticket.groupBy({
    by: ["raffleId"],
    where: {
      raffleId: { in: activeRaffles.map((r) => r.id) },
      status: { in: ["PAID", "AWARDED"] },
    },
    _count: { _all: true },
  });
  const vendidosPorRifa = new Map(vendidos.map((v) => [v.raffleId, v._count._all]));
  const statusConfig = await getConfiguracaoDeStatus();

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

  // A coluna de ganhadores só existe quando há ganhador. Antes o grid de duas
  // colunas era montado só pelo toggle do admin: sem nenhum sorteio realizado,
  // a segunda coluna vinha vazia e empurrava todo o conteúdo pra esquerda,
  // deixando um vão do tamanho dela à direita.
  const showWinnersColumn = showWinners && awarded.length > 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 md:py-10">
      <div
        className={
          showWinnersColumn
            ? "grid gap-8 lg:grid-cols-[1.6fr_1fr]"
            : "mx-auto max-w-4xl"
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
              <FeaturedRaffleCard
                raffle={featured}
                sold={vendidosPorRifa.get(featured.id) ?? 0}
                statusBadge={statusDaCampanha(
                  vendidosPorRifa.get(featured.id) ?? 0,
                  featured.totalNumbers,
                  featured.statusText,
                  statusConfig
                )}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {rest.map((r) => (
                    <CompactRaffleCard
                    key={r.id}
                    raffle={r}
                    sold={vendidosPorRifa.get(r.id) ?? 0}
                    statusBadge={statusDaCampanha(
                      vendidosPorRifa.get(r.id) ?? 0,
                      r.totalNumbers,
                      r.statusText,
                      statusConfig
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ============ Ganhadores (só renderiza se admin ligou o toggle) ============ */}
        {showWinnersColumn && (
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
  totalNumbers: number;
  showProgressBar: boolean;
  images: { url: string }[];
  prizes: { skinName: string | null; skinRarity: SkinRarity | null }[];
}

// Texto exibido no lugar do preço. Rifas gratuitas usam o freeLabel
// (default "Grátis" pra caber em listagens compactas), pagas mostram
// o valor formatado.
function priceLabel(raffle: RaffleCardData): string {
  if (raffle.isFree) return raffle.freeLabel || "Grátis";
  return formatBRL(Number(raffle.pricePerNumber));
}

// Barra fina de progresso da venda. Todos os sites de rifa mostram isso e
// funciona como prova social: 78% vendido diz "os outros estão comprando".
function SalesBar({ sold, total }: { sold: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (sold / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>
          <b className="font-semibold text-foreground">{pct.toFixed(0)}%</b> vendido
        </span>
        <span>{(total - sold).toLocaleString("pt-BR")} disponíveis</span>
      </div>
    </div>
  );
}

// Card grande de destaque, capa grande, título, preço e progresso.
function FeaturedRaffleCard({
  raffle,
  sold,
  statusBadge,
}: {
  raffle: RaffleCardData;
  sold: number;
  statusBadge: string;
}) {
  const prize = raffle.prizes[0];
  return (
    <Link
      href={`/s/${raffle.slug}`}
      className="group block overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative">
        <RaffleCover
          url={raffle.images[0]?.url ?? null}
          title={raffle.title}
          skinName={prize?.skinName}
          rarity={prize?.skinRarity}
          className="aspect-16/9 w-full sm:aspect-2/1"
          priority
        />
        <div className="absolute top-3 left-3">
          <StatusBadge text={statusBadge} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1">
          <h3 className="text-base leading-tight font-bold text-balance group-hover:text-primary">
            {raffle.title}
          </h3>
          {raffle.shortDescription && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {raffle.shortDescription}
            </p>
          )}
        </div>

        {raffle.showProgressBar && (
          <SalesBar sold={sold} total={raffle.totalNumbers} />
        )}

        <div className="flex items-end justify-between gap-3 border-t pt-3">
          <span>
            <span className="block text-[10px] tracking-wider text-muted-foreground uppercase">
              Por número
            </span>
            <span
              className={cn(
                "text-xl leading-none font-bold text-primary",
                raffle.isFree && "text-base tracking-wider uppercase",
              )}
            >
              {priceLabel(raffle)}
            </span>
          </span>
          <span className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
            Participar
          </span>
        </div>
      </div>
    </Link>
  );
}

// Card compacto, capa à esquerda, conteúdo à direita.
function CompactRaffleCard({
  raffle,
  sold,
  statusBadge,
}: {
  raffle: RaffleCardData;
  statusBadge: string;
  sold: number;
}) {
  const prize = raffle.prizes[0];
  return (
    <Link
      href={`/s/${raffle.slug}`}
      className="group flex gap-3 overflow-hidden rounded-xl border bg-card p-3 transition-colors hover:border-primary/40"
    >
      <RaffleCover
        url={raffle.images[0]?.url ?? null}
        title={raffle.title}
        skinName={prize?.skinName}
        rarity={prize?.skinRarity}
        variant="thumb"
        className="h-20 w-28 shrink-0 rounded-lg sm:h-24 sm:w-40"
        sizes="160px"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold group-hover:text-primary">
            {raffle.title}
          </h3>
          {raffle.showProgressBar && (
            <SalesBar sold={sold} total={raffle.totalNumbers} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "font-bold text-primary",
              raffle.isFree ? "text-xs tracking-wider uppercase" : "text-base",
            )}
          >
            {priceLabel(raffle)}
          </span>
          <StatusBadge text={statusBadge} />
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

