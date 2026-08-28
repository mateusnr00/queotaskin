import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Link2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { raffleUrl } from "@/lib/raffle-url";
import { CANAIS } from "@/lib/canais-de-campanha";
import { LinksDeCampanha } from "@/components/admin/links-de-campanha";

export const metadata: Metadata = { title: "Links de campanha" };
export const dynamic = "force-dynamic";

export default async function CampanhaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const raffle = await prisma.raffle.findFirst({
    where: { id, tenantId },
    select: { id: true, title: true, slug: true },
  });
  if (!raffle) notFound();

  // Duas contas por canal, e não uma. Visitas dizem quanto tráfego o canal
  // trouxe; vendas dizem quanto daquilo virou dinheiro. Um canal com muita
  // visita e nenhuma venda é um canal que atrai a pessoa errada, e só os dois
  // números juntos mostram isso.
  const [visitas, vendas] = await Promise.all([
    prisma.visitaDeCampanha.findMany({
      where: { raffleId: raffle.id },
      select: { canal: true, visitas: true },
    }),
    prisma.reservation.groupBy({
      by: ["utmContent"],
      where: { raffleId: raffle.id, status: "PAID", utmContent: { not: null } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  const base = (await raffleUrl(raffle.slug)).replace(/\/[^/]*$/, "");

  const linhas = CANAIS.map((canal) => {
    const venda = vendas.find((v) => v.utmContent === canal.id);
    return {
      id: canal.id,
      rotulo: canal.rotulo,
      visitas: visitas.find((v) => v.canal === canal.id)?.visitas ?? 0,
      vendas: venda?._count._all ?? 0,
      valor: Number(venda?._sum.totalAmount ?? 0),
    };
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Link2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link href="/admin/sorteios" className="hover:text-foreground">
                Sorteios
              </Link>
              <ChevronRight className="h-3 w-3" />
              <Link
                href={`/admin/sorteios/${raffle.id}/editar`}
                className="max-w-56 truncate hover:text-foreground"
              >
                {raffle.title}
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span>Campanha</span>
            </nav>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Links de campanha
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Um link por lugar onde você divulga. Use o link certo em cada
              canal e o painel passa a dizer de onde vem cada venda, em vez de
              tudo chegar como tráfego direto.
            </p>
          </div>
        </div>
      </div>

      <LinksDeCampanha base={base} slug={raffle.slug} linhas={linhas} />
    </div>
  );
}
