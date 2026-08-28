// Cliente NexusPag.
//
// Base: https://nexuspag.com
// Auth: um header só, x-api-key. Sem troca por token, sem validade.
// Cobrança:  POST /api/pix/create   -> { transaction: { id, pix_copia_cola } }
// Consulta:  GET  /api/pix/{id}     -> aceita uuid, txid ou external_id
//
// VALOR EM REAIS, COM MÍNIMO DE R$ 1,00.
//
// O mínimo importa aqui e não importava nos outros gateways: uma rifa de cota
// barata vende um número por R$ 0,50, e a NexusPag recusa isso com 400. A
// verificação é feita antes de sair pela rede, para a mensagem dizer o que
// houve em vez de repetir um erro genérico do gateway.
//
// IDEMPOTÊNCIA DE GRAÇA.
//
// O `external_id` é a chave: mandar o mesmo duas vezes devolve a cobrança que
// já existe, sem criar outra. É o que torna seguro repetir a chamada quando a
// rede cai no meio, e é por isso que o retry aqui embaixo existe.

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_PADRAO = "https://nexuspag.com";

/** O gateway recusa cobrança abaixo disso. */
export const VALOR_MINIMO = 1;

/** Quantas vezes tentar de novo antes de desistir. */
const TENTATIVAS = 3;

export interface NexusPagCredentials {
  apiKey: string;
  /** Segredo do webhook, configurado no painel deles. */
  webhookSecret?: string;
  baseUrl?: string;
}

export class ValorAbaixoDoMinimoError extends Error {
  constructor(valor: number) {
    super(
      `A NexusPag não aceita cobrança de ${valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}. O mínimo é R$ 1,00.`,
    );
    this.name = "ValorAbaixoDoMinimoError";
  }
}

function base(creds: NexusPagCredentials): string {
  return (creds.baseUrl || BASE_PADRAO).replace(/\/$/, "");
}

function cabecalhos(creds: NexusPagCredentials): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": creds.apiKey,
  };
}

/** Espera de backoff exponencial: 400ms, 800ms, 1600ms. */
function esperar(tentativa: number): Promise<void> {
  return new Promise((r) => setTimeout(r, 400 * 2 ** tentativa));
}

/**
 * Um erro merece nova tentativa?
 *
 * 429, 500 e 502 são estados passageiros do outro lado, e a documentação
 * deles manda esperar e tentar de novo. 400 e 401 são nossos: repetir só
 * gasta tempo e devolve o mesmo erro.
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

export interface CobrancaNexus {
  /** Em reais. Precisa ser pelo menos R$ 1,00. */
  amount: number;
  /** Nossa referência. Vira a chave de idempotência do lado deles. */
  externalId: string;
  descricao?: string;
  webhookUrl: string;
  expiresAt: Date;
}

export interface RespostaDaCobranca {
  /** O uuid deles. Vira Payment.externalId e casa com o webhook. */
  transactionId: string;
  pixCode: string;
}

/**
 * Cria a cobrança Pix.
 *
 * Repete em erro passageiro porque o `external_id` garante que a repetição não
 * cria uma segunda cobrança: na pior das hipóteses, a segunda chamada recebe de
 * volta a cobrança que a primeira já tinha criado antes de a resposta se
 * perder. Sem essa garantia, repetir seria cobrar duas vezes.
 */
export async function criarCobrancaPix(
  creds: NexusPagCredentials,
  input: CobrancaNexus,
): Promise<RespostaDaCobranca> {
  if (input.amount < VALOR_MINIMO) {
    throw new ValorAbaixoDoMinimoError(input.amount);
  }

  // Em segundos, e nunca no passado: cobrança que nasce vencida some da tela
  // do comprador antes de ele conseguir pagar.
  const segundos = Math.max(
    60,
    Math.round((input.expiresAt.getTime() - Date.now()) / 1000),
  );

  const corpo = JSON.stringify({
    amount: Number(input.amount.toFixed(2)),
    description: input.descricao,
    external_id: input.externalId,
    webhook_url: input.webhookUrl,
    expiration: segundos,
  });

  let ultimoErro = "";
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    if (tentativa > 0) await esperar(tentativa - 1);

    const res = await fetch(`${base(creds)}/api/pix/create`, {
      method: "POST",
      headers: cabecalhos(creds),
      body: corpo,
      cache: "no-store",
    });

    if (res.ok) {
      const dados = (await res.json()) as {
        success?: boolean;
        transaction?: { id?: string; pix_copia_cola?: string };
      };
      const t = dados.transaction;
      if (!t?.id || !t.pix_copia_cola) {
        throw new Error(
          "A NexusPag respondeu sem id de transação ou sem o código do Pix.",
        );
      }
      return { transactionId: t.id, pixCode: t.pix_copia_cola };
    }

    ultimoErro = await mensagemDoErro(res);

    if (res.status === 401) {
      throw new Error(
        `A NexusPag recusou a chave de API (401). Confira a credencial em Admin, Configurações, Pagamentos. Resposta: ${ultimoErro}`,
      );
    }
    if (res.status === 409) {
      throw new Error(
        `A NexusPag já tem outra cobrança com esta referência (409): ${ultimoErro}`,
      );
    }
    if (!valeRepetir(res.status)) {
      throw new Error(
        `A NexusPag recusou a cobrança (${res.status}): ${ultimoErro}`,
      );
    }
  }

  throw new Error(
    `A NexusPag não respondeu depois de ${TENTATIVAS} tentativas: ${ultimoErro}`,
  );
}

export type StatusDePagamento = "PENDING" | "APPROVED" | "REJECTED";

/** Traduz o status deles para o vocabulário do app. */
export function traduzirStatus(status: string): StatusDePagamento | null {
  switch (status) {
    case "pending":
      return "PENDING";
    case "paid":
      return "APPROVED";
    case "expired":
    case "cancelled":
      return "REJECTED";
    default:
      return null;
  }
}

/**
 * Consulta uma cobrança. Sustenta o botão "já paguei".
 *
 * Status desconhecido vira PENDING, e não erro: quem chama pergunta "já
 * pagou?", e a resposta honesta para o desconhecido é "ainda não sei".
 */
export async function consultarCobranca(
  creds: NexusPagCredentials,
  id: string,
): Promise<{ status: StatusDePagamento; raw: unknown }> {
  const res = await fetch(
    `${base(creds)}/api/pix/${encodeURIComponent(id)}`,
    { method: "GET", headers: cabecalhos(creds), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(
      `A NexusPag falhou ao consultar a cobrança (${res.status}): ${await mensagemDoErro(res)}`,
    );
  }
  const corpo = (await res.json()) as { status?: string };
  return {
    status: (corpo.status && traduzirStatus(corpo.status)) || "PENDING",
    raw: corpo,
  };
}

/**
 * Confere a assinatura do webhook.
 *
 * O header vem como "t=<unix>,v1=<hmac_hex>", e o que é assinado é a string
 * "<unix>.<corpo cru>". CRU mesmo: reserializar o JSON reordena chaves e muda
 * espaços, e a assinatura deixa de bater por um motivo invisível de ler.
 *
 * NÃO recusamos assinatura antiga. A tentação é comparar `t` com o relógio e
 * negar o que passou de alguns minutos, mas eles reentregam por até setenta e
 * duas horas, e eu não sei se a assinatura é refeita a cada tentativa ou
 * reaproveitada da primeira. Recusar pela idade arriscaria matar reentrega
 * legítima de pagamento, que é dinheiro real sumindo, para evitar uma repetição
 * que o nosso processamento já trata como inofensiva: confirmar de novo um
 * pagamento já confirmado não faz nada.
 */
export function assinaturaConfere(
  header: string | null,
  corpoCru: string,
  segredo: string,
): boolean {
  if (!header || !segredo) return false;

  const partes = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...resto] = p.trim().split("=");
      return [k, resto.join("=")];
    }),
  ) as { t?: string; v1?: string };

  if (!partes.t || !partes.v1) return false;

  const esperado = createHmac("sha256", segredo)
    .update(`${partes.t}.${corpoCru}`)
    .digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(partes.v1, "utf8");
  // timingSafeEqual joga quando os tamanhos diferem, e o tamanho já denuncia
  // a diferença de qualquer jeito.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface AvisoDaNexus {
  evento: string;
  transactionId: string | null;
  nossaReferencia: string | null;
  status: StatusDePagamento;
}

/** Lê o corpo do webhook. Devolve null para evento que não é de pagamento. */
export function lerWebhook(payload: unknown): AvisoDaNexus | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raiz = payload as Record<string, unknown>;

  const evento = typeof raiz.event === "string" ? raiz.event : "";
  if (evento !== "payment.confirmed") return null;

  const status =
    typeof raiz.status === "string" ? traduzirStatus(raiz.status) : null;

  return {
    evento,
    transactionId:
      typeof raiz.transaction_id === "string" ? raiz.transaction_id : null,
    nossaReferencia:
      typeof raiz.external_id === "string" ? raiz.external_id : null,
    // O evento é "payment.confirmed": mesmo sem status legível no corpo, o
    // nome do evento já diz que foi pago.
    status: status ?? "APPROVED",
  };
}
