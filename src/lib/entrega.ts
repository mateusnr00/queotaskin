// Os estados da entrega, do lado da tela.
//
// O enum mora no banco; o que mora aqui é como cada estado se chama em
// português e de que cor ele é. Num arquivo só porque a mesma informação
// aparece no seletor, no cartão do celular e na linha da tabela, e três cópias
// de uma lista de seis itens é uma cópia que fica para trás.

import type { DeliveryStatus } from "@prisma/client";

export interface EstadoDaEntrega {
  chave: DeliveryStatus;
  rotulo: string;
  /** O pontinho ao lado do nome, como no seletor de status. */
  cor: string;
  /** Conta como resolvido: sai da fila do que falta fazer. */
  concluido: boolean;
}

/**
 * Na ordem em que aparecem no seletor.
 *
 * PRIORIDADE primeiro de propósito: é o estado que se procura quando se abre a
 * lista para escolher o que fazer agora.
 */
export const ESTADOS_DA_ENTREGA: readonly EstadoDaEntrega[] = [
  { chave: "PRIORIDADE", rotulo: "Prioridade", cor: "#3b82f6", concluido: false },
  { chave: "AGUARDANDO", rotulo: "Aguardando", cor: "#8b5cf6", concluido: false },
  { chave: "ENVIADO", rotulo: "Enviado", cor: "#22c55e", concluido: true },
  { chave: "ERRO", rotulo: "Erro", cor: "#ef4444", concluido: false },
  { chave: "REENVIO", rotulo: "Reenvio", cor: "#f97316", concluido: false },
  // Pago em dinheiro em vez de skin. Conclui a entrega do mesmo jeito: não há
  // mais nada a enviar.
  { chave: "PIX", rotulo: "Pix", cor: "#14b8a6", concluido: true },
];

const POR_CHAVE = new Map(ESTADOS_DA_ENTREGA.map((e) => [e.chave, e]));

/** Nunca devolve nulo: um estado desconhecido cairia numa linha sem rótulo. */
export function estadoDaEntrega(chave: DeliveryStatus): EstadoDaEntrega {
  return POR_CHAVE.get(chave) ?? ESTADOS_DA_ENTREGA[1];
}

/** Ainda dá trabalho. É o que a fila conta como pendente. */
export function pendente(chave: DeliveryStatus): boolean {
  return !estadoDaEntrega(chave).concluido;
}
