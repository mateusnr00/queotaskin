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
      sigilopayClientId: true,
      sigilopayClientSecretEnc: true,
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
  const sigilopayWebhookToken = process.env.SIGILOPAY_WEBHOOK_TOKEN ?? "";
  const sigilopayWebhookUrl =
    appUrl && sigilopayWebhookToken
      ? `${appUrl}/api/webhooks/sigilopay/${sigilopayWebhookToken}`
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
          // Tenant.paymentProvider pode ser MERCADO_PAGO (enum legado), que o
          // form não conhece: qualquer coisa fora da lista cai pra SYNCPAY.
          provider:
            tenant.paymentProvider === "CODEPAY" ||
            tenant.paymentProvider === "SIGILOPAY"
              ? tenant.paymentProvider
              : "SYNCPAY",
          syncpayClientId: tenant.syncpayClientId ?? "",
          syncpayClientSecretConfigured: Boolean(tenant.syncpayClientSecretEnc),
          syncpayBaseUrl: tenant.syncpayBaseUrl ?? "",
          codepayClientId: tenant.codepayClientId ?? "",
          codepayPasswordConfigured: Boolean(tenant.codepayPasswordEnc),
          sigilopayClientId: tenant.sigilopayClientId ?? "",
          sigilopayClientSecretConfigured: Boolean(
            tenant.sigilopayClientSecretEnc
          ),
        }}
        webhookUrls={{
          syncpay: syncpayWebhookUrl,
          codepay: codepayWebhookUrl,
          sigilopay: sigilopayWebhookUrl,
        }}
      />
    </div>
  );
}
