import { notFound } from "next/navigation";
import { ContainerPublico } from "@/components/public/container";
import type { Metadata } from "next";
import { TicketCheck } from "lucide-react";

import { prisma } from "@/lib/db";
import { statusDaCampanha } from "@/lib/campanha-status";
import { getConfiguracaoDeStatus } from "@/lib/campanha-status-server";
import {
  CompactRaffleCard,
  FeaturedRaffleCard,
} from "@/components/public/cards-de-campanha";
import { contarVendidosPorRifa } from "@/server/services/vendidos";
import { getCurrentTenant } from "@/lib/tenant";
import {
  NA_VITRINE,
  ORDEM_DA_VITRINE,
  seloDoSorteio,
  separarPrincipal,
} from "@/lib/vitrine";

export const metadata: Metadata = { title: "Campanhas" };

// Lista pública de campanhas.
//
// Tinha um card próprio, mais simples que o da home: miniatura de 80px, título
// e preço numa linha. A mesma campanha aparecia de dois jeitos em duas páginas
// do mesmo site, e a página que existe justamente para navegar campanhas era a
// mais pobre das duas, sem destaque nenhum no topo.
//
// Agora monta a vitrine com os mesmos componentes da home: card grande para a
// principal, grade de compactos para o resto.
//
// Multi-tenant: filtra pelo tenant do host atual.
export default async function PublicRafflesListPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const raffles = await prisma.raffle.findMany({
    where: { ...NA_VITRINE, tenantId: tenant.id },
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

  // Vendidos por campanha, numa consulta só: o selo automático precisa saber
  // quanto já saiu, e uma consulta por card seria uma por linha da lista.
  const [vendidosPorRifa, statusConfig] = await Promise.all([
    contarVendidosPorRifa(raffles.map((r) => r.id)),
    getConfiguracaoDeStatus(),
  ]);

  const { principal, demais } = separarPrincipal(raffles);

  // O selo do sorteio manda quando existe: "Sorteio em breve" é o estado real
  // da transmissão, e o selo de venda falaria de uma venda que já terminou.
  const selo = (r: (typeof raffles)[number]) =>
    seloDoSorteio(r.draw?.status) ??
    statusDaCampanha(
      vendidosPorRifa.get(r.id) ?? 0,
      r.totalNumbers,
      statusConfig,
      r.isFree,
      r.seloInicialTexto,
    );

  return (
    <ContainerPublico>
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <h1 className="text-base font-bold tracking-tight">
          <span className="mr-1.5">⚡</span>
          Campanhas
        </h1>
        <span className="text-xs text-muted-foreground">Escolha sua sorte</span>
      </div>

      {!principal ? (
        <div className="rounded-xl border bg-card px-4 py-12 text-center">
          <TicketCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma campanha ativa no momento. Volte em breve!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <FeaturedRaffleCard
            raffle={principal}
            sold={vendidosPorRifa.get(principal.id) ?? 0}
            statusBadge={selo(principal)}
          />
          {demais.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {demais.map((r) => (
                <CompactRaffleCard
                  key={r.id}
                  raffle={r}
                  sold={vendidosPorRifa.get(r.id) ?? 0}
                  statusBadge={selo(r)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </ContainerPublico>
  );
}
