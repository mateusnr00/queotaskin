import type { ReactNode } from "react";
import Link from "next/link";
import { TicketCheck, Trophy } from "lucide-react";

import { apenasComGanhador } from "@/lib/ganhadores";
import { boostAtivoAgora } from "@/server/services/caixa-de-level-up";
import { auth } from "@/auth";
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
import { numeroDoTitulo } from "@/lib/titulo";
import {
  NA_VITRINE,
  ORDEM_DA_VITRINE,
  seloDoSorteio,
  separarPrincipal,
} from "@/lib/vitrine";
import { notFound } from "next/navigation";
import { ContainerPublico } from "@/components/public/container";

// Até nove campanhas ativas na home: uma principal e oito na grade. É um TETO,
// não uma meta: se houver menos, mostra só o que existe (não preenche à força).
//
// Nove também fecha a grade de duas colunas: as oito de baixo formam quatro
// linhas cheias, sem cartão sozinho na última.
//
// As campanhas que não couberem continuam na página /sorteios, que existe para
// isso e não tem teto.
const MAX_RAFFLES = 9;
// Quatro cartões, somando as duas origens.
//
// Eram seis de CADA, ou seja, até doze na página, e doze cartões de ganhador
// no fim da home é mais rolagem do que informação: quem chega quer ver que
// alguém ganhou, não auditar o histórico. Quatro provam o ponto.
//
// Cada consulta ainda busca quatro, porque a mistura das duas listas acontece
// depois: buscar dois de cada deixaria de fora o caso em que os quatro mais
// recentes vieram todos da mesma origem.
const MAX_WINNERS = 4;

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
      seloInicialTexto: true,
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

  // O boost ativo, para o selo do celular no cartão principal. A leitura é
  // memorizada por requisição, então o cabeçalho e esta página consultam uma
  // vez só. Falhar aqui não pode derrubar a home.
  const sessao = await auth().catch(() => null);
  const boostAtivo = sessao?.user?.id
    ? await boostAtivoAgora(sessao.user.id, tenant.id).catch(() => null)
    : null;

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
              totalNumbers: true,
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
              totalNumbers: true,
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
      r.isFree,
      r.seloInicialTexto,
    );

  // A coluna de ganhadores só existe quando há ganhador. Antes o grid de duas
  // colunas era montado só pelo toggle do admin: sem nenhum sorteio realizado,
  // a segunda coluna vinha vazia e empurrava todo o conteúdo pra esquerda,
  // deixando um vão do tamanho dela à direita.
  // As duas origens viram uma lista só, mais recente primeiro, cortada em
  // MAX_WINNERS. Antes elas eram desenhadas em sequência, sorteios e depois
  // premiados, e o resultado era uma página com o dobro dos cartões e uma
  // ordem que não era cronológica nem nada.
  const candidatos = [
    ...sorteados.map((d) => ({
      chave: `sorteio-${d.id}`,
      drawDate: d.drawExecutedAt,
      raffleTitle: d.raffle.title,
      raffleSlug: d.raffle.slug,
      coverUrl: d.raffle.images[0]?.url ?? null,
      prizeDescription: d.raffle.prizes[0]?.description ?? d.raffle.title,
      number: d.winningNumber!,
      totalNumbers: d.raffle.totalNumbers,
      // O nome congelado no sorteio manda: foi gravado no instante do
      // resultado e não muda se a conta for renomeada depois.
      winnerName:
        d.winnerName ??
        winnerByKey.get(`${d.raffle.id}:${d.winningNumber}`)?.name ??
        null,
      winnerPhone:
        winnerByKey.get(`${d.raffle.id}:${d.winningNumber}`)?.phone ?? null,
      selo: "Sorteio da campanha",
      href: `/sorteio/${d.publicId}`,
    })),
    ...awarded.map((a) => ({
      chave: `premiado-${a.id}`,
      drawDate: a.raffle.drawDate,
      raffleTitle: a.raffle.title,
      raffleSlug: a.raffle.slug,
      coverUrl: a.raffle.images[0]?.url ?? null,
      prizeDescription: a.prizeDescription,
      number: a.number,
      totalNumbers: a.raffle.totalNumbers,
      // NÚMERO PREMIADO SEM DONO NÃO É GANHADOR.
      //
      // Aqui havia `?? "Ganhador"`. Título premiado é configuração: o admin
      // escolhe quais números pagam prêmio ANTES de vender, e enquanto
      // ninguém compra aquele número não existe ganhador nenhum. O literal
      // enchia a home com cartões de "Ganhador" sem telefone e sem premiação,
      // anunciando prêmio que ninguém levou. Num site de sorteio isso não é
      // cartão feio, é informação falsa. A página da campanha sempre tratou
      // certo, mostrando o número como disponível; era só a home.
      winnerName: winnerByKey.get(`${a.raffleId}:${a.number}`)?.name ?? null,
      winnerPhone: winnerByKey.get(`${a.raffleId}:${a.number}`)?.phone ?? null,
      selo: "Título premiado",
      href: undefined as string | undefined,
    })),
  ];

  // A regra de quem entra mora em lib/ganhadores, com teste: "número premiado
  // sem dono não é ganhador" é o tipo de coisa que volta sozinha quando fica
  // solta no meio de uma página.
  const ganhadores = apenasComGanhador(candidatos, MAX_WINNERS);

  const temGanhador = ganhadores.length > 0;
  const mostrarGanhadores = showWinners && temGanhador;

  // Campanhas em cima, ganhadores embaixo. Os ganhadores eram uma coluna à
  // direita, e ali cabiam três cartões estreitos antes de a coluna acabar.
  // Embaixo e na largura toda, a lista respira e o resultado do sorteio, que é
  // o que a pessoa vem conferir depois, tem o tamanho que merece.
  return (
    <ContainerPublico>
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
                boostAtivo={boostAtivo}
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
              icone={<Trophy className="h-4 w-4 text-amber-500 dark:text-amber-400" />}
              title="Ganhadores"
              caption="quem já levou pra casa"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {ganhadores.map(({ chave, ...cartao }) => (
                <WinnerCard key={chave} {...cartao} />
              ))}
            </div>
          </section>
        )}
    </ContainerPublico>
  );
}

function SectionHeader({
  icone,
  title,
  caption,
}: {
  icone?: ReactNode;
  title?: string;
  caption?: string;
}) {
  if (!title && !caption) return null;
  return (
    <div className="flex items-center gap-2 px-1 flex-wrap">
      {/* O troféu fica à esquerda do título (ex.: "Ganhadores"). */}
      {icone}
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
  totalNumbers,
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
  /** O tamanho da campanha decide quantas casas o título tem. */
  totalNumbers: number;
  drawDate: Date | null;
  winnerName: string;
  winnerPhone: string | null;
  /** De onde veio o prêmio: sorteio da campanha ou título premiado. */
  selo?: string;
  /** Para onde o cartão leva. Sem isto, leva para a campanha. */
  href?: string;
}) {
  return (
    // O CARTÃO INTEIRO é o link, e não só o título.
    //
    // Antes só o nome da campanha levava para algum lugar: uma linha de texto
    // pequena, com line-clamp de uma linha, no meio do cartão. No celular isso
    // é um alvo de uns dez pixels de altura, cercado de texto que parece
    // clicável e não é. Acertar dava trabalho, e errar não fazia nada.
    //
    // Agora o alvo é o cartão todo. Nada aqui dentro é interativo, então não
    // há link dentro de link: o título virou texto comum.
    <Link
      href={href ?? `/${raffleSlug}`}
      className="block rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 active:bg-muted/60"
    >
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
          <div className="text-muted-foreground line-clamp-1">{raffleTitle}</div>
          <div className="text-muted-foreground">
            Prêmio: <span className="text-foreground">{prizeDescription}</span>
          </div>
          <div className="text-muted-foreground">
            Número da sorte:{" "}
            <strong className="text-foreground tabular-nums">
              {numeroDoTitulo(number, totalNumbers)}
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
    </Link>
  );
}
