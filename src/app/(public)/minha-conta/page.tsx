import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle, TicketCheck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { STEAM_DELIVERY_NOTICE } from "@/lib/cs2";
import { formatPhone } from "@/lib/cpf";
import { SteamTradeUrlForm } from "@/components/forms/steam-trade-url-form";
import { RankCard, RankLadder } from "@/components/rank/rank-card";
import { XpHistory } from "@/components/rank/xp-history";
import { getUserXp, xpHistory } from "@/server/services/xp";
import { TETO_DE_BOOST, estadoDoBoost } from "@/server/services/boost";
import { CardDeBoost } from "@/components/rank/card-de-boost";
import { XP_MULTIPLIER_TIERS } from "@/lib/xp/config";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SeletorDeTime } from "@/components/times/seletor-de-time";
import { listarTimesAtivos } from "@/server/services/times";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";

export const metadata: Metadata = { title: "Minha conta" };

// Área da conta do participante. O único dado editável aqui é o link de
// troca da Steam, é por ele que a skin ganha chega. Nome e celular são o
// próprio login (passwordless), então mudá-los trocaria as credenciais;
// isso fica com o admin.
export default async function MyAccountPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?redirect=/minha-conta");
  }

  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  // TenantContext é enxuto de propósito (cacheado por request). O aviso de
  // entrega é específico desta página, então vem numa query própria.
  const settings = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { steamDeliveryNotice: true, xpPerBrl: true, rankEnabled: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      phone: true,
      email: true,
      steamTradeUrl: true,
      steamId: true,
      favoriteTeamId: true,
      createdAt: true,
    },
  });
  if (!user) notFound();

  const times = await listarTimesAtivos();
  const timeDoCoracao =
    times.find((t) => t.id === user.favoriteTeamId) ?? null;

  const paidReservations = await prisma.reservation.count({
    where: {
      userId: session.user.id,
      status: "PAID",
      raffle: { tenantId: tenant.id },
    },
  });

  const rankOn = settings?.rankEnabled ?? true;
  const [xp, history, boost, progresso] = rankOn
    ? await Promise.all([
        getUserXp(session.user.id, tenant.id),
        xpHistory(session.user.id, tenant.id, 10),
        // Aplica decaimento e avalia o Boost de Sorte antes de ler: as duas
        // regras dependem só do tempo, e sem isto a pessoa veria um estado
        // velho até a próxima compra.
        estadoDoBoost(session.user.id, tenant.id),
        // O gasto acumulado NÃO vai para a interface. Ele existe aqui só para
        // resolver o GOAT, que é o único degrau com exigência financeira.
        prisma.userProgress.findUnique({
          where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
          select: { totalSpent: true },
        }),
      ])
    : [0, [], null, null];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Minha conta</h1>
        <p className="text-sm text-muted-foreground">
          Olá, {user.name.split(" ")[0]}! Mantenha seus dados de entrega em dia.
        </p>
      </header>

      {/* O aviso vem antes de tudo, e ocupa a largura toda.
          Sem link de troca a pessoa pode ganhar e não receber, então ele não
          divide espaço com nada: é o único item da página que representa uma
          perda concreta. */}
      {!user.steamTradeUrl && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              Falta o seu link de troca da Steam
            </p>
            <p className="text-amber-700/80 dark:text-amber-300/80">
              Sem ele não conseguimos enviar a skin caso você seja sorteado.
              Leva 30 segundos para cadastrar.
            </p>
          </div>
        </div>
      )}

      {/* Duas colunas no desktop, e não uma pilha de seis cartões iguais.
          A página respondia duas perguntas diferentes com o mesmo peso
          visual, uma embaixo da outra, dentro de um terço da tela: à
          esquerda fica "como estou indo", à direita "meus dados". Cada
          coluna tem um assunto, e o olho escolhe antes de ler. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* min-w-0 nos dois: item de grid nasce com `min-width: auto`, então o
            conteúdo mais largo de dentro empurra a coluna inteira. O card de
            Boost tem cinco faixas num rolador horizontal, e sem isto ele
            esticava a página para 510px num telefone de 360, com rolagem
            lateral de verdade. Medida no navegador, não deduzida. */}
        <div className="min-w-0 space-y-5">
          {rankOn && (
            <>
              <RankCard
                xp={xp}
                totalSpent={Number(progresso?.totalSpent ?? 0)}
                multiplicador={boost?.multiplicador}
              />
              {boost && (
                <CardDeBoost
                  dados={boost}
                  faixas={[...XP_MULTIPLIER_TIERS]}
                  tetoDePontos={TETO_DE_BOOST}
                />
              )}
            </>
          )}
        </div>

        {/* A coluna acompanha a rolagem no desktop: a da esquerda é longa, e
            sem isto a entrega da Steam saía da tela enquanto a pessoa lia o
            extrato. */}
        <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">Entrega na Steam</h2>
              {/* O estado dito no cabeçalho, e não deduzido do campo abaixo.
                  A pergunta de quem abre esta seção é "estou pronto para
                  receber?", e ela merece resposta antes do formulário. */}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  user.steamTradeUrl
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
              >
                {user.steamTradeUrl ? "Pronto" : "Pendente"}
              </span>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {settings?.steamDeliveryNotice || STEAM_DELIVERY_NOTICE}
            </p>
            <SteamTradeUrlForm
              current={user.steamTradeUrl}
              notice="Steam → Inventário → Ofertas de troca → Quem pode enviar ofertas."
            />
            {user.steamId && (
              <p className="mt-3 text-xs text-muted-foreground">
                SteamID64 identificado:{" "}
                <span className="font-mono">{user.steamId}</span>
              </p>
            )}
          </section>

          {/* Time do coração. Fica abaixo da entrega da Steam porque é
              cosmético e a entrega é o que decide se a skin chega. */}
          <section className="rounded-xl border bg-card p-4">
            {/* Sem selo repetindo o time no cabeçalho: a própria linha do
                seletor já mostra o emblema e o nome, logo abaixo. */}
            <h2 className="mb-1 text-base font-bold">Time do coração</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Aparece ao lado do seu nome nas listas de ganhadores. Escolher é
              opcional, e dá para tirar quando quiser.
            </p>
            <SeletorDeTime atual={user.favoriteTeamId} times={times} />
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-base font-bold">Dados de acesso</h2>
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {/* O emblema ao lado do próprio nome, que é como ele vai
                  aparecer para os outros nas listas de ganhadores. Serve de
                  confirmação: dá para ver aqui que o time está mesmo salvo,
                  sem precisar ganhar um sorteio para descobrir. */}
              <Row
                label="Nome"
                value={user.name}
                emblema={
                  timeDoCoracao ? (
                    <EmblemaDoTime time={timeDoCoracao} tamanho="md" />
                  ) : null
                }
              />
              <Row
                label="Celular"
                value={user.phone ? formatPhone(user.phone) : "-"}
              />
              <Row label="E-mail" value={user.email ?? "-"} />
              <Row label="Campanhas pagas" value={String(paidReservations)} />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Seu login é feito com nome + celular. Para corrigir algum desses
              dados, fale com o suporte.
            </p>
          </section>

          <Link
            href="/meus-titulos"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            <TicketCheck className="mr-2 h-4 w-4" />
            Ver meus títulos
          </Link>
        </div>
      </div>

      {/* O extrato embaixo das duas colunas, e não dentro da esquerda.
          Dentro dela, no telefone, os dez lançamentos empurravam a entrega da
          Steam para bem longe: a pessoa via o aviso no topo e tinha que rolar
          uma lista inteira para chegar no campo que resolve o aviso. Aqui ele
          fica depois da ação, e no desktop ganha a largura toda, que é o que
          uma lista quer. */}
      {rankOn && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-1 text-base font-bold">Extrato de XP</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Últimos lançamentos da sua conta.
          </p>
          <XpHistory entries={history} />
        </section>
      )}

      {/* Sem sanfona, e essa foi uma correção.
          Eu tinha colapsado a escada para a página não ficar alta, e com isso
          escondi a única coisa que EXPLICA o sistema: fechada, o site pedia
          para a pessoa subir de patente sem nunca mostrar quais são nem para
          que servem. Ela volta aberta, com o cabeçalho do próprio componente
          em vez de um resumo repetido por fora. */}
      {rankOn && <RankLadder xp={xp} />}
    </div>
  );
}

function Row({
  label,
  value,
  emblema,
}: {
  label: string;
  value: string;
  /** Desenhado ao lado do valor. Hoje só o nome usa, com o time. */
  emblema?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="flex items-center gap-2 text-sm font-semibold">
        <span className="min-w-0 truncate">{value}</span>
        {emblema}
      </dd>
    </div>
  );
}
