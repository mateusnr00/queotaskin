// Abstração de provider de PIX por sorteio.
//
// Modelo:
// - Credenciais ficam no Tenant (SyncPay + CodePay, ambos podem coexistir).
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
  createPixCharge as codepayCreatePix,
  type CodePayCredentials,
} from "@/lib/codepay";

export interface PaymentProviderClient {
  /** Nome canônico, vai pro Payment.provider e pra URL do webhook. */
  name: PaymentProviderEnum;
  /** Path do webhook esperado por esse gateway, p.ex. "syncpay" ou "codepay". */
  webhookPath: string;
  createPixCharge(input: CreatePixInput): Promise<{
    pixCode: string;
    identifier: string;
  }>;
  /** Polling opcional, só SyncPay implementa hoje. */
  getStatus?(
    identifier: string
  ): Promise<{ status: "PENDING" | "APPROVED" | "REJECTED"; raw: unknown }>;
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

// Credenciais do tenant já decriptadas. Os dois objetos são independentes,
// um tenant pode ter SyncPay+CodePay configurados ao mesmo tempo e cada
// sorteio escolhe qual usar.
interface TenantCredentials {
  defaultProvider: PaymentProviderEnum;
  syncpay?: SyncPayCredentials;
  codepay?: CodePayCredentials;
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
      codepayClientId: true,
      codepayPasswordEnc: true,
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
    Boolean(tenant.codepayPasswordEnc);
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

  let codepay: CodePayCredentials | undefined;
  if (tenant.codepayClientId && tenant.codepayPasswordEnc) {
    try {
      codepay = {
        clientId: tenant.codepayClientId,
        password: decryptSecret(tenant.codepayPasswordEnc),
      };
    } catch (err) {
      return {
        ok: false,
        error: `Falha ao decriptar credencial CodePay: ${
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
      codepay,
    },
  };
}

function buildProvider(
  effective: PaymentProviderEnum,
  creds: TenantCredentials
): ProviderResolution {
  if (effective === "CODEPAY") {
    if (!creds.codepay) {
      return {
        ok: false,
        error:
          "CodePay selecionada mas sem credenciais. Configure em Admin → Configurações → Pagamentos.",
        code: "PROVIDER_NOT_CONFIGURED",
      };
    }
    const cpCreds = creds.codepay;
    return {
      ok: true,
      provider: {
        name: "CODEPAY",
        webhookPath: "codepay",
        async createPixCharge(input) {
          const charge = await codepayCreatePix(cpCreds, {
            amount: input.amount,
            externalRef: input.externalRef,
            // CodePay não tem campo de webhook por request, é global no painel.
          });
          return { pixCode: charge.pix_code, identifier: charge.identifier };
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
