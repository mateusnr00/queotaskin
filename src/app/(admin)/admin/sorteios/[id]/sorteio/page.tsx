// O sorteio ao vivo, visto do painel.
//
// A tela é deliberadamente SÓ DE LEITURA. Não existe botão de sortear, de
// escolher número, de refazer nem de adiantar: a definição do ganhador saiu
// da mão de quem administra, e é isso que dá valor ao certificado público. O
// que o painel oferece é acompanhamento, o cronograma, o resultado quando
// sai, e o link da transmissão.
//
// Sem ação, sem formulário e sem estado de cliente, ela é um componente de
// servidor inteiro.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Radio, ShieldCheck } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { raffleUrl } from "@/lib/raffle-url";
import { ROTULO_DO_STATUS } from "@/server/services/sorteio-ao-vivo";

export const metadata: Metadata = { title: "Sorteio ao vivo" };
export const dynamic = "force-dynamic";

function quando(data: Date | null): string {
  if (!data) return "não registrado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(data);
}

const COR_DO_STATUS: Record<string, string> = {
  WAITING_DRAW: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  COUNTDOWN: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  DRAWING: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
  REVEALING: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
  FINISHED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  ERROR: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-300",
};

export default async function SorteioDaCampanhaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const raffle = await prisma.raffle.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      totalNumbers: true,
      drawDate: true,
      autoCloseOnDraw: true,
      draw: true,
    },
  });
  if (!raffle) notFound();

  const draw = raffle.draw;
  const base = (await raffleUrl(raffle.slug)).replace(/\/[^/]*$/, "");

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Radio className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link href="/admin/sorteios" className="hover:text-foreground">
                Sorteios
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="truncate">{raffle.title}</span>
            </nav>
            <h1 className="text-lg font-bold tracking-tight md:text-xl">
              Sorteio ao vivo
            </h1>
            <p className="text-sm text-muted-foreground">
              O resultado é definido pelo sistema, sozinho, assim que a
              campanha encerra. Esta tela acompanha; ela não decide.
            </p>
          </div>
        </div>
      </div>

      {!draw ? (
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-muted-foreground/25 bg-muted px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
              Aguardando encerramento
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            O sorteio é criado sozinho quando a campanha encerra, e a partir
            daí ninguém consegue mudar o resultado. Encerra quando todos os
            títulos forem vendidos
            {raffle.autoCloseOnDraw && raffle.drawDate
              ? `, ou na data marcada (${quando(raffle.drawDate)})`
              : ""}
            .
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Status da campanha" valor={raffle.status} />
            <Campo
              rotulo="Títulos"
              valor={raffle.totalNumbers.toLocaleString("pt-BR")}
            />
            <Campo
              rotulo="Fechamento automático"
              valor={raffle.autoCloseOnDraw ? "Ligado" : "Desligado"}
            />
          </dl>
          {!raffle.autoCloseOnDraw && !raffle.drawDate && (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Sem data de sorteio e sem fechamento automático, esta campanha só
              encerra quando vender todos os títulos.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase ${
                    COR_DO_STATUS[draw.status] ?? ""
                  }`}
                >
                  {ROTULO_DO_STATUS[draw.status]}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {draw.publicId}
                </span>
              </div>
              <Link
                href={`${base}/sorteio/${draw.publicId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted"
              >
                Abrir a transmissão
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            {draw.errorReason && (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                {draw.errorReason}
              </p>
            )}

            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Campanha encerrada em" valor={quando(draw.raffleEndedAt)} />
              <Campo rotulo="Contagem começa" valor={quando(draw.drawScheduledAt)} />
              <Campo rotulo="Sorteio às" valor={quando(draw.drawStartsAt)} />
              <Campo rotulo="Contagem observada" valor={quando(draw.countdownStartedAt)} />
              <Campo rotulo="Número escolhido em" valor={quando(draw.drawExecutedAt)} />
              <Campo rotulo="Finalizado em" valor={quando(draw.finishedAt)} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-bold">Resultado</h2>
            </div>

            {draw.winningNumber == null ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Ainda não sorteado. O número é escolhido no servidor, no
                instante marcado acima.
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p className="font-mono text-3xl font-black tabular-nums">
                    {draw.winningNumber}
                  </p>
                  <p className="text-sm font-semibold">
                    {draw.winnerName ?? "Sem nome no cadastro"}
                  </p>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Campo
                    rotulo="Títulos elegíveis"
                    valor={draw.eligibleTicketCount.toLocaleString("pt-BR")}
                  />
                  <Campo rotulo="Método" valor={draw.rngMethod} />
                  <Campo rotulo="Versão do motor" valor={String(draw.drawVersion)} />
                </dl>
                {draw.snapshotHash && (
                  <div className="mt-3 rounded-xl border bg-muted/40 p-3">
                    <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                      Impressão digital dos elegíveis (SHA-256)
                    </p>
                    <p className="mt-1 font-mono text-[10px] leading-relaxed break-all text-muted-foreground">
                      {draw.snapshotHash}
                    </p>
                  </div>
                )}
              </>
            )}

            <p className="mt-4 rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              O painel não escolhe ganhador de campanha com sorteio automático.
              Declarar ou remover ganhador à mão fica bloqueado aqui, e é assim
              que o certificado público continua valendo alguma coisa.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/30 px-3 py-2">
      <dt className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        {rotulo}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold">{valor}</dd>
    </div>
  );
}
