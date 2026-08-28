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
