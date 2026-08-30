import Link from "next/link";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { ArrowLeft, Sparkles } from "lucide-react";

import { RaffleForm } from "@/components/admin/raffle-form";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Novo sorteio" };

export default async function NewRafflePage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const skins = await prisma.skinTemplate.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      skinRarity: true,
      skinWear: true,
      skinValueBrl: true,
      skinWears: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/sorteios"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para sorteios
        </Link>

        <CabecalhoDeAdmin
          etiqueta="Campanhas"
          icone={<Sparkles aria-hidden className="h-3 w-3" />}
          titulo="Novo sorteio"
          descricao="Preencha o título e siga para a aba que quiser. O sorteio é criado sozinho quando você abre Imagens, Prêmios ou Pagamento."
          migalha={[
            { rotulo: "Admin", href: "/admin" },
            { rotulo: "Sorteios", href: "/admin/sorteios" },
            { rotulo: "Novo" },
          ]}
        />
      </div>
      <RaffleForm
        mode={{ kind: "create" }}
        skins={skins.map((sk) => ({
          ...sk,
          skinValueBrl: sk.skinValueBrl ? Number(sk.skinValueBrl) : null,
          desgastesDisponiveis: sk.skinWears,
        }))}
      />
    </div>
  );
}
