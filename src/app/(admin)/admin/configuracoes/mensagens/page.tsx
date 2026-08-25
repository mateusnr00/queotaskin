import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

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
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Mensagens
        </h1>
        <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/admin/configuracoes" className="hover:text-foreground">
            Configurações
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Mensagens</span>
        </nav>
        <p className="mt-2 text-sm text-muted-foreground">
          Personalize o que aparece pros compradores nas telas finais.
          Campos vazios voltam pro texto padrão.
        </p>
      </div>

      <MessagesSettingsForm
        initial={{
          paidTitle: tenant.paidTitle ?? "",
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
