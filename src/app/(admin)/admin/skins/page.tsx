import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { SkinCatalogo } from "@/components/admin/skin-catalogo";
import { AtualizarPrecos } from "@/components/admin/atualizar-precos";

export const metadata: Metadata = { title: "Catálogo de skins" };
export const dynamic = "force-dynamic";

export default async function SkinsPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const skins = await prisma.skinTemplate.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    // As artes de campanha vêm junto: são elas que viram a capa do sorteio.
    include: { artes: { select: { id: true, wear: true, url: true } } },
  });

  return (
    <div className="space-y-5">
      <CabecalhoDeAdmin
        etiqueta="Acervo"
        icone={<Boxes aria-hidden className="h-3 w-3" />}
        titulo="Catálogo de skins"
        descricao="Cadastre a skin uma vez com a ficha e a foto. Ao criar um sorteio, escolher ela do catálogo já preenche o prêmio e a capa, sem redigitar nada nem reenviar a imagem."
        migalha={[{ rotulo: "Admin", href: "/admin" }, { rotulo: "Catálogo" }]}
        acoes={<AtualizarPrecos />}
      />

      <SkinCatalogo
        skins={skins.map((s) => ({
          id: s.id,
          name: s.name,
          imageUrl: s.imageUrl,
          skinRarity: s.skinRarity,
          skinWear: s.skinWear,
          skinFloat: s.skinFloat,
          skinStatTrak: s.skinStatTrak,
          skinSouvenir: s.skinSouvenir,
          skinValueBrl: s.skinValueBrl ? Number(s.skinValueBrl) : null,
          skinCollection: s.skinCollection,
          skinInspectUrl: s.skinInspectUrl,
          desgastesDisponiveis: s.skinWears,
          artes: s.artes,
        }))}
      />
    </div>
  );
}
