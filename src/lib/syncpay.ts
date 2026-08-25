// Cliente SyncPay.
//
// Host: configurável via SYNCPAY_BASE_URL. O endereço varia entre contas
// (api.syncpayments.com.br, api.syncpay.pro, etc); cada conta vê o seu
// no painel app.syncpayments.com.br/seller/developer-api. Default abaixo
// é o que responde pra maioria dos clientes BR.
//
// Auth: troca client_id + client_secret por Bearer token (1h) via
//   POST /api/partner/v1/auth-token  (body JSON)
// Cash-in (cobrança Pix):
//   POST /v1/gateway/api  com items/customer/amount/postbackUrl
// Status:
//   GET  /s1/getTransaction/api/getTransactionStatus.php?id_transaction=…

const DEFAULT_API_BASE = "https://api.syncpayments.com.br";

// Credenciais por tenant. Quando vazio, cai pros env vars legados
// (SYNCPAY_CLIENT_ID/SECRET/BASE_URL) — compat com setup single-tenant.
export interface SyncPayCredentials {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

function resolveCreds(
  override?: Partial<SyncPayCredentials>
): SyncPayCredentials {
  const clientId =
    override?.clientId || process.env.SYNCPAY_CLIENT_ID || "";
  const clientSecret =
    override?.clientSecret || process.env.SYNCPAY_CLIENT_SECRET || "";
  const baseUrl =
    override?.baseUrl || process.env.SYNCPAY_BASE_URL || DEFAULT_API_BASE;
  return { clientId, clientSecret, baseUrl };
}

function normalizeBase(url: string | undefined): string {
  const raw = url || DEFAULT_API_BASE;
  return raw.replace(/\/$/, "");
}

export interface PixCashInClient {
  name: string;
  email: string;
  cpf: string;
  phone: string;
}

export interface PixChargeResponse {
  /** Texto livre de retorno do provider — útil pra log. */
  message?: string;
  /** EMV/BR Code (copia-cola) do Pix. Usado pra gerar QR Code também. */
  pix_code: string;
  /** ID da transação no SyncPay. Guardar como Payment.externalId. */
  identifier: string;
}


export function isSyncPayConfigured(creds?: Partial<SyncPayCredentials>): boolean {
  const resolved = resolveCreds(creds);
  return Boolean(resolved.clientId && resolved.clientSecret);
}

// Cache do token por clientId — múltiplos tenants têm clientIds diferentes
// e não podem compartilhar token.
const tokenCache = new Map<string, { token: string; exp: number }>();

async function getAccessToken(creds: SyncPayCredentials): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(creds.clientId);
  if (cached && cached.exp > now + 60_000) return cached.token;

  const base = normalizeBase(creds.baseUrl);
  const res = await fetch(`${base}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        `SyncPay rejeitou as credenciais (401). Confira as credenciais do gateway no painel admin (ou as env vars SYNCPAY_CLIENT_ID/SECRET). Resposta: ${body}`
      );
    }
    throw new Error(`SyncPay auth falhou ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("SyncPay auth não retornou access_token");
  }
  const ttlMs = data.expires_in ? data.expires_in * 1000 : 60 * 60 * 1000;
  tokenCache.set(creds.clientId, {
    token: data.access_token,
    exp: now + ttlMs,
  });
  return data.access_token;
}

interface CreatePixChargeInput {
  amount: number; // R$ (decimal), conforme docs do provider
  description?: string;
  webhookUrl: string;
  /** IP do cliente final (header x-forwarded-for). Gateway exige. */
  ip: string;
  /** Referência externa (ex.: reservation.id). Gateway exige. */
  externalRef: string;
  /** Data de expiração da cobrança Pix (ISO YYYY-MM-DD). */
  expiresAt: Date;
  client: PixCashInClient;
}

// Resposta do gateway vem em formatos imprevisíveis (com/sem wrapper
// `data`, nomes de campos variando, IDs numéricos ou string). Em vez de
// listar todos os caminhos possíveis, fazemos walk recursivo e usamos
// assinatura: o EMV BR Code SEMPRE começa com "00020" — então achamos
// pix_code procurando essa marca. Pro identifier, varremos keys
// conhecidas em qualquer profundidade.

const ID_KEYS = new Set([
  "id",
  "identifier",
  "idtransaction", // <- shape do SyncPay/onlyup: { idTransaction }
  "transaction_id",
  "transactionid",
  "reference_id",
  "referenceid",
  "externaref",
  "externalref",
  "paymentid",
  "chargeid",
]);

export function walkValues(
  raw: unknown,
  visit: (key: string, value: unknown) => void,
  depth = 0
): void {
  if (depth > 8 || raw === null || raw === undefined) return;
  if (Array.isArray(raw)) {
    for (const item of raw) walkValues(item, visit, depth + 1);
    return;
  }
  if (typeof raw !== "object") return;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    visit(k, v);
    if (v !== null && typeof v === "object") walkValues(v, visit, depth + 1);
  }
}

function extractFromResponse(raw: unknown): {
  pix_code: string | null;
  identifier: string | null;
  message: string | null;
} {
  if (!raw || typeof raw !== "object") {
    return { pix_code: null, identifier: null, message: null };
  }

  let pixCode: string | null = null;
  let identifier: string | null = null;
  let message: string | null = null;

  walkValues(raw, (key, value) => {
    // pix_code: qualquer string que seja um EMV BR Code (começa com "00020").
    if (
      pixCode === null &&
      typeof value === "string" &&
      value.startsWith("00020")
    ) {
      pixCode = value;
    }
    // identifier: chave canônica em qualquer profundidade, string ou número.
    if (identifier === null && ID_KEYS.has(key.toLowerCase())) {
      if (typeof value === "string" && value.length > 0) identifier = value;
      else if (typeof value === "number") identifier = String(value);
    }
    if (message === null && key.toLowerCase() === "message" && typeof value === "string") {
      message = value;
    }
  });

  return { pix_code: pixCode, identifier, message };
}

export async function createPixCharge(
  input: CreatePixChargeInput,
  credsOverride?: Partial<SyncPayCredentials>
): Promise<PixChargeResponse> {
  const creds = resolveCreds(credsOverride);
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error(
      "SyncPay não configurado (defina credenciais no painel admin ou SYNCPAY_CLIENT_ID/SECRET)"
    );
  }

  const token = await getAccessToken(creds);
  const base = normalizeBase(creds.baseUrl);

  // Body conforme validação do /v1/gateway/api (descoberta empiricamente
  // pelos 422 retornados):
  // - ip, customer.externaRef (nome com typo no servidor), customer.cpf,
  //   customer.phone e customer.address.* são todos obrigatórios.
  // - pix.expiresInDays apesar do nome é validado como `date` no servidor —
  //   manda como ISO YYYY-MM-DD pra passar.
  // - Endereço não temos no cadastro do cliente; uso placeholders válidos.
  //   Se for um problema de compliance, ampliamos o cadastro depois.
  const expiresDate = input.expiresAt.toISOString().slice(0, 10);
  const body = {
    amount: input.amount,
    postbackUrl: input.webhookUrl,
    traceable: true,
    ip: input.ip,
    pix: { expiresInDays: expiresDate },
    items: [
      {
        title: input.description ?? "Reserva de rifa",
        quantity: 1,
        tangible: false,
        unitPrice: input.amount,
      },
    ],
    customer: {
      name: input.client.name,
      email: input.client.email,
      cpf: input.client.cpf,
      phone: input.client.phone || "11999999999",
      externaRef: input.externalRef,
      address: {
        country: "BR",
        state: "SP",
        city: "São Paulo",
        neighborhood: "Centro",
        street: "Rua Principal",
        streetNumber: "100",
        zipCode: "01000000",
      },
    },
  };

  const res = await fetch(`${base}/v1/gateway/api`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        "Gateway sob rate limit (429). Aguarde ~30 segundos antes de tentar novamente."
      );
    }
    throw new Error(`SyncPay cash-in falhou ${res.status}: ${text}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`SyncPay cash-in retornou JSON inválido: ${text}`);
  }

  const { pix_code, identifier, message } = extractFromResponse(parsed);
  if (!pix_code || !identifier) {
    throw new Error(
      `SyncPay cash-in retornou sem pix_code/identifier reconhecível: ${text}`
    );
  }

  return { pix_code, identifier, message: message ?? undefined };
}

// Consulta o status de uma cobrança Pix. Tenta múltiplos endpoints
// porque a doc oficial é ambígua sobre o caminho exato — o primeiro 2xx
// vence. Usa Bearer auth (mesma do cash-in).
//
// Retorna o status já classificado (PENDING/APPROVED/REJECTED) e o
// payload bruto pra debug.
export async function getPixStatus(
  identifier: string,
  credsOverride?: Partial<SyncPayCredentials>
): Promise<{
  status: "PENDING" | "APPROVED" | "REJECTED";
  raw: unknown;
}> {
  const creds = resolveCreds(credsOverride);
  const token = await getAccessToken(creds);
  const base = normalizeBase(creds.baseUrl);

  const candidates = [
    `${base}/api/partner/v1/transaction/${encodeURIComponent(identifier)}`,
    `${base}/api/partner/v1/transactions/${encodeURIComponent(identifier)}`,
    `${base}/v1/gateway/api/${encodeURIComponent(identifier)}`,
    `${base}/s1/getTransaction/api/getTransactionStatus.php?id_transaction=${encodeURIComponent(identifier)}`,
  ];

  let lastError = "";
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      if (!res.ok) {
        lastError = `${url} → ${res.status}`;
        continue;
      }
      const raw = await res.json().catch(() => null);
      if (raw === null) continue;
      const { status } = extractStatusInfo(raw);
      return { status, raw };
    } catch (err) {
      lastError = `${url} → ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(`SyncPay status: nenhum endpoint respondeu. Último erro: ${lastError}`);
}

// Considera o pagamento confirmado quando o SyncPay retorna um destes status.
// `paid_out` é o status real que a SyncPay/OnlyUp envia no webhook quando
// o cliente paga (visto em produção: { "status": "PAID_OUT", end_to_end: "E..." }).
// Os outros são variantes vistas em outros gateways brasileiros.
const APPROVED_STATUSES = new Set([
  "paid",
  "paid_out",
  "approved",
  "completed",
  "success",
]);
const FAILED_STATUSES = new Set([
  "refused",
  "rejected",
  "cancelled",
  "canceled",
  "failed",
  "expired",
]);

export function classifyStatus(
  raw: string | undefined | null
): "PENDING" | "APPROVED" | "REJECTED" {
  const s = (raw ?? "").toLowerCase();
  if (APPROVED_STATUSES.has(s)) return "APPROVED";
  if (FAILED_STATUSES.has(s)) return "REJECTED";
  return "PENDING";
}

// Extrai identifier + status de qualquer payload (webhook ou response
// do getStatus). O SyncPay devolve `idTransaction` + `status_transaction`,
// mas outros gateways usam variantes — walker recursivo cobre todos.
export function extractStatusInfo(raw: unknown): {
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
    // Qualquer chave que termine em "status" e tenha valor string vira
    // candidato. Promove pra APPROVED/REJECTED se o valor classificar.
    if (lk === "status" || lk.endsWith("status") || lk.endsWith("_status")) {
      if (typeof value === "string") {
        const classified = classifyStatus(value);
        // APPROVED > REJECTED > PENDING na escala de "informativo"
        if (classified === "APPROVED") bestStatus = "APPROVED";
        else if (classified === "REJECTED" && bestStatus === "PENDING")
          bestStatus = "REJECTED";
      }
    }
  });

  return { identifier, status: bestStatus };
}
