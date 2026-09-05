import type { Metadata } from "next";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import { Bell } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { FormularioDeAvisos } from "@/components/admin/formulario-de-avisos";

export const metadata: Metadata = { title: "Avisos" };
export const dynamic = "force-dynamic";

export default async function AvisosPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      avisoAtivo: true,
      avisoAspecto: true,
      avisoImagemUrl: true,
      avisoLinkUrl: true,
      avisoFundoOpacidade: true,
    },
  });

  const aspecto = tenant?.avisoAspecto === "9:16" ? "9:16" : "3:5";

  return (
    <div className="max-w-3xl space-y-5">
      <CabecalhoDeAdmin
        etiqueta="Ajustes"
        icone={<Bell aria-hidden className="h-3 w-3" />}
        titulo="Avisos"
        descricao="Um pop-up de imagem para anunciar promoção. Suba a arte (3:5 ou 9:16), opcionalmente um link, e ligue. No site ela aparece com um “X” para fechar e não volta a incomodar até você trocar a imagem."
        migalha={[
          { rotulo: "Admin", href: "/admin" },
          { rotulo: "Configurações", href: "/admin/configuracoes" },
          { rotulo: "Avisos" },
        ]}
      />

      <FormularioDeAvisos
        initial={{
          avisoAtivo: tenant?.avisoAtivo ?? false,
          avisoAspecto: aspecto,
          avisoImagemUrl: tenant?.avisoImagemUrl ?? null,
          avisoLinkUrl: tenant?.avisoLinkUrl ?? null,
          avisoFundoOpacidade: tenant?.avisoFundoOpacidade ?? 70,
        }}
      />
    </div>
  );
}
