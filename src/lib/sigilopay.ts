// Cliente SigiloPay.
//
// PARCIAL, DE PROPÓSITO.
//
// O que está aqui é o que a documentação de webhooks já fixa: os nomes dos
// eventos, o que cada um significa para uma reserva, e a prova de origem da
// notificação. Falta a metade que cria a cobrança, que mora em outra página
// da documentação deles e ainda não foi lida. Nada neste arquivo é chamado
// pelo app enquanto essa metade não existir: gateway meio escrito perto do
// checkout é o pior lugar possível para um palpite.
//
// UMA URL DE CALLBACK, NÃO UMA POR COBRANÇA.
//
// A SigiloPay limita 20 webhooks por integração e diz, na própria
// documentação, que quem estoura esse limite está mandando uma URL diferente
// a cada transação. A nossa é fixa, com um token secreto no caminho, e o
// identificador da reserva viaja no corpo da cobrança. Uma URL para sempre.

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
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
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
