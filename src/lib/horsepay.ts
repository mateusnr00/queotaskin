// Cliente HorsePay.
//
// Base: https://api.horsepay.io
// Auth:      POST /auth/token                        -> { access_token }
// Cobrança:  POST /transaction/neworder              -> { copy_past, external_id }
// Consulta:  GET  /api/orders/deposit/{external_id}  -> { status }
//
// O TOKEN É TROCADO, E VALE QUATRO HORAS
//
// Diferente da NexusPag (um header fixo) e da SigiloPay, aqui as credenciais
// não vão em cada chamada: elas compram um token, e é o token que assina o
// resto. Quatro horas é tempo demais para trocar a cada cobrança e tempo de
// menos para pedir uma vez e esquecer, então ele fica guardado em memória com
// a validade junto, e é trocado cinco minutos antes de vencer.
//
// A margem existe porque o relógio daqui e o de lá não são o mesmo, e porque
// entre decidir usar o token e a requisição chegar do outro lado passa tempo.
// Sem ela, a última cobrança da janela sairia com um token vencido por
// segundos.
//
// O cache é por instância. No serverless cada uma paga a sua primeira troca, o
// que é uma requisição a mais de vez em quando, e nunca um erro: o pior caso
// do cache frio é pedir um token novo.
//
// E QUANDO O TOKEN CAI ANTES DA HORA
//
// Credencial rotacionada no painel deles invalida o token que está aqui, e a
// validade guardada não sabe disso. Por isso um 401 na cobrança não é erro
// final: o token guardado é jogado fora e a chamada é refeita uma vez com um
// token novo. Só o segundo 401 vira erro, e aí é credencial errada mesmo.
//
// VALOR EM REAIS
//
// A HorsePay cobra em reais com centavos (19.90), não em centavos inteiros.

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_PADRAO = "https://api.horsepay.io";

/** Quantas vezes tentar de novo antes de desistir. */
const TENTATIVAS = 3;

/** O token vale quatro horas, e é trocado antes disso. */
const VALIDADE_PADRAO_MS = 4 * 60 * 60 * 1000;
const MARGEM_MS = 5 * 60 * 1000;

export interface HorsePayCredentials {
  clientKey: string;
  clientSecret: string;
  /** Segredo do HMAC das notificações, do painel deles. */
  webhookSecret?: string;
  baseUrl?: string;
}

function base(creds: HorsePayCredentials): string {
  return (creds.baseUrl || BASE_PADRAO).replace(/\/$/, "");
}

/** Espera de backoff exponencial: 400ms, 800ms, 1600ms. */
function esperar(tentativa: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 400 * 2 ** tentativa));
}

/**
 * Um erro merece nova tentativa?
 *
 * 429 e 5xx são estados passageiros do outro lado. 400 e 401 são nossos:
 * repetir só gasta tempo e devolve o mesmo erro.
 */
function valeRepetir(status: number): boolean {
  return status === 429 || status >= 500;
}

async function mensagemDoErro(res: Response): Promise<string> {
  const bruto = await res.text().catch(() => "");
  try {
    const corpo = JSON.parse(bruto) as { message?: string; error?: string };
    return corpo.message || corpo.error || bruto || `HTTP ${res.status}`;
  } catch {
    return bruto || `HTTP ${res.status}`;
  }
}

// ---------------------------------------------------------------------------
// TOKEN
// ---------------------------------------------------------------------------

interface TokenGuardado {
  token: string;
  venceEm: number;
}

const tokens = new Map<string, TokenGuardado>();

/**
 * A chave do cache inclui o host: o mesmo client_key contra sandbox e contra
 * produção são dois tokens diferentes, e misturá-los daria 401 intermitente,
 * que é o erro mais caro de diagnosticar.
 */
function chaveDoCache(creds: HorsePayCredentials): string {
  return `${base(creds)}|${creds.clientKey}`;
}

/** Esquece o token guardado. Chamado quando o gateway responde 401. */
export function descartarToken(creds: HorsePayCredentials): void {
  tokens.delete(chaveDoCache(creds));
}

/** Só para os testes: zera o cache entre casos. */
export function limparTokens(): void {
  tokens.clear();
}

export async function obterToken(
  creds: HorsePayCredentials,
): Promise<string> {
  const chave = chaveDoCache(creds);
  const guardado = tokens.get(chave);
  if (guardado && guardado.venceEm > Date.now()) return guardado.token;

  const res = await fetch(`${base(creds)}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_key: creds.clientKey,
      client_secret: creds.clientSecret,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const erro = await mensagemDoErro(res);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `A HorsePay recusou as credenciais (${res.status}). Confira a chave e o segredo em Admin, Configurações, Pagamentos. Resposta: ${erro}`,
      );
    }
    throw new Error(`A HorsePay não emitiu o token (${res.status}): ${erro}`);
  }

  const corpo = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!corpo.access_token) {
    throw new Error("A HorsePay respondeu sem access_token.");
  }

  // Se um dia eles mandarem expires_in, ele manda; enquanto não mandam, vale a
  // validade documentada. Nos dois casos a margem é descontada.
  const validade =
    typeof corpo.expires_in === "number" && corpo.expires_in > 0
      ? corpo.expires_in * 1000
      : VALIDADE_PADRAO_MS;
  tokens.set(chave, {
    token: corpo.access_token,
    venceEm: Date.now() + Math.max(60_000, validade - MARGEM_MS),
  });

  return corpo.access_token;
}

/**
 * Uma chamada autenticada, com a repetição do token embutida.
 *
 * O 401 é tratado aqui, e não em cada chamador, porque o motivo é sempre o
 * mesmo: o token guardado morreu antes da validade que ele mesmo anunciou.
 */
async function chamar(
  creds: HorsePayCredentials,
  caminho: string,
  init: { method: string; body?: string },
): Promise<Response> {
  let res = await fetch(`${base(creds)}${caminho}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${await obterToken(creds)}`,
    },
    body: init.body,
    cache: "no-store",
    // Fronteira financeira: redirect inesperado NUNCA é seguido (anti-SSRF) e
    // toda chamada tem timeout. Espelha o caminho de retry logo abaixo.
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 401) {
    descartarToken(creds);
    res = await fetch(`${base(creds)}${caminho}`, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${await obterToken(creds)}`,
      },
      body: init.body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  }

  return res;
}

// ---------------------------------------------------------------------------
// COBRANÇA
// ---------------------------------------------------------------------------

export interface CobrancaHorsePay {
  /** Em reais, com centavos. */
  amount: number;
  /** O nome de quem paga, exigido por eles. */
  payerName: string;
  /** Nossa referência, volta no callback como client_reference_id. */
  clientReferenceId: string;
  callbackUrl: string;
  /** Só dígitos. Opcional do lado deles. */
  phone?: string;
}

export interface RespostaDaCobranca {
  /** O id deles. Vira Payment.externalId e casa com o callback. */
  transactionId: string;
  pixCode: string;
}

/**
 * Cria a cobrança Pix.
 *
 * Repete só em erro passageiro (429 e 5xx). Repetição aqui é mais arriscada
 * que na NexusPag, que promete idempotência pelo external_id: a HorsePay não
 * documenta nada disso, então uma repetição depois de a cobrança ter nascido
 * criaria uma segunda. O que segura o risco é o gatilho ser estreito, 429 e
 * 5xx dizem "não processei", e o efeito de uma cobrança extra ser um QR Code
 * que ninguém abre, que expira sozinho.
 */
export async function criarCobrancaPix(
  creds: HorsePayCredentials,
  input: CobrancaHorsePay,
): Promise<RespostaDaCobranca> {
  const corpo = JSON.stringify({
    payer_name: input.payerName,
    amount: Number(input.amount.toFixed(2)),
    callback_url: input.callbackUrl,
    client_reference_id: input.clientReferenceId,
    phone: input.phone || undefined,
    split: [],
  });

  let ultimoErro = "";
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    if (tentativa > 0) await esperar(tentativa - 1);

    const res = await chamar(creds, "/transaction/neworder", {
      method: "POST",
      body: corpo,
    });

    if (res.ok) {
      const dados = (await res.json()) as {
        copy_past?: string;
        external_id?: string | number;
      };
      if (!dados.copy_past || dados.external_id === undefined) {
        throw new Error(
          "A HorsePay respondeu sem o código do Pix ou sem o id da transação.",
        );
      }
      // O external_id deles chega como número. Payment.externalId é texto, e
      // é por ele que o callback encontra a cobrança: os dois lados precisam
      // guardar a mesma forma, ou o webhook não acha nada.
      return {
        transactionId: String(dados.external_id),
        pixCode: dados.copy_past,
      };
    }

    ultimoErro = await mensagemDoErro(res);

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `A HorsePay recusou as credenciais (${res.status}). Confira a chave e o segredo em Admin, Configurações, Pagamentos. Resposta: ${ultimoErro}`,
      );
    }
    if (!valeRepetir(res.status)) {
      throw new Error(
        `A HorsePay recusou a cobrança (${res.status}): ${ultimoErro}`,
      );
    }
  }

  throw new Error(
    `A HorsePay não respondeu depois de ${TENTATIVAS} tentativas: ${ultimoErro}`,
  );
}

// ---------------------------------------------------------------------------
// CONSULTA
// ---------------------------------------------------------------------------

export type StatusDePagamento = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Traduz o status deles para o vocabulário do app.
 *
 * "refunded" é de saque, não de depósito, e está aqui porque a mesma tradução
 * atende as duas consultas e um estorno nunca é pagamento em pé.
 */
export function traduzirStatus(status: string): StatusDePagamento | null {
  switch (status.toLowerCase()) {
    case "pending":
    case "waiting_payment": // vocabulário de rastreamento (Utmify) para "aguardando"
      return "PENDING";
    // Depósito PAGO na consulta autoritativa GET /api/orders/deposit. A resposta
    // REAL de produção usa "success" (diagnóstico HORSEPAY_S2S_DIAGNOSTICO,
    // GATE 14); a doc mostra "paid" e a doc de rastreamento cita "approved".
    // Aceitamos os três (enum EXPLÍCITO, nunca truthy/substring). Tratar só
    // "paid" fazia um depósito "success" cair em PENDING e NUNCA virar
    // VERIFIED_APPROVED - a regressão que segurou os pagamentos após o STRONG.
    // "success" apenas leva o providerStatus a APPROVED: valor (centavos exatos)
    // e identidade (id == externalId) seguem sendo conferidos depois. STRONG
    // intacto; o webhook continua sendo só SINAL.
    case "paid":
    case "approved":
    case "success":
      return "APPROVED";
    case "refunded":
    case "canceled":
    case "cancelled":
    case "chargedback": // estorno reportado pela HorsePay
      return "REJECTED";
    default:
      return null;
  }
}

/**
 * Consulta um depósito. Sustenta o botão "já paguei".
 *
 * Status desconhecido vira PENDING, e não erro: quem chama pergunta "já
 * pagou?", e a resposta honesta para o desconhecido é "ainda não sei".
 */
/** Identidade e valor extraídos da consulta OFICIAL (S2S), para verificação
 *  forte (STRONG). Nada aqui vem do webhook. */
export interface ConsultaHorsePay {
  status: StatusDePagamento;
  raw: unknown;
  /** `value` OFICIAL da consulta: valor BRUTO da cobrança em reais. `null`
   *  quando ausente/não-numérico (a verificação trata null como "não
   *  confirmável"). NUNCA é `tax` nem derivado. */
  amountBrl: number | null;
  /** Identidade da transação no gateway (o `id`), para provar que a resposta é
   *  do Payment certo. Só `id`; os demais campos ficam null (a HorsePay não os
   *  expõe na consulta). */
  identity: { id: string | null; txid: string | null; externalId: string | null };
  /** `end_to_end`, quando presente. Só evidência; não decide aprovação. */
  endToEnd: string | null;
}

export async function consultarDeposito(
  creds: HorsePayCredentials,
  id: string,
): Promise<ConsultaHorsePay> {
  const res = await chamar(
    creds,
    `/api/orders/deposit/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw new Error(
      `A HorsePay falhou ao consultar o depósito (${res.status}): ${await mensagemDoErro(res)}`,
    );
  }
  // Parser DEFENSIVO da resposta OFICIAL (fonte da prova STRONG). Campo
  // ausente/errado NÃO vira zero nem string vazia: fica null, e a verificação
  // trata null como "não confirmável" (fail-closed). Sem coerção perigosa.
  const corpo = (await res.json()) as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  // O `id` da HorsePay é numérico (ex.: 12345). Aceita number inteiro seguro
  // >= 0 (vira string canônica) ou string não-vazia; qualquer outra coisa
  // (NaN, Infinity, float, objeto, array, null) vira null. NUNCA faz parseInt
  // de string (que truncaria "12345abc" → 12345).
  const idOficial = ((): string | null => {
    if (typeof corpo.id === "number") {
      return Number.isSafeInteger(corpo.id) && corpo.id >= 0 ? String(corpo.id) : null;
    }
    if (typeof corpo.id === "string") {
      const s = corpo.id.trim();
      return s.length > 0 ? s : null;
    }
    return null;
  })();
  // DIAGNÓSTICO REDIGIDO da regressão HorsePay: expõe a FORMA real da resposta
  // S2S (não o conteúdo sensível) para confirmar por que um depósito pago não
  // vira VERIFIED_APPROVED. NÃO loga id/value/nome/documento/end_to_end
  // completos nem qualquer segredo - só tipos, presença e o rótulo de status.
  console.info(
    JSON.stringify({
      evento: "HORSEPAY_S2S_DIAGNOSTICO",
      endpoint: "/api/orders/deposit/{id}",
      keys: Object.keys(corpo).sort(),
      status_tipo: typeof corpo.status,
      status_valor:
        typeof corpo.status === "string" ? corpo.status.toLowerCase() : String(corpo.status),
      status_mapeado:
        (typeof corpo.status === "string" && traduzirStatus(corpo.status)) || "PENDING",
      value_tipo: typeof corpo.value,
      id_tipo: typeof corpo.id,
      id_presente: corpo.id != null,
      end_to_end_presente: corpo.end_to_end != null,
      ts: new Date().toISOString(),
    }),
  );
  return {
    status:
      (typeof corpo.status === "string" && traduzirStatus(corpo.status)) ||
      "PENDING",
    raw: corpo,
    amountBrl: num(corpo.value), // valor BRUTO; NUNCA `tax` nem net
    identity: { id: idOficial, txid: null, externalId: null },
    endToEnd: str(corpo.end_to_end),
  };
}

// ---------------------------------------------------------------------------
// WEBHOOK
// ---------------------------------------------------------------------------

/**
 * Confere a assinatura do callback.
 *
 * O header é `X-Signature: sha256=<hex>`, e o que é assinado é o corpo CRU.
 * Cru mesmo: ler com json() e reserializar reordena chaves e muda espaços, e a
 * assinatura deixa de bater por um motivo invisível de ler no código.
 *
 * O prefixo `sha256=` é aceito e também a sua ausência, porque é a diferença
 * entre uma integração que funciona e uma que recusa todo pagamento se um dia
 * eles mudarem o formato do header. O algoritmo não vem do header: é sempre
 * sha256 daqui, senão quem manda a notificação escolheria como ela é
 * verificada.
 */
export function assinaturaConfere(
  header: string | null,
  corpoCru: string,
  segredo: string,
): boolean {
  if (!header || !segredo) return false;

  const recebida = header.trim().replace(/^sha256=/i, "");
  if (!recebida) return false;

  const esperado = createHmac("sha256", segredo).update(corpoCru).digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(recebida.toLowerCase(), "utf8");
  // timingSafeEqual joga quando os tamanhos diferem, e o tamanho já denuncia
  // a diferença de qualquer jeito.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface AvisoDaHorsePay {
  /** O id deles, o mesmo que foi gravado em Payment.externalId. */
  externalId: string | null;
  /** A nossa referência, a reserva. */
  nossaReferencia: string | null;
  status: StatusDePagamento;
  /**
   * Notificação de INFRAÇÃO (MED do Banco Central), não de pagamento.
   *
   * Chega pelo mesmo endereço e com o mesmo formato, mais o campo
   * `infraction_status`. Ela não muda o estado do pagamento: uma infração
   * aberta sobre um depósito pago não desfaz o pagamento, e tratar o `status`
   * dela como resposta de cobrança marcaria como recusado um Pix que caiu.
   */
  infracao: string | null;
  /**
   * Notificação de SAQUE. Não fazemos saque por aqui, e o campo existe para a
   * rota poder dizer isso em vez de procurar um pagamento que nunca vai achar.
   */
  saque: boolean;
}

/** Lê o corpo do callback. Devolve null quando não dá para reconhecer nada. */
export function lerWebhook(payload: unknown): AvisoDaHorsePay | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raiz = payload as Record<string, unknown>;

  const externalId =
    typeof raiz.external_id === "string"
      ? raiz.external_id
      : typeof raiz.external_id === "number"
        ? String(raiz.external_id)
        : null;
  if (externalId === null) return null;

  return {
    externalId,
    nossaReferencia:
      typeof raiz.client_reference_id === "string"
        ? raiz.client_reference_id
        : null,
    // O status vem como booleano: true é pago, false é falha. Não existe
    // "pendente" no callback, porque a notificação só sai quando algo
    // aconteceu.
    status: raiz.status === true ? "APPROVED" : "REJECTED",
    infracao:
      typeof raiz.infraction_status === "string" ? raiz.infraction_status : null,
    // O saque manda `endtoendid`; o depósito manda `end_to_end`. É a única
    // coisa que separa os dois formatos.
    saque: "endtoendid" in raiz,
  };
}
