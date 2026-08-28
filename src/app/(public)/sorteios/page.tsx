import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TicketCheck } from "lucide-react";

import { prisma } from "@/lib/db";
import { statusDaCampanha } from "@/lib/campanha-status";
import { SeloDeStatus } from "@/components/public/selo-de-status";
import { SeloDeExclusiva } from "@/components/rank/selo-de-exclusiva";
import { getConfiguracaoDeStatus } from "@/lib/campanha-status-server";
import { contarVendidosPorRifa } from "@/server/services/vendidos";
import { formatBRL } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Campanhas" };

// Lista pública de campanhas, versão completa (sem painel lateral de
// ganhadores como na home). Reaproveita o card compacto.
//
// Multi-tenant: filtra pelo tenant do host atual.
export default async function PublicRafflesListPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const raffles = await prisma.raffle.findMany({
    where: {
      status: "ACTIVE",
      privacy: "PUBLIC",
      tenantId: tenant.id,
    },
    orderBy: [{ showOnHome: "desc" }, { createdAt: "desc" }],
    include: { images: { where: { isCover: true }, take: 1 } },
  });

  // Vendidos por campanha, numa consulta só: o selo automático precisa saber
  // quanto já saiu, e uma consulta por card seria uma por linha da lista.
  // Contava todo ticket, inclusive o de reserva não paga, e por isso o mesmo
  // sorteio mostrava percentual diferente aqui e na home.
  const [vendidosPorRifa, statusConfig] = await Promise.all([
    contarVendidosPorRifa(raffles.map((r) => r.id)),
    getConfiguracaoDeStatus(),
  ]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 md:py-10">
      <div className="flex items-baseline gap-2 px-1 mb-3">
        <h1 className="text-base font-bold tracking-tight">
          <span className="mr-1.5">⚡</span>
          Campanhas
        </h1>
        <span className="text-xs text-muted-foreground">Escolha sua sorte</span>
      </div>

      {raffles.length === 0 ? (
        <div className="rounded-xl border bg-card py-12 text-center px-4">
          <TicketCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma campanha ativa no momento. Volte em breve!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {raffles.map((r) => {
            const cover = r.images[0]?.url ?? null;
            return (
              <Link
                key={r.id}
                href={`/${r.slug}`}
                className="block rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-3 p-3">
                  <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-lg overflow-hidden bg-muted">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={r.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-primary/40">
                        <TicketCheck className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-sm leading-snug line-clamp-2">
                        {r.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.shortDescription ?? "Participe e concorra!"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          r.isFree
                            ? "text-primary uppercase tracking-wider"
                            : "tabular-nums text-muted-foreground"
                        )}
                      >
                        {r.isFree
                          ? r.freeLabel || "Grátis"
                          : formatBRL(Number(r.pricePerNumber))}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                      <SeloDeExclusiva minLevel={r.minLevel} />
                      <SeloDeStatus
                        texto={statusDaCampanha(
                          vendidosPorRifa.get(r.id) ?? 0,
                          r.totalNumbers,
                          statusConfig
                        )}
                      />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
