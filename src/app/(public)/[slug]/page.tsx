import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { expireForRaffle } from "@/server/services/reservations";
import { contarOcupados, contarVendidos } from "@/server/services/vendidos";
import { dobroAtivo } from "@/lib/promocao-em-dobro";
import { FaixaDeDobro } from "@/components/public/faixa-de-dobro";
import { ReservationForm } from "@/components/public/reservation-form";
import type { RequiredFields } from "@/components/public/reservation-form";
import { SocialShare } from "@/components/public/social-share";
import { PrizesSection } from "@/components/public/prizes-section";
import { toSkinPrize } from "@/lib/prize-mapper";
import { SkinHero } from "@/components/cs2/skin-hero";
import { RaffleCover } from "@/components/public/raffle-cover";
import { SeloDeStatus } from "@/components/public/selo-de-status";
import { numeroDoTitulo, ordemEmbaralhada } from "@/lib/titulo";
import { SeloDeCompromisso } from "@/components/sorteio/selo-de-compromisso";
import { SeloDeTransmissao } from "@/components/sorteio/selo-de-transmissao";
import { PROPORCAO_DA_SKIN, headlineSkin } from "@/lib/cs2";
import { MinLevelGate } from "@/components/rank/min-level-gate";
import { SeloDeLiberado } from "@/components/rank/selo-de-liberado";
import { meetsMinLevel, rankFromXp } from "@/lib/rank";
import { getUserXp } from "@/server/services/xp";
import {
  AwardedTicketsSection,
  type PublicAwardedTicket,
} from "@/components/public/awarded-tickets-section";
import { SurpriseBoxesCombos } from "@/components/public/surprise-boxes-combos";
import { SurpriseBoxesSection } from "@/components/public/surprise-boxes-section";
import { BarraDeProgresso } from "@/components/public/barra-de-progresso";
import { PrecoDaCampanha } from "@/components/public/preco-da-campanha";
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
        // Prêmios das caixas surpresa, com quem levou cada um. O nome vem
        // pela caixa que reivindicou o prêmio, então prêmio ainda não aberto
        // simplesmente não tem caixa e aparece como disponível.
        // Degraus visíveis, do menor para o maior: a leitura natural é
        // "quanto preciso comprar para ganhar mais".
        surpriseBoxCombos: {
          where: { visible: true },
          orderBy: { threshold: "asc" },
          select: { threshold: true, boxCount: true, highlighted: true },
        },
        surpriseBoxPrizes: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            prize: true,
            skinRarity: true,
            claimedAt: true,
            claimedByBox: {
              select: {
                reservation: {
                  select: {
                    participantName: true,
                    // A reserva pode nao ter conta (compra sem login), entao
                    // o time so existe quando existe usuario ligado.
                    user: { select: { favoriteTeamId: true } },
                  },
                },
              },
            },
          },
        },
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
  const [currentUser, soldCount, ocupados, takenTickets] = await Promise.all([
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
    // Vendidos e ocupados são perguntas diferentes e ambas fazem falta
    // aqui: a barra mostra o que foi pago, e o que resta para comprar
    // desconta também os números presos em reserva aberta.
    contarVendidos(raffle.id),
    contarOcupados(raffle.id),
    // Só rifas pequenas listam os números tomados; nas grandes a grade não
    // é renderizada e puxar 10 mil linhas seria desperdício.
    raffle.totalNumbers <= 500
      ? prisma.ticket.findMany({
          where: { raffleId: raffle.id },
          select: { number: true },
        })
      : Promise.resolve([]),
  ]);

  const takenNumbers = takenTickets.map((t) => t.number);

  // O sorteio ao vivo desta campanha, quando já existe. É o que troca o card
  // estático de ganhador por um convite para assistir: entre o encerramento e
  // a revelação existem dez minutos em que a página precisa dizer para onde
  // ir, e antes disso ela não dizia nada.
  const [sorteio, semente] = await Promise.all([
    prisma.draw.findUnique({
      where: { raffleId: raffle.id },
      select: {
        publicId: true,
        status: true,
        drawStartsAt: true,
        eligibleTicketCount: true,
      },
    }),
    // Só o HASH. A semente em si nunca é lida aqui: esta página entrega
    // objetos inteiros para componentes de cliente, e uma leitura descuidada
    // do segredo mandaria a chave do sorteio para o navegador de todo mundo.
    prisma.drawSeed.findUnique({
      where: { raffleId: raffle.id },
      select: { serverSeedHash: true, committedAt: true },
    }),
  ]);

  const isActive = raffle.status === "ACTIVE";
  const statusConfig = await getConfiguracaoDeStatus();
  const soldPercent = Math.round((soldCount / raffle.totalNumbers) * 100);
  // Disponível é o que ninguém segura. Descontar só os pagos ofereceria
  // números que já estão em reserva de outra pessoa, e a compra falharia no
  // envio com erro genérico.
  const remaining = raffle.totalNumbers - ocupados;
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
  // A mesma regra que o servidor usa ao criar a reserva. Ela mora numa função
  // pura justamente para a tela não prometer uma coisa e a compra fazer outra.
  const dobroValendo = dobroAtivo(
    {
      ativa: raffle.promotionsDoubleEnabled,
      inicio: raffle.promotionsDoubleFrom,
      fim: raffle.promotionsDoubleUntil,
    },
    new Date(),
  );
  // O oposto do portão: quem alcançou o rank precisa VER que alcançou, senão
  // a campanha exclusiva fica idêntica a qualquer outra e o que ele comprou
  // para chegar ali não aparece em lugar nenhum.
  const liberadaPeloRank =
    raffle.minLevel != null && Boolean(currentUser) && !levelLocked;

  // Skin principal da campanha: a de maior raridade entre os prêmios. É ela
  // que abre a página e define a cor de destaque.
  const skinPrizes = raffle.prizes.map(toSkinPrize);
  const headlinePrize = headlineSkin(skinPrizes);

  // Pra cada título premiado, descobre se já foi comprado/contemplado e por
  // quem. Aparece como "VICTOR 🏆" no card; sem comprador = "Disponível".
  // Sorteio concluído. Depois dele a página é um registro do que aconteceu,
  // não uma vitrine de venda: some a caixa de compra, some a prova
  // criptográfica e some a nota automática do resultado. O compromisso da
  // chave continua aparecendo ENQUANTO vende, que é quando ele vale alguma
  // coisa: publicá-lo antes é o que impede escolher a chave depois de saber
  // quem ganharia. Depois do sorteio, quem quiser conferir vai na página do
  // sorteio, que guarda tudo.
  const sorteioConcluido = raffle.winnerTicketNumber != null;

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
            reservation: {
              select: {
                participantName: true,
                user: { select: { favoriteTeamId: true } },
              },
            },
          },
        })
      : [];
  const participantByNumber = new Map<number, string>();
  const teamByNumber = new Map<number, string>();
  for (const t of claimedTickets) {
    if (t.reservation?.participantName) {
      participantByNumber.set(t.number, t.reservation.participantName);
      const time = t.reservation.user?.favoriteTeamId;
      if (time) teamByNumber.set(t.number, time);
    }
  }
  const publicAwardedTickets: PublicAwardedTicket[] = raffle.awardedTickets.map(
    (a) => ({
      number: a.number,
      prizeDescription: a.prizeDescription,
      skinRarity: a.skinRarity,
      participantName: participantByNumber.get(a.number) ?? null,
      participantTeamId: teamByNumber.get(a.number) ?? null,
    }),
  );
  // ── Caixas surpresas na página pública ──
  //
  // A ordem RANDOM não pode ser sorteada a cada render: a página é servidor,
  // e reembaralhar faria a lista trocar de posição a cada visita e a cada
  // atualização, o que parece defeito.
  //
  // Ela ordenava pelo id, com um comentário afirmando que assim não seguia o
  // cadastro. Seguia: o cuid do Prisma começa com o instante da criação, então
  // ordenar por id é ordenar por data de cadastro com outro nome. Conferido no
  // banco de produção, a ordem por id saiu IDÊNTICA à de cadastro nas sete
  // linhas. O prêmio cadastrado primeiro ficava sempre no topo, e a lista
  // fechada só mostra cinco.
  //
  // `ordemEmbaralhada` desfaz isso com um hash do id: estável para o mesmo
  // conjunto, e sem relação nenhuma com a ordem de cadastro.
  const caixasPublicas = (() => {
    if (!raffle.surpriseBoxEnabled) return [];
    const itens = raffle.surpriseBoxPrizes.map((p) => ({
      id: p.id,
      premio: p.prize,
      raridade: p.skinRarity,
      // Sem "exibir ganhadores" ligado, o prêmio ainda aparece, mas sem
      // nome: quem decide comprar quer ver o que já saiu, e isso não exige
      // expor quem levou.
      ganhador: raffle.surpriseBoxExibirGanhadores
        ? (p.claimedByBox?.reservation.participantName ?? null)
        : null,
      // Segue a mesma chave do nome: sem "exibir ganhadores", nem o time sai.
      timeDoGanhador: raffle.surpriseBoxExibirGanhadores
        ? (p.claimedByBox?.reservation.user?.favoriteTeamId ?? null)
        : null,
      aberto: Boolean(p.claimedAt),
    }));

    if (raffle.surpriseBoxDisplayOrder === "DESC") return itens.reverse();
    if (raffle.surpriseBoxDisplayOrder === "ASC") return itens;
    return ordemEmbaralhada(itens, (i) => i.id);
  })();

  const combosPublicos = raffle.surpriseBoxEnabled
    ? raffle.surpriseBoxCombos.map((c) => ({
        titulos: c.threshold,
        caixas: c.boxCount,
        destaque: c.highlighted,
      }))
    : [];

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
          {/* O selo fala do estado da VENDA, e depois do sorteio não há
              venda. Ele continuava dizendo "aguardando sorteio" numa página
              que anuncia "sorteio realizado" logo abaixo, com o nome do
              ganhador. Duas afirmações contrárias na mesma tela, e a de cima
              era a errada. */}
          {!sorteioConcluido && (
            <SeloDeStatus
              texto={statusDaCampanha(
                soldCount,
                raffle.totalNumbers,
                statusConfig,
              )}
            />
          )}
          <h1 className="text-xl font-bold leading-tight tracking-tight md:text-3xl">
            {raffle.title}
          </h1>
          {raffle.shortDescription && (
            <p className="text-sm text-muted-foreground">
              {raffle.shortDescription}
            </p>
          )}
        </div>

        {sorteio && (
          <SeloDeTransmissao
            publicId={sorteio.publicId}
            status={sorteio.status}
            drawStartsAt={sorteio.drawStartsAt.toISOString()}
            elegiveis={sorteio.eligibleTicketCount}
          />
        )}

        {/* Card de ganhador: só aparece quando o admin declarou o resultado. */}
        {raffle.winnerTicketNumber != null && (
          <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-amber-500/20 p-5 text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow">
              🏆 Sorteio realizado
            </div>
            <p className="text-3xl font-black tabular-nums text-amber-700 dark:text-amber-300">
              Título{" "}
              {numeroDoTitulo(raffle.winnerTicketNumber, raffle.totalNumbers)}
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
      {/* A caixa de compra inteira, e não só a frase "não está mais
          disponível para venda": depois do sorteio não há o que vender, e um
          card vazio dizendo isso é ruído no lugar de informação. */}
      {!sorteioConcluido && (
        <div className="mt-5 space-y-3 md:mt-6 md:space-y-4">
          {liberadaPeloRank && (
            <SeloDeLiberado
              minLevel={raffle.minLevel!}
              rank={rankFromXp(viewerXp)}
              gratuita={raffle.isFree}
            />
          )}
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
            <PrecoDaCampanha preco={formatBRL(Number(raffle.pricePerNumber))} />
          )}

          {raffle.showProgressBar && (
            <BarraDeProgresso
              percent={Math.min(100, Math.max(0, soldPercent))}
              soldCount={soldCount}
              remaining={remaining}
            />
          )}

          {/* Campanha fechada não desenha card nenhum aqui.
              Havia um, com uma única frase no meio: "este sorteio não está
              mais disponível para venda". Uma moldura inteira para dizer que
              não há nada dentro dela. E dizer isso nem era preciso: o selo de
              status, a barra em 100% e o aviso da transmissão já contam o que
              aconteceu com a campanha, cada um com informação de verdade. */}
          {isActive && (
            <div className="rounded-xl border bg-card p-4 md:rounded-2xl md:p-5">
              {remaining <= 0 ? (
                // Sem esse ramo, o formulário aparecia normalmente e a reserva só
                // falhava no submit, com uma mensagem genérica de erro, que faz
                // parecer defeito e não campanha esgotada.
                <div className="py-8 text-center">
                  <p className="text-sm font-semibold">
                    Todos os números foram vendidos
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O sorteio acontece na data marcada. Acompanhe o resultado
                    aqui mesmo.
                  </p>
                </div>
              ) : levelLocked ? (
                <MinLevelGate
                  minLevel={raffle.minLevel!}
                  xp={viewerXp}
                  isLoggedIn={Boolean(currentUser)}
                  gratuita={raffle.isFree}
                  jaGarantiram={soldCount}
                />
              ) : (
                <>
                  {dobroValendo && (
                    <FaixaDeDobro
                      inicio={
                        raffle.promotionsDoubleFrom?.toISOString() ?? null
                      }
                      fim={raffle.promotionsDoubleUntil?.toISOString() ?? null}
                      className="mb-4"
                    />
                  )}
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
                    selectionCardsBestseller={
                      raffle.selectionCardsBestseller ?? -1
                    }
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

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

        <SurpriseBoxesCombos
          combos={combosPublicos}
          precoPorNumero={Number(raffle.pricePerNumber)}
          acumulativo={raffle.surpriseBoxCombosAccumulative}
        />

        <SurpriseBoxesSection caixas={caixasPublicas} />

        {/* A prova do sorteio, fechada, no fim.
            Ela ficava aberta logo abaixo do título e comia quase uma tela de
            celular entre o nome da campanha e o preço. Aqui embaixo ela
            continua pública antes da venda, que é o que dá valor a ela, sem
            atravessar o caminho de quem veio comprar. */}
        {semente && !sorteioConcluido && (
          <SeloDeCompromisso
            hash={semente.serverSeedHash}
            desde={semente.committedAt.toISOString()}
            publicId={sorteio?.publicId ?? null}
          />
        )}

        {raffle.showShareButtons && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Compartilhar
            </p>
            <SocialShare url={shareUrl} title={`Participe: ${raffle.title}`} />
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

// CTA exibida quando o visitante não está logado. Leva pra /registro ou
// /login preservando o slug da rifa pra voltar pra cá depois.
