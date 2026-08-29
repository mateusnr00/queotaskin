import Link from "next/link";
import { TicketCheck, Trophy } from "lucide-react";

import { prisma } from "@/lib/db";
import { statusDaCampanha } from "@/lib/campanha-status";
import { getConfiguracaoDeStatus } from "@/lib/campanha-status-server";
import { contarVendidosPorRifa } from "@/server/services/vendidos";

import {
  CompactRaffleCard,
  FeaturedRaffleCard,
} from "@/components/public/cards-de-campanha";
import { formatDate } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant";
import {
  NA_VITRINE,
  ORDEM_DA_VITRINE,
  seloDoSorteio,
  separarPrincipal,
} from "@/lib/vitrine";
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
    where: { ...NA_VITRINE, tenantId: tenant.id },
    take: MAX_RAFFLES,
    orderBy: ORDEM_DA_VITRINE,
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      pricePerNumber: true,
      isFree: true,
      freeLabel: true,
      minLevel: true,
      principal: true,
      totalNumbers: true,
      showProgressBar: true,
      images: { where: { isCover: true }, take: 1, select: { url: true } },
      // A raridade do prêmio principal colore a capa quando não há arte.
      prizes: {
        orderBy: { position: "asc" },
        take: 1,
        select: { skinName: true, skinRarity: true },
      },
      // O estado do sorteio, para o card dizer "Sorteio em breve" ou "ao vivo"
      // em vez do selo de venda, que fala de uma venda que já acabou.
      draw: { select: { status: true, publicId: true } },
    },
  });

  // Quantos números já saíram de cada campanha, numa agregação só.
  const vendidosPorRifa = await contarVendidosPorRifa(
    activeRaffles.map((r) => r.id)
  );
  const statusConfig = await getConfiguracaoDeStatus();

  // Os ganhadores do SORTEIO principal.
  //
  // Faltavam. A lista de ganhadores da home só mostrava título premiado, que é
  // o prêmio instantâneo, e o ganhador do sorteio, que é o prêmio da campanha
  // inteira, não aparecia em lugar nenhum da página principal. Era o que
  // estava combinado desde o começo do projeto e nunca tinha sido ligado.
  const sorteados = showWinners
    ? await prisma.draw.findMany({
        where: {
          status: "FINISHED",
          winningNumber: { not: null },
          raffle: { tenantId: tenant.id, privacy: "PUBLIC" },
        },
        take: MAX_WINNERS,
        orderBy: { drawExecutedAt: "desc" },
        select: {
          id: true,
          publicId: true,
          winningNumber: true,
          winnerName: true,
          drawExecutedAt: true,
          raffle: {
            select: {
              id: true,
              title: true,
              slug: true,
              images: { where: { isCover: true }, take: 1, select: { url: true } },
              prizes: {
                orderBy: { position: "asc" },
                take: 1,
                select: { description: true },
              },
            },
          },
        },
      })
    : [];

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
  const winnerKeys = [
    ...awarded.map((a) => ({ raffleId: a.raffleId, number: a.number })),
    ...sorteados.map((d) => ({
      raffleId: d.raffle.id,
      number: d.winningNumber!,
    })),
  ];
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

  // A principal é a marcada no painel, e não mais a primeira da ordenação.
  // Antes o card grande era quem calhasse de vir na frente, então mudar o
  // destaque exigia recriar a campanha para ela ficar mais nova que as outras.
  const { principal: featured, demais: rest } = separarPrincipal(activeRaffles);

  // O selo do sorteio manda quando existe: "Sorteio em breve" é o estado real
  // da transmissão, e o selo de venda falaria de uma venda que já terminou.
  const selo = (r: (typeof activeRaffles)[number]) =>
    seloDoSorteio(r.draw?.status) ??
    statusDaCampanha(
      vendidosPorRifa.get(r.id) ?? 0,
      r.totalNumbers,
      statusConfig,
    );

  // A coluna de ganhadores só existe quando há ganhador. Antes o grid de duas
  // colunas era montado só pelo toggle do admin: sem nenhum sorteio realizado,
  // a segunda coluna vinha vazia e empurrava todo o conteúdo pra esquerda,
  // deixando um vão do tamanho dela à direita.
  const temGanhador = awarded.length > 0 || sorteados.length > 0;
  const mostrarGanhadores = showWinners && temGanhador;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 md:py-10">
      {/* Campanhas em cima, ganhadores embaixo.
          Os ganhadores eram uma coluna à direita, e ali cabiam três cartões
          estreitos antes de a coluna acabar. Embaixo e na largura toda, a
          lista respira e o resultado do sorteio, que é o que a pessoa vem
          conferir depois, tem o tamanho que merece. */}
      <div className="mx-auto max-w-4xl">
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
                statusBadge={selo(featured)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {rest.map((r) => (
                  <CompactRaffleCard
                    key={r.id}
                    raffle={r}
                    sold={vendidosPorRifa.get(r.id) ?? 0}
                    statusBadge={selo(r)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ============ Ganhadores (só com o toggle do painel ligado) ============ */}
        {mostrarGanhadores && (
          <section className="mt-10 space-y-3">
            <SectionHeader
              title="Ganhadores"
              caption="quem já levou pra casa"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {/* O ganhador do sorteio vem primeiro: é o prêmio da campanha
                  inteira, e título premiado é prêmio instantâneo. */}
              {sorteados.map((d) => {
                const win = winnerByKey.get(
                  `${d.raffle.id}:${d.winningNumber}`,
                );
                return (
                  <WinnerCard
                    key={d.id}
                    raffleTitle={d.raffle.title}
                    raffleSlug={d.raffle.slug}
                    coverUrl={d.raffle.images[0]?.url ?? null}
                    prizeDescription={
                      d.raffle.prizes[0]?.description ?? d.raffle.title
                    }
                    number={d.winningNumber!}
                    drawDate={d.drawExecutedAt}
                    // O nome congelado no sorteio manda: ele foi gravado no
                    // instante do resultado e não muda se a conta for
                    // renomeada depois.
                    winnerName={d.winnerName ?? win?.name ?? "Ganhador"}
                    winnerPhone={win?.phone ?? null}
                    selo="Sorteio da campanha"
                    href={`/sorteio/${d.publicId}`}
                  />
                );
              })}

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
                    selo="Título premiado"
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
  selo,
  href,
}: {
  raffleTitle: string;
  raffleSlug: string;
  coverUrl: string | null;
  prizeDescription: string;
  number: number;
  drawDate: Date | null;
  winnerName: string;
  winnerPhone: string | null;
  /** De onde veio o prêmio: sorteio da campanha ou título premiado. */
  selo?: string;
  /** Para onde o cartão leva. Sem isto, leva para a campanha. */
  href?: string;
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
          {selo && (
            <div className="text-[10px] font-bold tracking-[0.1em] text-amber-600 uppercase dark:text-amber-400">
              {selo}
            </div>
          )}
          <div className="font-bold text-sm truncate">{winnerName}</div>
          <Link
            href={href ?? `/${raffleSlug}`}
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

