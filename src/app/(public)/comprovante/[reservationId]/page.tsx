import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { Lock } from "lucide-react";

import { prisma } from "@/lib/db";
import { ReservationCountdown } from "@/components/public/reservation-countdown";
import { PaymentPoller } from "@/components/public/payment-poller";
import { PixPayment } from "@/components/public/pix-payment";
import { PixError } from "@/components/public/pix-error";
import { PaidCelebration } from "@/components/public/paid-celebration";
import { XpGanho } from "@/components/public/xp-ganho";
import { SurpriseBoxesClaim } from "@/components/public/surprise-boxes-claim";
import { TitulosPremiadosGanhos } from "@/components/public/titulos-premiados-ganhos";
import { ColecaoDeRaspadinhas } from "@/components/public/raspadinha/colecao";
import { numeroDoBilhete } from "@/lib/raspadinha";
import { ExpiredReservation } from "@/components/public/expired-reservation";
import { TrilhaDoPedido } from "@/components/public/trilha-do-pedido";
import { TituloDaAba } from "@/components/public/titulo-da-aba";
import { EventoDeCompra } from "@/components/public/evento-de-compra";
import { SeloDeDobro } from "@/components/public/selo-de-dobro";
import { ComoVoltar } from "@/components/public/como-voltar";
import { ContainerPublico } from "@/components/public/container";
import {
  ensurePixForReservation,
  pollPaymentStatusIfPending,
} from "@/server/services/pix";
import { expireReservationIfDue } from "@/server/services/reservations";
import { formatBRL } from "@/lib/format";
import { formatPhone } from "@/lib/cpf";
import { getCurrentTenant } from "@/lib/tenant";
import { sessionMayAccessOwnedResource } from "@/lib/auth-helpers";

export const metadata: Metadata = { title: "Comprovante de reserva" };

const reservationInclude = {
  raffle: {
    select: {
      title: true,
      slug: true,
      tenantId: true,
      // A data do sorteio entra no selo de confirmação: depois de "deu
      // certo?" a pergunta seguinte é "quando eu descubro?".
      drawDate: true,
      surpriseBoxAbrirTodas: true,
      raspadinhaRasparTodas: true,
      awardedTicketsEnabled: true,
      awardedTicketsWinnerText: true,
    },
  },
  tickets: {
    select: { number: true },
    orderBy: { number: "asc" as const },
  },
  payment: {
    select: {
      id: true,
      externalId: true,
      status: true,
      method: true,
      rawResponse: true,
    },
  },
  raspadinhas: {
    select: {
      id: true,
      numero: true,
      status: true,
      // A consulta traz o prêmio, e o mapeamento abaixo é quem decide se ele
      // viaja: bilhete DISPONIVEL já TEM prêmio decidido desde a compra, e o
      // corte precisa acontecer antes de virar prop.
      premio: { select: { id: true, tipo: true, rotulo: true, valor: true } },
    },
    orderBy: { numero: "asc" as const },
  },
  surpriseBoxes: {
    select: {
      id: true,
      status: true,
      // Só o nome do item. O agrupador do painel ("Skins
      // Lendárias" e afins) é organização interna, não vai para a tela
      // de quem comprou.
      prize: { select: { prize: true } },
    },
    // O id desempata, e não é detalhe: as caixas de uma compra nascem todas
    // no MESMO instante (um createMany só), então ordenar apenas por createdAt
    // deixa a ordem por conta do banco, e ela pode mudar a cada carregamento.
    // Com o prêmio decidido na compra, isso faria a caixa premiada trocar de
    // posição na tela entre um F5 e outro.
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
};

export default async function ReservationReceiptPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  // O telefone do suporte não está no contexto do tenant, que é o mínimo
  // carregado em toda página. Vem aqui porque só esta precisa: é ele que
  // liga o ganhador ao atendimento.
  const suporte = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { supportPhone: true },
  });

  // Auto-cura: se o timer já passou mas o cron ainda não rodou, expira a
  // reserva agora. Evita o estado híbrido em que o countdown client-side
  // mostra "Reserva expirada" mas o servidor renderiza QR Code e botão
  // "Já paguei" como se ainda fosse pra pagar.
  await expireReservationIfDue(reservationId);

  let reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: reservationInclude,
  });
  if (!reservation) notFound();
  // Bloqueia acesso cross-tenant: o comprovante só aparece no domínio do
  // tenant onde a reserva foi feita.
  if (reservation.raffle.tenantId !== tenant.id) notFound();
  // Isolamento entre usuários: quem está logado só vê o próprio comprovante
  // (admin também). Sem sessão, o link (cuid não-adivinhável) é a credencial:
  // é o comprovante compartilhável por quem recebeu o link.
  if (!(await sessionMayAccessOwnedResource(reservation.userId))) notFound();

  // Auto-cura: reservas grátis (total 0) que ficaram presas em PENDING
  // antes da correção de fluxo. Promove pra PAID na hora, não tem o que
  // cobrar, não tem por que esperar. Cobre tanto a reserva quanto os
  // tickets que ainda estavam RESERVED.
  if (
    reservation.status === "PENDING" &&
    Number(reservation.totalAmount) <= 0
  ) {
    const paidAt = new Date();
    await prisma.$transaction([
      prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: "PAID", paidAt },
      }),
      prisma.ticket.updateMany({
        where: { reservationId: reservation.id, status: "RESERVED" },
        data: { status: "PAID", paidAt },
      }),
    ]);
    reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: reservationInclude,
    });
    if (!reservation) notFound();
  }

  // Fallback ao webhook: se a reserva ainda está PENDING e já existe
  // Payment, consulta o gateway pra ver se o pagamento foi confirmado.
  // Throttled internamente pra não estourar rate limit.
  if (reservation.status === "PENDING" && reservation.payment?.externalId) {
    const polled = await pollPaymentStatusIfPending(
      reservation.payment.id,
      reservation.payment.externalId,
      reservation.id,
    );
    if (polled === "APPROVED" || polled === "REJECTED") {
      reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        include: reservationInclude,
      });
      if (!reservation) notFound();
    }
  }

  // Carrega os textos/imagens customizados do tenant. Cada campo pode estar
  // null, os componentes caem pros defaults nesse caso.
  const tenantMessages = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      paidTitle: true,
      paidDescription: true,
      paidButtonLabel: true,
      paidImageUrl: true,
      // Para o bloco de XP na tela de pago.
      rankEnabled: true,
      xpPerBrl: true,
      expiredTitle: true,
      expiredDescription: true,
      expiredButtonLabel: true,
      expiredImageUrl: true,
    },
  });

  // ── Estado pago: tela comemorativa + caixas surpresas (se houver).
  if (reservation.status === "PAID") {
    // O link de troca vai na mensagem de reivindicação: é o endereço para
    // onde a skin sai, e sem ele o atendimento começa pedindo justamente
    // isso. Só é lido aqui dentro porque só compra paga tem o que reivindicar.
    //
    // Compra feita sem login não tem conta ligada, e aí o link não existe: a
    // mensagem diz isso em vez de fingir que existe.
    const tradeUrl = reservation.userId
      ? ((
          await prisma.user.findUnique({
            where: { id: reservation.userId },
            select: { steamTradeUrl: true },
          })
        )?.steamTradeUrl ?? null)
      : null;

    // Os títulos premiados que caíram nos números desta pessoa.
    //
    // O painel promete que isto aparece no comprovante, e o texto de ganhador
    // até era gravado, mas nada lia: quem tirava um número premiado terminava
    // a compra sem nenhum aviso, e só descobria pela lista da campanha, se
    // olhasse. Aqui é onde ele fica sabendo.
    const premiadosDaPessoa = reservation.raffle.awardedTicketsEnabled
      ? await prisma.awardedTicket.findMany({
          where: {
            raffleId: reservation.raffleId,
            number: { in: reservation.tickets.map((t) => t.number) },
          },
          orderBy: { number: "asc" },
          select: { number: true, prizeDescription: true, skinRarity: true },
        })
      : [];

    // Quanto a conta andou com esta compra.
    //
    // O ganho sai dos lançamentos desta reserva, não de uma conta feita
    // aqui: quem credita é awardXpForReservation, e recalcular o valor nesta
    // tela criaria uma segunda regra que pode divergir da que gravou.
    //
    // Somar em vez de pegar um lançamento: a mesma reserva rende XP por
    // motivos diferentes (a compra, e bônus quando houver), e mostrar só um
    // deles daria um número menor do que a pessoa realmente ganhou.
    const rankLigado = tenantMessages?.rankEnabled ?? true;
    const xp =
      rankLigado && reservation.userId
        ? await Promise.all([
            prisma.xpEntry.aggregate({
              where: { reservationId: reservation.id },
              _sum: { amount: true },
            }),
            prisma.userProgress.findUnique({
              where: {
                userId_tenantId: {
                  userId: reservation.userId,
                  tenantId: tenant.id,
                },
              },
              select: { xp: true },
            }),
          ]).then(([lancamentos, progresso]) => ({
            ganho: lancamentos._sum.amount ?? 0,
            total: progresso?.xp ?? 0,
          }))
        : null;

    // O PRÊMIO SÓ VIAJA DEPOIS DE RASPADA, pelo mesmo motivo da caixa: ele
    // passou a ser decidido na confirmação do pagamento, então o bilhete
    // fechado já sabe o que tem dentro. Mandar isso para o navegador
    // entregaria o resultado antes do gesto, e nenhum esconderijo no React
    // resolveria: o dado não pode chegar ao aparelho.
    const raspadinhas = reservation.raspadinhas.map((r) => ({
      id: r.id,
      numero: numeroDoBilhete(r.numero),
      status: r.status as "DISPONIVEL" | "PREMIADA" | "SEM_PREMIO",
      premio:
        r.status !== "DISPONIVEL" && r.premio
          ? {
              id: r.premio.id,
              tipo: r.premio.tipo as "PIX" | "SKIN",
              rotulo: r.premio.rotulo,
              valor: r.premio.valor == null ? null : Number(r.premio.valor),
            }
          : null,
    }));

    // O PRÊMIO SÓ VIAJA DEPOIS DE ABERTA.
    //
    // Ele passou a ser decidido na confirmação do pagamento, e não mais no
    // clique, então a caixa fechada já sabe o que tem dentro. Mandar isso para
    // o navegador entregaria o jogo: bastaria abrir o inspetor para ver qual
    // caixa vale a pena, e as outras virariam formalidade.
    const boxes = reservation.surpriseBoxes.map((b) => ({
      id: b.id,
      status: b.status as "UNOPENED" | "OPENED_PRIZE" | "OPENED_EMPTY",
      prize:
        b.status !== "UNOPENED" && b.prize ? { prize: b.prize.prize } : null,
    }));
    return (
      <ContainerPublico largura="foco" className="space-y-4">
        {/* Título da aba por estado. Quem paga costuma ter a aba em
            segundo plano quando o webhook confirma, e o visto é o sinal
            de que já pode voltar. */}
        <TituloDaAba texto="✓ Pagamento confirmado" />
        {/* Fecha o ciclo do anúncio: a Meta só sabe que a campanha deu venda
            quando este evento chega do navegador de quem clicou nela. */}
        <EventoDeCompra
          reservationId={reservation.id}
          valor={Number(reservation.totalAmount)}
          quantidade={reservation.tickets.length}
        />
        <TrilhaDoPedido estado="pago" titulo={reservation.raffle.title} />
        <PaidCelebration
          dobroAplicado={reservation.dobroAplicado}
          raffleTitle={reservation.raffle.title}
          raffleSlug={reservation.raffle.slug}
          numbers={reservation.tickets.map((t) => t.number)}
          participantName={reservation.participantName}
          totalAmount={Number(reservation.totalAmount)}
          paidAt={reservation.paidAt}
          drawDate={reservation.raffle.drawDate}
          customTitle={tenantMessages?.paidTitle}
          customDescription={tenantMessages?.paidDescription}
          customButtonLabel={tenantMessages?.paidButtonLabel}
          customImageUrl={tenantMessages?.paidImageUrl}
        >
          {/* Caixas antes do XP: aqui há ação a fazer, e ali só informação.
              E as duas ficam antes dos botões porque "Ver mais campanhas"
              tira a pessoa da página, e ela sairia sem abrir a caixa que
              acabou de ganhar. */}
          {/* Raspadinhas antes das caixas: e a experiencia mais forte das
              duas, e quem ganhou as duas coisas ve primeiro a que pede
              gesto. */}
          {premiadosDaPessoa.length > 0 && (
            <TitulosPremiadosGanhos
              premiados={premiadosDaPessoa}
              telefoneDoSuporte={suporte?.supportPhone ?? null}
              nomeDoGanhador={reservation.participantName}
              tradeUrl={tradeUrl}
              texto={reservation.raffle.awardedTicketsWinnerText}
            />
          )}

          {raspadinhas.length > 0 && (
            <ColecaoDeRaspadinhas
              reservationId={reservation.id}
              raspadinhas={raspadinhas}
              permiteRasparTodas={reservation.raffle.raspadinhaRasparTodas}
            />
          )}

          {boxes.length > 0 && (
            <SurpriseBoxesClaim
              reservationId={reservation.id}
              boxes={boxes}
              allowOpenAll={reservation.raffle.surpriseBoxAbrirTodas}
              telefoneDoSuporte={suporte?.supportPhone ?? null}
              nomeDoGanhador={reservation.participantName}
              tradeUrl={tradeUrl}
            />
          )}

          {xp && (
            <XpGanho
              ganho={xp.ganho}
              total={xp.total}
              xpPerBrl={tenantMessages?.xpPerBrl ?? 10}
            />
          )}
        </PaidCelebration>
      </ContainerPublico>
    );
  }

  // ── Estado expirado/cancelado: convida a refazer a reserva. Sem
  // countdown, sem PixError, sem badge, nada disso faz sentido aqui.
  if (reservation.status === "EXPIRED" || reservation.status === "CANCELLED") {
    return (
      <ContainerPublico largura="foco" className="space-y-4">
        <TituloDaAba texto="Reserva expirada" />
        <TrilhaDoPedido estado="encerrado" titulo={reservation.raffle.title} />
        <ExpiredReservation
          raffleTitle={reservation.raffle.title}
          raffleSlug={reservation.raffle.slug}
          cancelled={reservation.status === "CANCELLED"}
          customTitle={tenantMessages?.expiredTitle}
          customDescription={tenantMessages?.expiredDescription}
          customButtonLabel={tenantMessages?.expiredButtonLabel}
          customImageUrl={tenantMessages?.expiredImageUrl}
        />
      </ContainerPublico>
    );
  }

  // ── Estado pendente: QR Code + copia-cola + opções de verificação.
  let pixCode = extractPixCode(reservation.payment?.rawResponse);
  let pixError: string | null = null;

  if (reservation.status === "PENDING" && !pixCode) {
    const ip = await getClientIp();
    const result = await ensurePixForReservation(reservation.id, ip);
    if (result.ok) {
      pixCode = result.pix.pixCode;
    } else {
      pixError = result.error;
    }
  }

  const showPix = reservation.status === "PENDING" && Boolean(pixCode);
  const qrDataUrl = showPix
    ? await QRCode.toDataURL(pixCode!, {
        margin: 1,
        width: 300,
        errorCorrectionLevel: "M",
      }).catch(() => null)
    : null;

  const quantidade = reservation.tickets.length;

  return (
    // Tela de pagamento pendente. A ordem segue o que a pessoa precisa
    // fazer agora: quanto pagar, quanto tempo resta, e como pagar. Antes,
    // o Pix ficava espremido entre o cronômetro e os dados do participante,
    // e o título dizia "Reserva confirmada" numa reserva que ainda não
    // estava paga.
    <ContainerPublico largura="foco" className="space-y-4">
      <TrilhaDoPedido estado="aguardando" titulo={reservation.raffle.title} />

      {/* Valor e prazo no mesmo cartão. Eram dois quadros grandes e
          coloridos empilhados, e o olho não tinha onde pousar primeiro;
          juntos, respondem de uma vez a "quanto" e "até quando", que é a
          mesma pergunta vista de dois lados. */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card px-4 py-3.5 md:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Valor a pagar
          </p>
          <p className="text-2xl font-extrabold leading-tight tabular-nums tracking-tight text-primary md:text-3xl">
            {formatBRL(Number(reservation.totalAmount))}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {quantidade} {quantidade === 1 ? "número" : "números"} ·{" "}
            {reservation.participantName}
          </p>
        </div>
        <ReservationCountdown
          expiresAtIso={reservation.expiresAt.toISOString()}
          valorNoTitulo={formatBRL(Number(reservation.totalAmount))}
        />
      </div>

      {reservation.dobroAplicado && (
        <SeloDeDobro total={quantidade} estado="pagando" />
      )}

      {showPix && <PaymentPoller />}

      {showPix && qrDataUrl && pixCode ? (
        <PixPayment
          qrDataUrl={qrDataUrl}
          pixCode={pixCode}
          reservationId={reservation.id}
        />
      ) : (
        <PixError
          reservationId={reservation.id}
          error={
            pixError ??
            "Pix ainda não foi gerado. Tente novamente em instantes."
          }
        />
      )}

      {/* Números e dados no mesmo cartão. Separados, eram dois blocos do
          tamanho do pagamento para informação que ninguém precisa agora: o
          que importa nesta tela é pagar. */}
      <section className="rounded-2xl border bg-card">
        {/* Os números só se revelam depois do pagamento. Mostrá-los antes
            dava a impressão de que a compra já estava garantida, e ela não
            está: a reserva expira e os números voltam para o sorteio. */}
        <div className="flex items-center gap-3 border-b px-4 py-3 md:px-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {quantidade}{" "}
              {quantidade === 1 ? "número reservado" : "números reservados"}
              {reservation.dobroAplicado && (
                <span className="ml-1.5 font-bold text-amber-600 dark:text-amber-400">
                  (o dobro)
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Aparecem aqui assim que o pagamento for confirmado.
            </p>
          </div>
        </div>

        <div className="px-4 py-1 text-sm md:px-5">
          <Info label="Participante">{reservation.participantName}</Info>
          {reservation.participantPhone && (
            <Info label="Telefone">
              {formatPhone(reservation.participantPhone)}
            </Info>
          )}
        </div>
      </section>

      <ComoVoltar temConta={reservation.userId !== null} />
    </ContainerPublico>
  );
}

function extractPixCode(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>).pix_code;
  return typeof v === "string" && v.length > 0 ? v : null;
}

// IP do cliente: pega de x-forwarded-for (Vercel injeta), com fallback
// pra x-real-ip. Default 0.0.0.0 mantém o gateway feliz sem expor nada.
async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
