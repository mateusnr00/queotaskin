import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { CreditCard } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { PaymentSettingsForm } from "@/components/admin/payment-settings-form";
import { TaxasDoGateway } from "@/components/admin/taxas-do-gateway";
import type { FaixaDeTaxa } from "@/lib/taxa-de-gateway";

export const metadata: Metadata = { title: "Pagamentos" };

export default async function PagamentosPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const taxas = await prisma.taxaDeGateway.findMany({
    where: { tenantId },
    orderBy: [{ provider: "asc" }, { apartirDe: "asc" }],
    select: { provider: true, apartirDe: true, percentual: true, fixo: true },
  });
  const taxasPorGateway: Record<string, FaixaDeTaxa[]> = {};
  for (const t of taxas) {
    (taxasPorGateway[t.provider] ??= []).push({
      apartirDe: Number(t.apartirDe),
      percentual: Number(t.percentual),
      fixo: Number(t.fixo),
    });
  }

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
      nexuspagApiKeyEnc: true,
      nexuspagWebhookSecretEnc: true,
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
  const nexuspagWebhookToken = process.env.NEXUSPAG_WEBHOOK_TOKEN ?? "";
  const nexuspagWebhookUrl =
    appUrl && nexuspagWebhookToken
      ? `${appUrl}/api/webhooks/nexuspag/${nexuspagWebhookToken}`
      : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <CabecalhoDeAdmin
          etiqueta="Ajustes"
          icone={<CreditCard aria-hidden className="h-3 w-3" />}
          titulo="Pagamentos"
          migalha={[
            { rotulo: "Admin", href: "/admin" },
            { rotulo: "Configurações", href: "/admin/configuracoes" },
            { rotulo: "Pagamentos" },
          ]}
        />
      </div>

      <TaxasDoGateway taxasPorGateway={taxasPorGateway} />

      <PaymentSettingsForm
        initial={{
          // Tenant.paymentProvider pode ser MERCADO_PAGO (enum legado), que o
          // form não conhece: qualquer coisa fora da lista cai pra SYNCPAY.
          provider:
            tenant.paymentProvider === "CODEPAY" ||
            tenant.paymentProvider === "SIGILOPAY" ||
            tenant.paymentProvider === "NEXUSPAG"
              ? tenant.paymentProvider
              : "SYNCPAY",
          syncpayClientId: tenant.syncpayClientId ?? "",
          syncpayClientSecretConfigured: Boolean(tenant.syncpayClientSecretEnc),
          syncpayBaseUrl: tenant.syncpayBaseUrl ?? "",
          codepayClientId: tenant.codepayClientId ?? "",
          codepayPasswordConfigured: Boolean(tenant.codepayPasswordEnc),
          sigilopayClientId: tenant.sigilopayClientId ?? "",
          sigilopayClientSecretConfigured: Boolean(
            tenant.sigilopayClientSecretEnc,
          ),
          nexuspagApiKeyConfigured: Boolean(tenant.nexuspagApiKeyEnc),
          nexuspagWebhookSecretConfigured: Boolean(
            tenant.nexuspagWebhookSecretEnc,
          ),
        }}
        webhookUrls={{
          syncpay: syncpayWebhookUrl,
          codepay: codepayWebhookUrl,
          sigilopay: sigilopayWebhookUrl,
          nexuspag: nexuspagWebhookUrl,
        }}
      />
    </div>
  );
}
