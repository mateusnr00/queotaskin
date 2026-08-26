import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { expireForRaffle } from "@/server/services/reservations";
import { ReservationForm } from "@/components/public/reservation-form";
import type { RequiredFields } from "@/components/public/reservation-form";
import { SocialShare } from "@/components/public/social-share";
import { PrizesSection } from "@/components/public/prizes-section";
import { toSkinPrize } from "@/lib/prize-mapper";
import { SkinHero } from "@/components/cs2/skin-hero";
import { RaffleCover } from "@/components/public/raffle-cover";
import { SeloDeStatus } from "@/components/public/selo-de-status";
import { PROPORCAO_DA_SKIN, headlineSkin } from "@/lib/cs2";
import { MinLevelGate } from "@/components/rank/min-level-gate";
import { meetsMinLevel } from "@/lib/rank";
import { getUserXp } from "@/server/services/xp";
import {
  AwardedTicketsSection,
  type PublicAwardedTicket,
} from "@/components/public/awarded-tickets-section";
import { formatBRL, formatDateTime } from "@/lib/format";
import { raffleUrl } from "@/lib/raffle-url";
import { getCurrentTenant } from "@/lib/tenant";
import { getBrand } from "@/lib/brand";
import { statusDaCampanha } from "@/lib/campanha-status";
import { getConfiguracaoDeStatus } from "@/lib/campanha-status-server";

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
    select: {
      title: true,
      shortDescription: true,
      images: {
        where: { isCover: true },
        take: 1,
        select: { url: true },
      },
    },
  });
  if (!raffle) return { title: "Sorteio" };

  // A imagem da campanha é a melhor imagem que este link pode carregar: quem
  // recebe no WhatsApp vê a skin, não um retângulo cinza.
  //
  // A logo entra como reserva porque o Next SUBSTITUI o openGraph do layout
  // raiz em vez de mesclar, sem isto, campanha sem imagem perderia também a
  // imagem do site e o link voltaria a chegar sem nada.
  const marca = await getBrand();
  const imagem = raffle.images[0]?.url ?? marca.logoUrl ?? undefined;
  const descricao = raffle.shortDescription ?? undefined;

  return {
    title: raffle.title,
    description: descricao,
    openGraph: {
      type: "website",
      title: raffle.title,
      description: descricao,
      locale: "pt_BR",
      ...(imagem ? { images: [{ url: imagem, alt: raffle.title }] } : {}),
    },
    twitter: {
      card: imagem ? "summary_large_image" : "summary",
      title: raffle.title,
      description: descricao,
      ...(imagem ? { images: [imagem] } : {}),
    },
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
  // ou o cron rodar, efeito que o usuário vê como "demora pra voltar".
  // Custo: 1 query indexada que retorna imediatamente se não tem nada
  // pra expirar.
  await expireForRaffle(raffle.id);

  // Estas quatro não dependem uma da outra: em série, cada uma paga a
  // latência de rede até o banco. Em paralelo, paga-se uma vez só, o que
  // pesa quando a função e o Postgres estão em regiões diferentes.
  const [currentUser, soldCount, takenTickets, rankSettings] = await Promise.all([
    session?.user?.id
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            name: true,
            cpf: true,
            phone: true,
            email: true,
          },
        })
      : Promise.resolve(null),
    prisma.ticket.count({ where: { raffleId: raffle.id } }),
    // Só rifas pequenas listam os números tomados; nas grandes a grade não
    // é renderizada e puxar 10 mil linhas seria desperdício.
    raffle.totalNumbers <= 500
      ? prisma.ticket.findMany({
          where: { raffleId: raffle.id },
          select: { number: true },
        })
      : Promise.resolve([]),
    prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { xpPerBrl: true, rankEnabled: true },
    }),
  ]);

  const takenNumbers = takenTickets.map((t) => t.number);

  const isActive = raffle.status === "ACTIVE";
  const statusConfig = await getConfiguracaoDeStatus();
  const soldPercent = Math.round((soldCount / raffle.totalNumbers) * 100);
  const remaining = raffle.totalNumbers - soldCount;
  const shareUrl = await raffleUrl(raffle.slug);

  // Ganhador do sorteio principal: se o admin registrou, busca o dono
  // do título pra exibir no card. Não bloqueia, se ninguém comprou esse
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
  // createReservationAction, aqui é só apresentação.
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
    // Coluna única em qualquer largura: no desktop a página é a mesma do
    // celular, só com mais folga e a imagem maior. O que mudou foi a ORDEM.
    //
    // Antes, descrição, ficha da skin, prêmios e títulos premiados ficavam
    // entre o preço e o seletor de números, e era preciso rolar três telas
    // para achar o botão. Nas referências do mercado (Skins Lendárias, CS2
    // Pro, MM Skins) os cards de quantidade aparecem na primeira dobra, sem
    // exceção, é a decisão que a página existe para provocar.
    <div className="mx-auto w-full max-w-md px-4 py-5 md:max-w-2xl md:py-10">
      {/* ---------- imagem + título ---------- */}
      <div className="space-y-4 md:space-y-5">
        {/* No celular a arte fica a 8px de cada borda, com moldura
            arredondada em volta.
            
            O container da página dá 16px de recuo, então a imagem estende
            8px para cada lado (-mx-2) e o que sobra até a tela são os 8px
            pedidos. Escrever "8px" direto aqui daria 8px a partir do
            conteúdo, ou seja, 24px da tela. */}
        <RaffleCover
          url={raffle.images[0]?.url ?? null}
          title={raffle.title}
          skinName={headlinePrize?.skinName}
          rarity={headlinePrize?.skinRarity}
          ajuste="conter"
          // A proporção vem da constante do quadro, não de um número escrito
          // aqui: com 16/9 e recorte, a arte perdia a logo no topo e o nome
          // do desgaste embaixo, que é metade do que ela comunica.
          style={{ aspectRatio: PROPORCAO_DA_SKIN }}
          className="-mx-2 w-[calc(100%+1rem)] rounded-2xl border md:mx-0 md:w-full"
          // A largura no celular deixou de ser a tela inteira: 16px a menos.
          sizes="(min-width: 768px) 640px, calc(100vw - 16px)"
          priority
        />

        <div className="space-y-1.5">
          <SeloDeStatus
            texto={statusDaCampanha(soldCount, raffle.totalNumbers, statusConfig)}
          />
          <h1 className="text-xl font-bold leading-tight tracking-tight md:text-3xl">
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
                Título não foi comprado, sem ganhador registrado.
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
      </div>

      {/* ---------- caixa de compra ---------- */}
      {/* Fixa na coluna da direita no desktop; no celular é só o bloco
          seguinte, logo abaixo do título. */}
      <div className="mt-5 space-y-3 md:mt-6 md:space-y-4">
        {/* Preço antes da barra: é o que decide a compra, e a barra é
            contexto para essa decisão. Com a barra em cima, quem abre a
            página lê primeiro quanto já foi vendido e só depois descobre o
            valor, que é a informação que ele veio buscar. */}
        {raffle.isFree ? (
          <div className="rounded-xl border bg-gradient-to-br from-accent/40 to-accent/10 px-4 py-4 text-center">
            <span className="text-xl font-extrabold uppercase tracking-tight text-primary sm:text-2xl">
              {raffle.freeLabel || "SORTEIO GRATUITO"}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border bg-gradient-to-br from-accent/40 to-accent/10 px-4 py-2.5 md:px-5 md:py-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Por apenas
            </span>
            <span className="text-xl font-bold tabular-nums tracking-tight text-primary md:text-2xl">
              {formatBRL(Number(raffle.pricePerNumber))}
            </span>
          </div>
        )}

        {raffle.showProgressBar && (
          <SalesProgressBar
            percent={Math.min(100, Math.max(0, soldPercent))}
            soldCount={soldCount}
            remaining={remaining}
          />
        )}

        <div className="rounded-xl border bg-card p-4 md:rounded-2xl md:p-5">
  {!isActive ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Este sorteio não está mais disponível para venda.
            </p>
          ) : remaining <= 0 ? (
            // Sem esse ramo, o formulário aparecia normalmente e a reserva só
            // falhava no submit, com uma mensagem genérica de erro, que faz
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
          ) : (
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
          )}
        </div>
      </div>

      {/* ---------- conteúdo longo ---------- */}
      {/* Tudo que ajuda a decidir, mas não precisa vir antes do botão. */}
      <div className="mt-5 space-y-4 md:mt-8 md:space-y-5">
        {/* Ficha da skin principal: o prêmio de maior raridade da
            campanha. Opcional por campanha (Admin → Prêmios). */}
        {raffle.showSkinSpecs && headlinePrize && (
          <SkinHero
            prize={headlinePrize}
            extraPrizes={raffle.prizes.length - 1}
          />
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
    </div>
  );
}

// Barra de progresso enxuta.
//
// A versão anterior era um card à parte: rótulo "Progresso da venda", barra
// de 36px e as contagens embaixo, quatro linhas para dizer "37% vendido".
// Nas três referências do mercado a barra é uma faixa fina logo abaixo da
// imagem, com a porcentagem dentro dela. Encolher isso devolve espaço da
// primeira dobra para o que de fato converte: preço e seletor de números.
//
// A % continua legível sobre qualquer fundo pelo mesmo truque de duas
// camadas: o texto base aparece na parte vazia e a cópia clara é clipada à
// largura preenchida.
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
    <div className="space-y-1.5">
      <div
        className="relative h-6 w-full overflow-hidden rounded-full bg-muted ring-1 ring-border/60 md:h-7"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Vendido ${percent}%`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary to-primary/80 transition-all duration-500"
          style={{ width: pct }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-foreground/70">
          {pct}
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center overflow-hidden text-xs font-bold tabular-nums text-primary-foreground"
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
          aria-hidden
        >
          {pct}
        </span>
      </div>

      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
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
