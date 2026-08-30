import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { MessagesSettingsForm } from "@/components/admin/messages-settings-form";

export const metadata: Metadata = { title: "Mensagens" };

export default async function MensagensPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      paidTitle: true,
      earlyText: true,
      halfwayText: true,
      almostGoneText: true,
      soldOutText: true,
      halfwayPercent: true,
      almostGonePercent: true,
      paidDescription: true,
      paidButtonLabel: true,
      paidImageUrl: true,
      expiredTitle: true,
      expiredDescription: true,
      expiredButtonLabel: true,
      expiredImageUrl: true,
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <CabecalhoDeAdmin
          etiqueta="Ajustes"
          icone={<MessageSquare aria-hidden className="h-3 w-3" />}
          titulo="Mensagens"
          descricao="Personalize o que aparece pros compradores nas telas finais. Campos vazios voltam pro texto padrão."
          migalha={[
            { rotulo: "Admin", href: "/admin" },
            { rotulo: "Configurações", href: "/admin/configuracoes" },
            { rotulo: "Mensagens" },
          ]}
        />
      </div>

      <MessagesSettingsForm
        initial={{
          paidTitle: tenant.paidTitle ?? "",
          earlyText: tenant.earlyText ?? "",
          halfwayText: tenant.halfwayText ?? "",
          almostGoneText: tenant.almostGoneText ?? "",
          soldOutText: tenant.soldOutText ?? "",
          halfwayPercent: tenant.halfwayPercent,
          almostGonePercent: tenant.almostGonePercent,
          paidDescription: tenant.paidDescription ?? "",
          paidButtonLabel: tenant.paidButtonLabel ?? "",
          paidImageUrl: tenant.paidImageUrl ?? "",
          expiredTitle: tenant.expiredTitle ?? "",
          expiredDescription: tenant.expiredDescription ?? "",
          expiredButtonLabel: tenant.expiredButtonLabel ?? "",
          expiredImageUrl: tenant.expiredImageUrl ?? "",
        }}
      />
    </div>
  );
}
