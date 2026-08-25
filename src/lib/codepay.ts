// Cliente CodePay (gateway brasileiro de PIX cash-in).
//
// Base URL: https://production.codetech.technology — confirmada nos curls
// passados pelo painel codepay.one. Override via CODEPAY_BASE_URL se eles
// trocarem.
//
// Auth: troca clientId + password (== "SecretKey" do painel) por um JWT
// via POST /cli/client/authenticate. O JWT vem com `exp` em ~8h. Cache
// in-memory por instância serverless.
//
// Cash-in (Pix dinâmico, com valor): POST /cli/payment/pix/generate-pix
//   body: { value, externalId, expiration }
//   resp: { data: { pix, paymentId, movId, ... } } — `pix` é o copia-cola.
//
// Webhook: a CodePay envia POST pra URL configurada GLOBALMENTE no painel
// dela (não tem campo de webhook na request). O usuário precisa cadastrar
// `${APP_URL}/api/webhooks/codepay/${CODEPAY_WEBHOOK_TOKEN}` no painel.

import { walkValues, classifyStatus } from "@/lib/syncpay";

const DEFAULT_API_BASE = "https://production.codetech.technology";

function apiBase(): string {
  const raw = process.env.CODEPAY_BASE_URL;
  if (raw && raw.length > 0) return raw.replace(/\/$/, "");
  return DEFAULT_API_BASE;
}

export interface CodePayCredentials {
  clientId: string;
  password: string;
}

export interface PixChargeResponse {
  pix_code: string;
  identifier: string;
  message?: string;
}

interface CreatePixChargeInput {
  amount: number;
  externalRef: string;
  /** Segundos pra expiração no gateway. 0 = default deles (24h). */
  expirationSeconds?: number;
}

// Cache do JWT por clientId. Cada tenant pode ter um clientId diferente,
// então a chave do cache é o próprio clientId. Map per-instância serverless.
const tokenCache = new Map<string, { token: string; exp: number }>();

async function getAccessToken(creds: CodePayCredentials): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(creds.clientId);
  if (cached && cached.exp > now + 60_000) return cached.token;

  const res = await fetch(`${apiBase()}/cli/client/authenticate`, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId: creds.clientId,
      password: creds.password,
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `CodePay rejeitou as credenciais (${res.status}). Confira clientId/password no painel. Resposta: ${text}`
      );
    }
    throw new Error(`CodePay auth falhou ${res.status}: ${text}`);
  }

  let parsed: { success?: boolean; data?: { token?: string } };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`CodePay auth retornou JSON inválido: ${text}`);
  }
  const token = parsed?.data?.token;
  if (!token) {
    throw new Error(`CodePay auth não retornou token: ${text}`);
  }

  // Extrai exp do payload do JWT pra TTL real (em vez de chutar 1h).
  const exp = jwtExpMs(token) ?? now + 60 * 60 * 1000;
  tokenCache.set(creds.clientId, { token, exp });
  return token;
}

function jwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64").toString("utf8")
    ) as { exp?: number };
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    /* ignore — usa default */
  }
  return null;
}

export async function createPixCharge(
  creds: CodePayCredentials,
  input: CreatePixChargeInput
): Promise<PixChargeResponse> {
  const token = await getAccessToken(creds);

  // OpenAPI da CodePay: expiration é em SEGUNDOS, e 0 = "default 24h".
  // Confiar no default deles ao invés de calcular pra ficar consistente.
  const expiration = input.expirationSeconds ?? 0;

  const body = {
    expiration,
    value: input.amount,
    externalId: input.externalRef,
  };

  const res = await fetch(`${apiBase()}/cli/payment/pix/generate-pix`, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      // Token expirou no meio do request; invalida cache pra próxima tentar
      // de novo. Não tenta retry aqui — deixa pra camada superior.
      tokenCache.delete(creds.clientId);
    }
    throw new Error(`CodePay generate-pix falhou ${res.status}: ${text}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`CodePay generate-pix retornou JSON inválido: ${text}`);
  }

  const data = (parsed as { data?: Record<string, unknown> })?.data ?? {};
  const pix = typeof data.pix === "string" ? data.pix : null;
  const paymentId =
    typeof data.paymentId === "string" ? data.paymentId : null;

  if (!pix || !paymentId) {
    throw new Error(
      `CodePay generate-pix sem pix/paymentId reconhecível: ${text}`
    );
  }

  return { pix_code: pix, identifier: paymentId };
}

// Extrai identifier + status de um payload de webhook da CodePay. Como a
// doc deles não documenta o shape exato do webhook, usamos o mesmo walker
// recursivo do SyncPay — procura keys "id-like" (paymentId, movId, id, ...)
// e qualquer key terminando em "status".
const ID_KEYS = new Set([
  "paymentid",
  "movid",
  "id",
  "identifier",
  "externalid",
  "external_id",
]);

export function extractWebhookInfo(raw: unknown): {
  identifier: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
} {
  let identifier: string | null = null;
  let bestStatus: "PENDING" | "APPROVED" | "REJECTED" = "PENDING";

  walkValues(raw, (key, value) => {
    const lk = key.toLowerCase();
    if (identifier === null && ID_KEYS.has(lk)) {
      if (typeof value === "string" && value.length > 0) identifier = value;
      else if (typeof value === "number") identifier = String(value);
    }
    if (lk === "status" || lk.endsWith("status") || lk.endsWith("_status")) {
      if (typeof value === "string") {
        const classified = classifyStatus(value);
        if (classified === "APPROVED") bestStatus = "APPROVED";
        else if (classified === "REJECTED" && bestStatus === "PENDING")
          bestStatus = "REJECTED";
      }
    }
  });

  return { identifier, status: bestStatus };
}
