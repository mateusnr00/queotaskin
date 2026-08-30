import type { Metadata } from "next";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import { Megaphone } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { FormularioDeAnuncios } from "@/components/admin/formulario-de-anuncios";

export const metadata: Metadata = { title: "Anúncios" };
export const dynamic = "force-dynamic";

export default async function AnunciosPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      metaPixelId: true,
      googleAnalyticsId: true,
      tiktokPixelId: true,
    },
  });

  return (
    <div className="space-y-5">
      <CabecalhoDeAdmin
        etiqueta="Ajustes"
        icone={<Megaphone aria-hidden className="h-3 w-3" />}
        titulo="Anúncios"
        descricao="Ligue os pixels para medir o que o anúncio traz, e monte o link com as marcas de origem para saber de qual campanha veio cada venda."
        migalha={[
          { rotulo: "Admin", href: "/admin" },
          { rotulo: "Configurações", href: "/admin/configuracoes" },
          { rotulo: "Anúncios" },
        ]}
      />

      <FormularioDeAnuncios
        ids={{
          metaPixelId: tenant?.metaPixelId ?? "",
          googleAnalyticsId: tenant?.googleAnalyticsId ?? "",
          tiktokPixelId: tenant?.tiktokPixelId ?? "",
        }}
      />
    </div>
  );
}
