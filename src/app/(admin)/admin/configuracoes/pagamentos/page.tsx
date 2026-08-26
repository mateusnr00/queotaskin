import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { PaymentSettingsForm } from "@/components/admin/payment-settings-form";

export const metadata: Metadata = { title: "Pagamentos" };

export default async function PagamentosPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      paymentProvider: true,
      syncpayClientId: true,
      syncpayClientSecretEnc: true,
      syncpayBaseUrl: true,
      codepayClientId: true,
      codepayPasswordEnc: true,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const syncpayWebhookToken = process.env.SYNCPAY_WEBHOOK_TOKEN ?? "";
  const codepayWebhookToken = process.env.CODEPAY_WEBHOOK_TOKEN ?? "";
  const syncpayWebhookUrl =
    appUrl && syncpayWebhookToken
      ? `${appUrl}/api/webhooks/syncpay/${syncpayWebhookToken}`
      : null;
  const codepayWebhookUrl =
    appUrl && codepayWebhookToken
      ? `${appUrl}/api/webhooks/codepay/${codepayWebhookToken}`
      : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Pagamentos
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
          <span>Pagamentos</span>
        </nav>
      </div>

      <PaymentSettingsForm
        initial={{
          // Tenant.paymentProvider pode ser MERCADO_PAGO (enum legado), mas
          // o form só conhece SYNCPAY/CODEPAY, caímos pra SYNCPAY se vier
          // qualquer outra coisa.
          provider:
            tenant.paymentProvider === "CODEPAY" ? "CODEPAY" : "SYNCPAY",
          syncpayClientId: tenant.syncpayClientId ?? "",
          syncpayClientSecretConfigured: Boolean(tenant.syncpayClientSecretEnc),
          syncpayBaseUrl: tenant.syncpayBaseUrl ?? "",
          codepayClientId: tenant.codepayClientId ?? "",
          codepayPasswordConfigured: Boolean(tenant.codepayPasswordEnc),
        }}
        webhookUrls={{
          syncpay: syncpayWebhookUrl,
          codepay: codepayWebhookUrl,
        }}
      />
    </div>
  );
}
