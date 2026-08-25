import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, LogIn, TicketCheck, UserPlus } from "lucide-react";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { expireForRaffle } from "@/server/services/reservations";
import { ReservationForm } from "@/components/public/reservation-form";
import type { RequiredFields } from "@/components/public/reservation-form";
import { SocialShare } from "@/components/public/social-share";
import { PrizesSection } from "@/components/public/prizes-section";
import { toSkinPrize } from "@/lib/prize-mapper";
import { SkinHero } from "@/components/cs2/skin-hero";
import { headlineSkin } from "@/lib/cs2";
import { MinLevelGate } from "@/components/rank/min-level-gate";
import { meetsMinLevel } from "@/lib/rank";
import { getUserXp } from "@/server/services/xp";
import {
  AwardedTicketsSection,
  type PublicAwardedTicket,
} from "@/components/public/awarded-tickets-section";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import { raffleUrl } from "@/lib/raffle-url";
import { getCurrentTenant } from "@/lib/tenant";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) return { title: "Sorteio" };
  const raffle = await prisma.raffle.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug } },
    select: { title: true, shortDescription: true },
  });
  return {
    title: raffle?.title ?? "Sorteio",
    description: raffle?.shortDescription ?? undefined,
  };
}

// Defaults pra rifas que não têm JSON salvo (criadas antes do toggle):
// tudo OFF. Identidade vem da conta logada, e nenhum campo extra é pedido
// até o admin marcar explicitamente.
const DEFAULT_REQUIRED: RequiredFields = {
  name: false,
  phone: false,
  cpf: false,
  email: false,
  socialName: false,
  birthDate: false,
};

export default async function PublicRaffleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const [raffle, session] = await Promise.all([
    prisma.raffle.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug } },
      include: {
        images: { orderBy: { order: "asc" } },
        prizes: { orderBy: { position: "asc" } },
        awardedTickets: { orderBy: { number: "asc" } },
      },
    }),
    auth(),
  ]);
  if (!raffle) notFound();
  if (raffle.privacy === "PRIVATE") notFound();

  // Limpa reservas dessa rifa que já passaram do expiresAt antes de
  // contar tickets vendidos / takenNumbers. Sem isso, números cuja
  // reserva expirou ficariam "presos" até alguém disparar nova reserva
  // ou o cron rodar — efeito que o usuário vê como "demora pra voltar".
  // Custo: 1 query indexada que retorna imediatamente se não tem nada
  // pra expirar.
  await expireForRaffle(raffle.id);

  const currentUser = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          cpf: true,
          phone: true,
          email: true,
        },
      })
    : null;

  const soldCount = await prisma.ticket.count({
    where: { raffleId: raffle.id },
  });

  const takenNumbers =
    raffle.totalNumbers <= 500
      ? (
          await prisma.ticket.findMany({
            where: { raffleId: raffle.id },
            select: { number: true },
          })
        ).map((t) => t.number)
      : [];

  const isActive = raffle.status === "ACTIVE";
  const soldPercent = Math.round((soldCount / raffle.totalNumbers) * 100);
  const remaining = raffle.totalNumbers - soldCount;
  const shareUrl = await raffleUrl(raffle.slug);

  // Ganhador do sorteio principal: se o admin registrou, busca o dono
  // do título pra exibir no card. Não bloqueia — se ninguém comprou esse
  // número (edge case), mostra só o número.
  let winnerParticipant: string | null = null;
  if (raffle.winnerTicketNumber != null) {
    const winnerTicket = await prisma.ticket.findFirst({
      where: {
        raffleId: raffle.id,
        number: raffle.winnerTicketNumber,
        status: { in: ["PAID", "AWARDED"] },
      },
      select: {
        reservation: { select: { participantName: true } },
      },
    });
    winnerParticipant =
      winnerTicket?.reservation?.participantName?.trim() || null;
  }

  // Backward-compat: lê requiredFields do JSON com defaults seguros.
  const rawRF = raffle.requiredFields as Partial<RequiredFields>;
  const requiredFields: RequiredFields = {
    name: rawRF.name ?? DEFAULT_REQUIRED.name,
    phone: rawRF.phone ?? DEFAULT_REQUIRED.phone,
    cpf: rawRF.cpf ?? DEFAULT_REQUIRED.cpf,
    email: rawRF.email ?? DEFAULT_REQUIRED.email,
    socialName: rawRF.socialName ?? DEFAULT_REQUIRED.socialName,
    birthDate: rawRF.birthDate ?? DEFAULT_REQUIRED.birthDate,
  };

  // Campanha exclusiva por nível: precisa do XP do visitante para saber se
  // libera o formulário. A decisão real é do servidor, em
  // createReservationAction — aqui é só apresentação.
  const rankSettings = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { xpPerBrl: true, rankEnabled: true },
  });
  const viewerXp =
    raffle.minLevel != null && session?.user?.id
      ? await getUserXp(session.user.id, tenant.id)
      : 0;
  const levelLocked =
    raffle.minLevel != null && !meetsMinLevel(viewerXp, raffle.minLevel);

  // Skin principal da campanha: a de maior raridade entre os prêmios. É ela
  // que abre a página e define a cor de destaque.
  const skinPrizes = raffle.prizes.map(toSkinPrize);
  const headlinePrize = headlineSkin(skinPrizes);

  // Pra cada título premiado, descobre se já foi comprado/contemplado e por
  // quem. Aparece como "VICTOR 🏆" no card; sem comprador = "Disponível".
  const showAwarded =
    raffle.awardedTicketsEnabled && raffle.awardedTicketsShowList;
  const awardedNumbers = raffle.awardedTickets.map((a) => a.number);
  const claimedTickets =
    showAwarded && awardedNumbers.length > 0
      ? await prisma.ticket.findMany({
          where: {
            raffleId: raffle.id,
            number: { in: awardedNumbers },
            status: { in: ["PAID", "AWARDED"] },
          },
          select: {
            number: true,
            reservation: { select: { participantName: true } },
          },
        })
      : [];
  const participantByNumber = new Map<number, string>();
  for (const t of claimedTickets) {
    if (t.reservation?.participantName) {
      participantByNumber.set(t.number, t.reservation.participantName);
    }
  }
  const publicAwardedTickets: PublicAwardedTicket[] = raffle.awardedTickets.map(
    (a) => ({
      number: a.number,
      prizeDescription: a.prizeDescription,
      participantName: participantByNumber.get(a.number) ?? null,
    })
  );
  const awardedViewMode: "list" | "modal" =
    raffle.awardedTicketsViewMode === "modal" ? "modal" : "list";

  return (
    // Mobile-first: container estreito, centralizado, mesmo no desktop.
    // O site público se comporta como um "app no celular" também no PC.
    <div className="mx-auto w-full max-w-md px-4 py-5 space-y-5">
      {raffle.images[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={raffle.images[0].url}
          alt={raffle.title}
          className="w-full rounded-xl object-cover aspect-[4/3] shadow-sm"
        />
      ) : (
        <div className="w-full rounded-xl bg-gradient-to-br from-muted to-muted/40 aspect-[4/3] flex items-center justify-center text-muted-foreground border">
          <TicketCheck className="h-16 w-16 opacity-20" />
        </div>
      )}

      <div className="space-y-2">
        <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
          {raffle.statusText ?? "Adquira já"}
        </span>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          {raffle.title}
        </h1>
        {raffle.shortDescription && (
          <p className="text-sm text-muted-foreground">
            {raffle.shortDescription}
          </p>
        )}
      </div>

      {/* Card de ganhador: só aparece quando o admin declarou o resultado. */}
      {raffle.winnerTicketNumber != null && (
        <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-amber-500/20 p-5 text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow">
            🏆 Sorteio realizado
          </div>
          <p className="text-3xl font-black tabular-nums text-amber-700 dark:text-amber-300">
            Título {raffle.winnerTicketNumber}
          </p>
          {winnerParticipant ? (
            <p className="text-base font-semibold">
              Ganhador:{" "}
              <span className="text-amber-800 dark:text-amber-200">
                {winnerParticipant}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Título não foi comprado — sem ganhador registrado.
            </p>
          )}
          {raffle.winnerDrawnAt && (
            <p className="text-[11px] text-muted-foreground">
              Sorteado em{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "long",
                timeZone: "America/Sao_Paulo",
              }).format(raffle.winnerDrawnAt)}
            </p>
          )}
          {raffle.winnerNote && (
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 px-3 py-2 text-left text-xs whitespace-pre-wrap text-amber-900 dark:text-amber-100">
              {raffle.winnerNote}
            </p>
          )}
        </div>
      )}

      {raffle.showProgressBar && (
        <SalesProgressBar
          percent={Math.min(100, Math.max(0, soldPercent))}
          soldCount={soldCount}
          remaining={remaining}
        />
      )}

      {/* Ficha da skin principal — o prêmio de maior raridade da campanha.
          Fica acima do preço de propósito: o jogador decide pela skin,
          não pelo valor da cota. */}
      {raffle.prizesShow && headlinePrize && (
        <SkinHero
          prize={headlinePrize}
          extraPrizes={raffle.prizes.length - 1}
        />
      )}

      {/* Card de preço — destaque visual com gradiente sutil. Rifas
          gratuitas mostram um texto custom centralizado (default
          "SORTEIO GRATUITO") em vez do valor + label "Por apenas". */}
      {raffle.isFree ? (
        <div className="rounded-xl border bg-gradient-to-br from-accent/40 to-accent/10 px-5 py-6 text-center">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase text-primary">
            {raffle.freeLabel || "SORTEIO GRATUITO"}
          </span>
        </div>
      ) : (
        <div className="rounded-xl border bg-gradient-to-br from-accent/40 to-accent/10 px-5 py-3.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Por apenas
          </span>
          <span className="text-2xl font-bold tracking-tight tabular-nums text-primary">
            {formatBRL(Number(raffle.pricePerNumber))}
          </span>
        </div>
      )}

      {raffle.showDrawDate && raffle.drawDate && (
        <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Sorteio em</span>
          <span className="font-semibold">
            {formatDateTime(raffle.drawDate)}
          </span>
        </div>
      )}

      {raffle.description &&
        (raffle.descriptionMode === "EXPANDED" ? (
          <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Descrição / Regulamento
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {raffle.description}
            </p>
          </div>
        ) : (
          <details className="rounded-xl border bg-card overflow-hidden group">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold hover:bg-muted/50">
              <span>Descrição / Regulamento</span>
              <span className="text-muted-foreground transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="border-t px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {raffle.description}
              </p>
            </div>
          </details>
        ))}

      {raffle.prizesShow && raffle.prizes.length > 0 && (
        <PrizesSection prizes={skinPrizes} />
      )}

      {showAwarded && publicAwardedTickets.length > 0 && (
        <AwardedTicketsSection
          tickets={publicAwardedTickets}
          totalNumbers={raffle.totalNumbers}
          viewMode={awardedViewMode}
        />
      )}

      {/* Form de reserva — exige conta cadastrada para garantir
          rastreabilidade do comprador (nome/CPF vêm da sessão). */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-base font-bold mb-3">Reservar números</h2>
        {!isActive ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Este sorteio não está mais disponível para venda.
          </p>
        ) : remaining <= 0 ? (
          // Sem esse ramo, o formulário aparecia normalmente e a reserva só
          // falhava no submit — com uma mensagem genérica de erro, que faz
          // parecer defeito e não campanha esgotada.
          <div className="py-8 text-center">
            <p className="text-sm font-semibold">Todos os números foram vendidos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O sorteio acontece na data marcada. Acompanhe o resultado aqui
              mesmo.
            </p>
          </div>
        ) : levelLocked ? (
          <MinLevelGate
            minLevel={raffle.minLevel!}
            xp={viewerXp}
            xpPerBrl={rankSettings?.xpPerBrl ?? 10}
            isLoggedIn={Boolean(currentUser)}
          />
        ) : currentUser ? (
          <ReservationForm
            raffleId={raffle.id}
            totalNumbers={raffle.totalNumbers}
            takenNumbers={takenNumbers}
            minPurchase={raffle.minPurchase}
            maxPurchase={raffle.maxPurchase ?? undefined}
            initialQuantity={raffle.initialQuantity ?? undefined}
            reservationModel={raffle.reservationModel}
            requiredFields={requiredFields}
            currentUser={currentUser}
            pricePerNumber={Number(raffle.pricePerNumber)}
            selectionCards={raffle.selectionCards ?? []}
            selectionCardsBestseller={raffle.selectionCardsBestseller ?? -1}
          />
        ) : (
          <LoginPrompt slug={raffle.slug} />
        )}
      </div>

      {raffle.showShareButtons && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Compartilhar
          </p>
          <SocialShare
            url={shareUrl}
            title={`Participe: ${raffle.title}`}
          />
        </div>
      )}
    </div>
  );
}

// Barra de progresso "fat" no estilo Sorteamos: bar grossa com porcentagem
// centralizada sobre o preenchimento, e contagens (vendidos/disponíveis)
// embaixo. Truque pra legibilidade da % em qualquer fundo:
// - texto branco sobre a parte preenchida (clipado)
// - texto colorido escuro sobre a parte vazia (clipado pelo lado oposto)
// Assim a label é sempre legível, vinda de fora pra dentro do preenchimento.
function SalesProgressBar({
  percent,
  soldCount,
  remaining,
}: {
  percent: number;
  soldCount: number;
  remaining: number;
}) {
  const pct = `${percent}%`;
  return (
    <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Progresso da venda
        </span>
      </div>

      <div
        className="relative h-9 w-full overflow-hidden rounded-full bg-muted ring-1 ring-border/60"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Vendido ${percent}%`}
      >
        {/* Preenchimento com gradiente animado */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary to-primary/80 transition-all duration-500"
          style={{ width: pct }}
        />
        {/* Label da % — duas camadas pra ficar legível tanto no preenchido
            quanto no vazio. A primeira é o texto base (escuro); a segunda
            fica clipada à largura preenchida e mostra texto claro. */}
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-foreground/70">
          {pct}
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-primary-foreground overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
          aria-hidden
        >
          {pct}
        </span>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>
          <strong className="text-foreground">
            {soldCount.toLocaleString("pt-BR")}
          </strong>{" "}
          vendidos
        </span>
        <span>
          <strong className="text-foreground">
            {remaining.toLocaleString("pt-BR")}
          </strong>{" "}
          disponíveis
        </span>
      </div>
    </div>
  );
}

// CTA exibida quando o visitante não está logado. Leva pra /registro ou
// /login preservando o slug da rifa pra voltar pra cá depois.
function LoginPrompt({ slug }: { slug: string }) {
  const back = `/s/${slug}`;
  const registerHref = `/registro?redirect=${encodeURIComponent(back)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(back)}`;
  return (
    <div className="space-y-4 py-2 text-center">
      <p className="text-sm text-muted-foreground">
        Para reservar números, crie sua conta com nome e CPF. É rápido, sem
        senha e sem e-mail.
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href={registerHref}
          className={buttonVariants({ className: "h-12 text-base font-semibold" })}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Criar conta para participar
        </Link>
        <Link
          href={loginHref}
          className={buttonVariants({ variant: "outline" })}
        >
          <LogIn className="mr-2 h-4 w-4" />
          Já tenho conta
        </Link>
      </div>
    </div>
  );
}
