import type { Metadata } from "next";
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
      <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Anúncios
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Ligue os pixels para medir o que o anúncio traz, e monte o link
              com as marcas de origem para saber de qual campanha veio cada
              venda.
            </p>
          </div>
        </div>
      </div>

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
