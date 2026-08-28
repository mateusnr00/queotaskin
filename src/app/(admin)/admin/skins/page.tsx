import type { Metadata } from "next";
import { Boxes } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { SkinCatalogo } from "@/components/admin/skin-catalogo";

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
      <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Catálogo de skins
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Cadastre a skin uma vez com a ficha e a foto. Ao criar um
              sorteio, escolher ela do catálogo já preenche o prêmio e a capa,
              sem redigitar nada nem reenviar a imagem.
            </p>
          </div>
        </div>
      </div>

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
