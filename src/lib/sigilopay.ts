// Cliente SigiloPay.
//
// Base: https://app.sigilopay.com.br/api/v1
// Auth: dois headers, x-public-key e x-secret-key. Sem troca por token, sem
//   validade para expirar, sem cache para invalidar.
// Cobrança Pix:
//   POST /gateway/pix/receive   -> { transactionId, pix: { code } }
// Consulta:
//   GET  /gateway/transactions?id=…
//
// O VALOR VAI EM REAIS, NÃO EM CENTAVOS. Igual à SyncPay, ao contrário da
// maioria. Está escrito na documentação deles, campo por campo.
//
// UMA URL DE CALLBACK, NÃO UMA POR COBRANÇA.
//
// A SigiloPay limita 20 webhooks por integração e diz, na própria
// documentação, que quem estoura esse limite está mandando uma URL diferente
// a cada transação. A nossa é fixa, com um token secreto no caminho, e o
// identificador da reserva viaja no corpo da cobrança. Uma URL para sempre.

import { diaOficial } from "@/lib/xp/regras";

/** Os eventos que a SigiloPay dispara para transações. */
export const EVENTOS_DE_TRANSACAO = [
  "TRANSACTION_CREATED",
  "TRANSACTION_PAID",
  "TRANSACTION_CANCELED",
  "TRANSACTION_REFUNDED",
  "TRANSACTION_CHARGED_BACK",
] as const;

export type EventoDeTransacao = (typeof EVENTOS_DE_TRANSACAO)[number];

/** O vocabulário de status que o resto do app já fala. */
export type StatusDePagamento = "PENDING" | "APPROVED" | "REJECTED";

export interface SigiloPayCredentials {
  /** A "Chave Pública (Client ID)" do painel deles. */
  clientId: string;
  /** A "Chave Privada (Client Secret)". */
  clientSecret: string;
  baseUrl?: string;
}

const BASE_PADRAO = "https://app.sigilopay.com.br/api/v1";

function base(creds: SigiloPayCredentials): string {
  return (creds.baseUrl || BASE_PADRAO).replace(/\/$/, "");
}

function cabecalhos(creds: SigiloPayCredentials): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-public-key": creds.clientId,
    "x-secret-key": creds.clientSecret,
  };
}

/** Extrai a mensagem de erro do formato que eles documentam. */
async function erroDaResposta(res: Response): Promise<string> {
  const bruto = await res.text().catch(() => "");
  try {
    const corpo = JSON.parse(bruto) as {
      message?: string;
      errorCode?: string;
      details?: { field?: string; issue?: string };
    };
    const partes = [corpo.message, corpo.details?.issue].filter(Boolean);
    if (partes.length > 0) {
      const campo = corpo.details?.field ? ` (campo ${corpo.details.field})` : "";
      return `${partes.join(" ")}${campo}`;
    }
  } catch {
    // Resposta que não é JSON: devolve o texto cru, que ainda ajuda no log.
  }
  return bruto || `HTTP ${res.status}`;
}

/**
 * O que um evento significa para a reserva.
 *
 * Estorno e chargeback chegam DEPOIS de um pagamento aprovado, e não no lugar
 * dele. Os dois viram REJECTED porque o efeito na reserva é o mesmo, o dinheiro
 * não é nosso, mas quem chama precisa saber que está desfazendo algo que já
 * valeu: por isso `desfazPagamento` é separado do status.
 */
export function statusDoEvento(evento: string): {
  status: StatusDePagamento;
  desfazPagamento: boolean;
} | null {
  switch (evento) {
    case "TRANSACTION_CREATED":
      return { status: "PENDING", desfazPagamento: false };
    case "TRANSACTION_PAID":
      return { status: "APPROVED", desfazPagamento: false };
    case "TRANSACTION_CANCELED":
      return { status: "REJECTED", desfazPagamento: false };
    case "TRANSACTION_REFUNDED":
    case "TRANSACTION_CHARGED_BACK":
      return { status: "REJECTED", desfazPagamento: true };
    default:
      // Evento novo ou de saque. Quem chama responde 2XX e ignora, em vez de
      // tratar como erro: a SigiloPay reenvia o que não recebe 2XX, e um
      // evento que não nos interessa ficaria em loop de reentrega.
      return null;
  }
}

/** Os status que a SigiloPay usa para a transacao em si. */
const STATUS_DA_TRANSACAO: Record<
  string,
  { status: StatusDePagamento; desfazPagamento: boolean }
> = {
  COMPLETED: { status: "APPROVED", desfazPagamento: false },
  FAILED: { status: "REJECTED", desfazPagamento: false },
  PENDING: { status: "PENDING", desfazPagamento: false },
  REFUNDED: { status: "REJECTED", desfazPagamento: true },
  CHARGED_BACK: { status: "REJECTED", desfazPagamento: true },
};

export interface WebhookDaSigiloPay {
  evento: string;
  /** Token que a SigiloPay repete em toda notificacao daquela integracao. */
  token: string | null;
  /** O id da transacao no lado deles. E o que casa com Payment.externalId. */
  idDaTransacao: string | null;
  /** A referencia que mandamos na criacao da cobranca. */
  nossaReferencia: string | null;
  status: StatusDePagamento;
  desfazPagamento: boolean;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Le uma notificacao da SigiloPay.
 *
 * O payload traz DUAS versoes da verdade: o nome do evento e o
 * `transaction.status`. Normalmente concordam. Quando nao concordam, quem
 * manda e o evento, porque ele e o motivo do disparo.
 *
 * A excecao e o reenvio atrasado: um TRANSACTION_CREATED cuja transacao ja
 * esta liquidada e uma notificacao antiga chegando fora de ordem, e obedecer o
 * nome do evento ali seria voltar uma reserva paga para pendente. Nesse caso o
 * status da transacao ganha.
 *
 * Devolve null quando o payload nao e um evento de transacao (saque, por
 * exemplo) ou nao tem forma de objeto.
 */
export function lerWebhook(payload: unknown): WebhookDaSigiloPay | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raiz = payload as Record<string, unknown>;

  const evento = texto(raiz.event);
  if (!evento) return null;

  const doEvento = statusDoEvento(evento);
  if (!doEvento) return null;

  const transacao =
    typeof raiz.transaction === "object" && raiz.transaction !== null
      ? (raiz.transaction as Record<string, unknown>)
      : {};

  const daTransacao = texto(transacao.status)
    ? STATUS_DA_TRANSACAO[transacao.status as string]
    : undefined;

  const vale =
    evento === "TRANSACTION_CREATED" && daTransacao && daTransacao.status !== "PENDING"
      ? daTransacao
      : doEvento;

  return {
    evento,
    token: texto(raiz.token),
    idDaTransacao: texto(transacao.id),
    nossaReferencia: texto(transacao.identifier),
    status: vale.status,
    desfazPagamento: vale.desfazPagamento,
  };
}

/**
 * Confere o token que a SigiloPay repete em todo webhook.
 *
 * Comparação em tempo constante. A diferença prática é pequena, mas o custo
 * também é, e aqui o que está em jogo é alguém forjar "reserva paga".
 *
 * Quando ainda não há token guardado, aceita: a primeira notificação de uma
 * integração nova é justamente onde ele aparece. A defesa de verdade nesse
 * momento é o token secreto no caminho da URL, que já barrou quem não o sabe.
 */
export function tokenConfere(
  recebido: unknown,
  guardado: string | null | undefined,
): boolean {
  if (!guardado) return true;
  if (typeof recebido !== "string" || recebido.length !== guardado.length) {
    return false;
  }
  let diferenca = 0;
  for (let i = 0; i < guardado.length; i++) {
    diferenca |= recebido.charCodeAt(i) ^ guardado.charCodeAt(i);
  }
  return diferenca === 0;
}

/** Traduz o status da transação para o vocabulário do app. */
export function statusDaTransacao(status: string): StatusDePagamento | null {
  return STATUS_DA_TRANSACAO[status]?.status ?? null;
}

export interface CobrancaPix {
  /** Em REAIS, não em centavos. */
  amount: number;
  /** Nosso identificador, único por transação. Volta no webhook. */
  identifier: string;
  /** Para onde a SigiloPay avisa. Fixa, uma só para todas as cobranças. */
  callbackUrl: string;
  /** Quando a cobrança deixa de valer. Vira dueDate, na data oficial. */
  expiresAt: Date;
  client: {
    name: string;
    email: string;
    cpf: string;
    phone: string;
  };
}

export interface RespostaDaCobranca {
  /** O id deles. Vira Payment.externalId e casa com transaction.id no webhook. */
  transactionId: string;
  /** O copia e cola. Também é o que gera o QR Code na tela. */
  pixCode: string;
}

/**
 * Cria uma cobrança Pix.
 *
 * O `identifier` é nosso e precisa ser único por transação: é ele que a
 * SigiloPay devolve como `transaction.identifier` no webhook, e é por ele que
 * dá para achar a cobrança de novo em `/gateway/transactions` mesmo se a
 * resposta se perder no caminho.
 *
 * O QR Code sai do `pix.code`, e não do `pix.base64`: o campo base64 está
 * marcado como depreciado na documentação deles e hoje sempre volta vazio.
 */
export async function criarCobrancaPix(
  creds: SigiloPayCredentials,
  input: CobrancaPix,
): Promise<RespostaDaCobranca> {
  const res = await fetch(`${base(creds)}/gateway/pix/receive`, {
    method: "POST",
    headers: cabecalhos(creds),
    body: JSON.stringify({
      identifier: input.identifier,
      amount: input.amount,
      client: {
        name: input.client.name,
        email: input.client.email,
        phone: input.client.phone,
        document: input.client.cpf,
      },
      // Data, e não instante: a granularidade do campo é o dia, então o
      // vencimento deles nunca chega antes do nosso, que é o que manda.
      dueDate: diaOficial(input.expiresAt),
      callbackUrl: input.callbackUrl,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detalhe = await erroDaResposta(res);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `SigiloPay recusou as credenciais (${res.status}). Confira a Chave Pública e a Privada em Admin, Configurações, Pagamentos. Resposta: ${detalhe}`,
      );
    }
    throw new Error(`SigiloPay recusou a cobrança (${res.status}): ${detalhe}`);
  }

  const corpo = (await res.json()) as {
    transactionId?: string;
    status?: string;
    pix?: { code?: string };
    errorDescription?: string;
  };

  // 201 com status de falha existe: a documentação lista FAILED, REJECTED e
  // CANCELED no mesmo corpo de sucesso. Sem esta guarda, uma cobrança recusada
  // viraria uma tela de Pix com o campo vazio.
  if (corpo.status && corpo.status !== "OK" && corpo.status !== "PENDING") {
    throw new Error(
      `SigiloPay devolveu a transação como ${corpo.status}: ${corpo.errorDescription ?? "sem detalhe"}`,
    );
  }
  if (!corpo.transactionId || !corpo.pix?.code) {
    throw new Error(
      "SigiloPay respondeu sem transactionId ou sem o código do Pix",
    );
  }

  return { transactionId: corpo.transactionId, pixCode: corpo.pix.code };
}

/**
 * Consulta uma transação. É o que sustenta o botão "já paguei", para quem não
 * quer esperar o webhook chegar.
 */
export async function consultarTransacao(
  creds: SigiloPayCredentials,
  transactionId: string,
): Promise<{ status: StatusDePagamento; raw: unknown }> {
  const url = `${base(creds)}/gateway/transactions?id=${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: cabecalhos(creds),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `SigiloPay falhou ao consultar a transação (${res.status}): ${await erroDaResposta(res)}`,
    );
  }
  const corpo = (await res.json()) as { status?: string };
  return {
    // Status que não conhecemos vira PENDING, e não erro: quem chama está
    // perguntando "já pagou?", e a resposta honesta para o desconhecido é
    // "ainda não sei", que faz a tela continuar esperando o webhook.
    status: (corpo.status && statusDaTransacao(corpo.status)) || "PENDING",
    raw: corpo,
  };
}
