// Abstração de provider de PIX por sorteio.
//
// Modelo:
// - Credenciais ficam no Tenant, e os gateways coexistem: um tenant pode ter
//   os quatro configurados ao mesmo tempo.
// - tenant.paymentProvider = gateway padrão pra novos sorteios.
// - raffle.paymentProvider = override por sorteio (NULL = usa o do tenant).
//
// O factory `getProviderForRaffle` carrega tudo, decripta secrets, decide
// qual gateway usar pra ESSE sorteio e devolve um cliente pronto. O resto
// do app só chama `provider.createPixCharge(...)`, não importa qual é.

import type { PaymentProvider as PaymentProviderEnum } from "@prisma/client";

import { prisma } from "@/lib/db";
import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import {
  createPixCharge as syncpayCreatePix,
  getPixStatus as syncpayGetStatus,
  type SyncPayCredentials,
} from "@/lib/syncpay";
import {
  consultarDeposito as horseConsulta,
  criarCobrancaPix as horseCriaPix,
  type HorsePayCredentials,
} from "@/lib/horsepay";
import {
  consultarCobranca as nexusConsulta,
  criarCobrancaPix as nexusCriaPix,
  type NexusPagCredentials,
} from "@/lib/nexuspag";
import {
  consultarTransacao as sigilopayConsulta,
  criarCobrancaPix as sigilopayCriaPix,
  type SigiloPayCredentials,
} from "@/lib/sigilopay";

export interface PaymentProviderClient {
  /** Nome canônico, vai pro Payment.provider e pra URL do webhook. */
  name: PaymentProviderEnum;
  /** Path do webhook esperado por esse gateway, p.ex. "syncpay" ou "horsepay". */
  webhookPath: string;
  createPixCharge(input: CreatePixInput): Promise<{
    pixCode: string;
    identifier: string;
  }>;
  /** Polling opcional. Sustenta o botão "já paguei" de quem implementa. */
  getStatus?(
    identifier: string
  ): Promise<{
    status: "PENDING" | "APPROVED" | "REJECTED";
    raw: unknown;
    /** Valor BRUTO em reais, quando o provider expõe (hoje: NexusPag). */
    amountBrl?: number | null;
    /** Identidade da transação no gateway, para verificação forte. */
    identity?: { id?: string | null; txid?: string | null; externalId?: string | null };
  }>;
}

export interface CreatePixInput {
  amount: number;
  description?: string;
  webhookUrl: string;
  ip: string;
  externalRef: string;
  expiresAt: Date;
  client: {
    name: string;
    email: string;
    cpf: string;
    phone: string;
  };
}

// Credenciais do tenant já decriptadas. Os objetos são independentes: um
// tenant pode ter todos os gateways configurados ao mesmo tempo e cada sorteio
// escolhe qual usar.
interface TenantCredentials {
  defaultProvider: PaymentProviderEnum;
  syncpay?: SyncPayCredentials;
  sigilopay?: SigiloPayCredentials;
  nexuspag?: NexusPagCredentials;
  horsepay?: HorsePayCredentials;
}

export type ProviderResolution =
  | { ok: true; provider: PaymentProviderClient }
  | { ok: false; error: string; code: ProviderErrorCode };

export type ProviderErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "ENCRYPTION_KEY_MISSING";

export async function getProviderForRaffle(
  raffleId: string
): Promise<ProviderResolution> {
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { tenantId: true, paymentProvider: true },
  });
  if (!raffle) {
    return {
      ok: false,
      error: "Sorteio não encontrado",
      code: "PROVIDER_NOT_CONFIGURED",
    };
  }
  const creds = await loadTenantCredentials(raffle.tenantId);
  if (!creds.ok) return creds;

  // Provider efetivo: override do sorteio > default do tenant.
  const effective = raffle.paymentProvider ?? creds.creds.defaultProvider;

  return buildProvider(effective, creds.creds);
}

async function loadTenantCredentials(tenantId: string): Promise<
  | { ok: true; creds: TenantCredentials }
  | { ok: false; error: string; code: ProviderErrorCode }
> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      paymentProvider: true,
      syncpayClientId: true,
      syncpayClientSecretEnc: true,
      syncpayBaseUrl: true,
      sigilopayClientId: true,
      sigilopayClientSecretEnc: true,
      sigilopayBaseUrl: true,
      nexuspagApiKeyEnc: true,
      nexuspagWebhookSecretEnc: true,
      nexuspagBaseUrl: true,
      horsepayClientKey: true,
      horsepayClientSecretEnc: true,
      horsepayWebhookSecretEnc: true,
      horsepayBaseUrl: true,
    },
  });
  if (!tenant) {
    return {
      ok: false,
      error: "Tenant não encontrado",
      code: "PROVIDER_NOT_CONFIGURED",
    };
  }

  const hasAnySecret =
    Boolean(tenant.syncpayClientSecretEnc) ||
    Boolean(tenant.sigilopayClientSecretEnc) ||
    Boolean(tenant.nexuspagApiKeyEnc) ||
    Boolean(tenant.horsepayClientSecretEnc);
  if (hasAnySecret && !isEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "PAYMENT_SECRET_ENCRYPTION_KEY não definida no Vercel. Impossível decriptar credenciais.",
      code: "ENCRYPTION_KEY_MISSING",
    };
  }

  let syncpay: SyncPayCredentials | undefined;
  if (tenant.syncpayClientId && tenant.syncpayClientSecretEnc) {
    try {
      syncpay = {
        clientId: tenant.syncpayClientId,
        clientSecret: decryptSecret(tenant.syncpayClientSecretEnc),
        baseUrl: tenant.syncpayBaseUrl ?? undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Falha ao decriptar credencial SyncPay: ${
          err instanceof Error ? err.message : String(err)
        }`,
        code: "ENCRYPTION_KEY_MISSING",
      };
    }
  }

  let sigilopay: SigiloPayCredentials | undefined;
  if (tenant.sigilopayClientId && tenant.sigilopayClientSecretEnc) {
    try {
      sigilopay = {
        clientId: tenant.sigilopayClientId,
        clientSecret: decryptSecret(tenant.sigilopayClientSecretEnc),
        baseUrl: tenant.sigilopayBaseUrl ?? undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Falha ao decriptar credencial SigiloPay: ${
          err instanceof Error ? err.message : String(err)
        }`,
        code: "ENCRYPTION_KEY_MISSING",
      };
    }
  }

  let nexuspag: NexusPagCredentials | undefined;
  if (tenant.nexuspagApiKeyEnc) {
    try {
      nexuspag = {
        apiKey: decryptSecret(tenant.nexuspagApiKeyEnc),
        webhookSecret: tenant.nexuspagWebhookSecretEnc
          ? decryptSecret(tenant.nexuspagWebhookSecretEnc)
          : undefined,
        baseUrl: tenant.nexuspagBaseUrl ?? undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Falha ao decriptar credencial NexusPag: ${
          err instanceof Error ? err.message : String(err)
        }`,
        code: "ENCRYPTION_KEY_MISSING",
      };
    }
  }

  let horsepay: HorsePayCredentials | undefined;
  if (tenant.horsepayClientKey && tenant.horsepayClientSecretEnc) {
    try {
      horsepay = {
        clientKey: tenant.horsepayClientKey,
        clientSecret: decryptSecret(tenant.horsepayClientSecretEnc),
        webhookSecret: tenant.horsepayWebhookSecretEnc
          ? decryptSecret(tenant.horsepayWebhookSecretEnc)
          : undefined,
        baseUrl: tenant.horsepayBaseUrl ?? undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Falha ao decriptar credencial HorsePay: ${
          err instanceof Error ? err.message : String(err)
        }`,
        code: "ENCRYPTION_KEY_MISSING",
      };
    }
  }

  return {
    ok: true,
    creds: {
      defaultProvider: tenant.paymentProvider,
      syncpay,
      sigilopay,
      nexuspag,
      horsepay,
    },
  };
}

function buildProvider(
  effective: PaymentProviderEnum,
  creds: TenantCredentials
): ProviderResolution {
  if (effective === "HORSEPAY") {
    if (!creds.horsepay) {
      return {
        ok: false,
        error:
          "HorsePay selecionada mas sem credenciais. Configure em Admin, Configurações, Pagamentos.",
        code: "PROVIDER_NOT_CONFIGURED",
      };
    }
    const hpCreds = creds.horsepay;
    return {
      ok: true,
      provider: {
        name: "HORSEPAY",
        webhookPath: "horsepay",
        async createPixCharge(input) {
          const cobranca = await horseCriaPix(hpCreds, {
            amount: input.amount,
            payerName: input.client.name,
            // A reserva volta no callback como client_reference_id, e é o que
            // liga a notificação deles à compra daqui.
            clientReferenceId: input.externalRef,
            callbackUrl: input.webhookUrl,
            phone: input.client.phone.replace(/\D/g, "") || undefined,
          });
          return {
            pixCode: cobranca.pixCode,
            identifier: cobranca.transactionId,
          };
        },
        async getStatus(identifier) {
          return horseConsulta(hpCreds, identifier);
        },
      },
    };
  }

  if (effective === "NEXUSPAG") {
    if (!creds.nexuspag) {
      return {
        ok: false,
        error:
          "NexusPag selecionada mas sem credenciais. Configure em Admin, Configurações, Pagamentos.",
        code: "PROVIDER_NOT_CONFIGURED",
      };
    }
    const npCreds = creds.nexuspag;
    return {
      ok: true,
      provider: {
        name: "NEXUSPAG",
        webhookPath: "nexuspag",
        async createPixCharge(input) {
          const cobranca = await nexusCriaPix(npCreds, {
            amount: input.amount,
            // A reserva vira a chave de idempotência deles: repetir a chamada
            // devolve a cobrança que já existe em vez de criar outra.
            externalId: input.externalRef,
            descricao: input.description,
            webhookUrl: input.webhookUrl,
            expiresAt: input.expiresAt,
          });
          return {
            pixCode: cobranca.pixCode,
            identifier: cobranca.transactionId,
          };
        },
        async getStatus(identifier) {
          return nexusConsulta(npCreds, identifier);
        },
      },
    };
  }

  if (effective === "SIGILOPAY") {
    if (!creds.sigilopay) {
      return {
        ok: false,
        error:
          "SigiloPay selecionada mas sem credenciais. Configure em Admin, Configurações, Pagamentos.",
        code: "PROVIDER_NOT_CONFIGURED",
      };
    }
    const spCreds = creds.sigilopay;
    return {
      ok: true,
      provider: {
        name: "SIGILOPAY",
        webhookPath: "sigilopay",
        async createPixCharge(input) {
          const cobranca = await sigilopayCriaPix(spCreds, {
            amount: input.amount,
            // O identifier deles precisa ser único por transação, e a reserva
            // já é: uma reserva tem no máximo um pagamento.
            identifier: input.externalRef,
            callbackUrl: input.webhookUrl,
            expiresAt: input.expiresAt,
            client: input.client,
          });
          return {
            pixCode: cobranca.pixCode,
            identifier: cobranca.transactionId,
          };
        },
        async getStatus(identifier) {
          return sigilopayConsulta(spCreds, identifier);
        },
      },
    };
  }

  // SYNCPAY (default). syncpay creds podem ser undefined, nesse caso o
  // client SyncPay cai pros env vars legados (SYNCPAY_CLIENT_ID/SECRET).
  const spCreds = creds.syncpay;
  return {
    ok: true,
    provider: {
      name: "SYNCPAY",
      webhookPath: "syncpay",
      async createPixCharge(input) {
        const charge = await syncpayCreatePix(
          {
            amount: input.amount,
            description: input.description,
            webhookUrl: input.webhookUrl,
            ip: input.ip,
            externalRef: input.externalRef,
            expiresAt: input.expiresAt,
            client: input.client,
          },
          spCreds
        );
        return { pixCode: charge.pix_code, identifier: charge.identifier };
      },
      async getStatus(identifier) {
        return syncpayGetStatus(identifier, spCreds);
      },
    },
  };
}
