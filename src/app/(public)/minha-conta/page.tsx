import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Send,
  Link2,
  Shield,
  TicketCheck,
  UserRound,
} from "lucide-react";

import { auth } from "@/auth";
import { ContainerPublico } from "@/components/public/container";
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
import { cn } from "@/lib/utils";
import { Etiqueta, Moldura } from "@/components/ui/moldura";
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
      affiliate: { select: { status: true } },
    },
  });
  if (!user) notFound();

  const ehAfiliado = user.affiliate?.status === "ACTIVE";

  const times = await listarTimesAtivos();
  const timeDoCoracao = times.find((t) => t.id === user.favoriteTeamId) ?? null;

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
          where: {
            userId_tenantId: { userId: session.user.id, tenantId: tenant.id },
          },
          select: { totalSpent: true },
        }),
      ])
    : [0, [], null, null];

  return (
    <ContainerPublico className="space-y-5">
      <header>
        <Etiqueta icone={<UserRound aria-hidden className="h-3 w-3" />}>
          Minha conta
        </Etiqueta>
        <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
          Olá, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua patente, o link que faz a skin chegar e seus dados de acesso.
        </p>
      </header>

      {/* O aviso vem antes de tudo, e ocupa a largura toda.
          Sem link de troca a pessoa pode ganhar e não receber, então ele não
          divide espaço com nada: é o único item da página que representa uma
          perda concreta. */}
      {!user.steamTradeUrl && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
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

      {/* Uma coluna só, em qualquer largura.
          Eram duas no desktop, com a da direita fixa acompanhando a rolagem.
          A ideia era separar "como estou indo" de "meus dados", mas na prática
          a da esquerda terminava cedo e sobrava meia tela vazia ao lado de uma
          coluna estreita, com os cartões da direita espremidos em pouco mais
          de um terço da largura. Empilhado, cada cartão usa a largura inteira
          e a leitura é uma só, de cima para baixo. */}
      <div className="space-y-5">
        {/* min-w-0 continua: o card de Boost tem cinco faixas num rolador
            horizontal, e sem isto ele esticava a página para 510px num telefone
            de 360, com rolagem lateral de verdade. Medida no navegador. */}
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

        <div className="min-w-0 space-y-5">
          <Moldura>
            <section className="p-4 md:p-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Send aria-hidden className="h-4 w-4 text-muted-foreground" />
                  Entrega na Steam
                </h2>
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
          </Moldura>

          {/* Time do coração. Fica abaixo da entrega da Steam porque é
              cosmético e a entrega é o que decide se a skin chega. */}
          <Moldura>
            <section className="p-4 md:p-5">
              {/* Sem selo repetindo o time no cabeçalho: a própria linha do
                seletor já mostra o emblema e o nome, logo abaixo. */}
              <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
                <Shield aria-hidden className="h-4 w-4 text-muted-foreground" />
                Time do coração
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Aparece ao lado do seu nome nas listas de ganhadores. Escolher é
                opcional, e dá para tirar quando quiser.
              </p>
              <SeletorDeTime atual={user.favoriteTeamId} times={times} />
            </section>
          </Moldura>

          <Moldura>
            <section className="p-4 md:p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
                <UserRound
                  aria-hidden
                  className="h-4 w-4 text-muted-foreground"
                />
                Dados de acesso
              </h2>
              <dl className="grid gap-2 sm:grid-cols-2">
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
          </Moldura>

          {/* Linha de ação, e não um botão fino de contorno.
              Como botão vazado de largura inteira ele parecia divisória entre
              seções, e o único caminho que sai desta página passava
              despercebido. */}
          <Moldura>
            <Link
              href="/meus-titulos"
              className="group flex items-center gap-3 p-4 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.03]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                <TicketCheck aria-hidden className="h-4 w-4 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Meus títulos</span>
                <span className="block text-xs text-muted-foreground">
                  Suas reservas, os números de cada uma e o resultado.
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5"
              />
            </Link>
          </Moldura>
        </div>
      </div>

      {/* O extrato embaixo das duas colunas, e não dentro da esquerda.
          Dentro dela, no telefone, os dez lançamentos empurravam a entrega da
          Steam para bem longe: a pessoa via o aviso no topo e tinha que rolar
          uma lista inteira para chegar no campo que resolve o aviso. Aqui ele
          fica depois da ação, e no desktop ganha a largura toda, que é o que
          uma lista quer. */}
      {/* Sanfona, e fechada por padrão.
          São dez lançamentos, e eles são consulta: a pessoa abre quando quer
          conferir de onde veio o XP, não toda vez que entra na conta. Aberto
          por padrão, ele empurrava as patentes para fora da tela em qualquer
          largura.

          `details` puro: abre e fecha sem JavaScript nenhum, e a contagem no
          resumo já responde "tem coisa aí dentro?" sem precisar abrir. */}
      {rankOn && (
        <Moldura>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">Extrato de XP</span>
                <span className="block text-sm text-muted-foreground">
                  {history.length === 0
                    ? "Nenhum lançamento ainda."
                    : `${history.length} lançamento${history.length === 1 ? "" : "s"} na sua conta.`}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-open:rotate-180"
              />
            </summary>
            <div className="border-t border-white/[0.06] p-4">
              <XpHistory entries={history} />
            </div>
          </details>
        </Moldura>
      )}

      {/* Sem sanfona, e essa foi uma correção.
          Eu tinha colapsado a escada para a página não ficar alta, e com isso
          escondi a única coisa que EXPLICA o sistema: fechada, o site pedia
          para a pessoa subir de patente sem nunca mostrar quais são nem para
          que servem. Ela volta aberta, com o cabeçalho do próprio componente
          em vez de um resumo repetido por fora. */}
      {rankOn && <RankLadder xp={xp} />}

      {/* A porta do programa de afiliados. Fica no fim, e aparece para todo
          mundo: quem já é afiliado vem aqui buscar o link, e quem não é
          descobre que o programa existe. Quem não participa continua sem ver
          métrica nenhuma, isso é decidido lá dentro. */}
      <Moldura>
        <Link
          href="/minha-conta/afiliados"
          className="flex items-center gap-3 p-4 transition-colors hover:bg-white/[0.03] md:p-5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <Link2 aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">
              Programa de Afiliados
            </span>
            <span className="block text-sm leading-relaxed text-muted-foreground">
              {ehAfiliado
                ? "Seu link, suas Entradas Grátis e quem você já indicou."
                : "A cada R$ 10 em compras dos seus indicados, uma Entrada Grátis."}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
        </Link>
      </Moldura>
    </ContainerPublico>
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
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
