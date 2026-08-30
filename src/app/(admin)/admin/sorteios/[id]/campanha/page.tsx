import { notFound } from "next/navigation";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { Link2 } from "lucide-react";

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
      <CabecalhoDeAdmin
        etiqueta="Campanhas"
        icone={<Link2 aria-hidden className="h-3 w-3" />}
        titulo="Links de campanha"
        descricao="Um link por lugar onde você divulga. Use o link certo em cada canal e o painel passa a dizer de onde vem cada venda, em vez de tudo chegar como tráfego direto."
        migalha={[
          { rotulo: "Sorteios", href: "/admin/sorteios" },
          { rotulo: raffle.title, href: `/admin/sorteios/${raffle.id}/editar` },
          { rotulo: "Campanha" },
        ]}
      />

      <LinksDeCampanha base={base} slug={raffle.slug} linhas={linhas} />
    </div>
  );
}
