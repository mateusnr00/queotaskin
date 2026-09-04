// A chave canônica de um evento de webhook. Idempotência por EVENTO.
//
// Estratégia em três degraus, do mais forte ao mínimo (ETAPA 6):
//   1. id oficial do gateway, quando o provedor o fornece;
//   2. transação + status normalizado;
//   3. fingerprint determinístico sha256(provider|transacao|status).
//
// Nenhum degrau usa timestamp de recebimento: dois eventos semanticamente
// idênticos DEVEM colidir. Nenhum inclui segredo. O @@unique([provider,
// providerEventId]) no banco é quem, no fim, garante uma execução só.

import { createHash } from "node:crypto";

export interface EventoNormalizado {
  provider: string;
  /** id da transação no gateway (== Payment.externalId). */
  transacao: string;
  /** status normalizado do evento: APPROVED | PENDING | REJECTED. */
  status: string;
  /** id oficial do evento, se o gateway fornecer. Hoje nenhum dos 4 fornece. */
  eventoOficial?: string | null;
}

export function chaveDeEvento(e: EventoNormalizado): string {
  if (e.eventoOficial && e.eventoOficial.trim()) {
    return `oficial:${e.eventoOficial.trim()}`;
  }
  // Degrau 3 (o 2 está embutido: transacao+status). Determinístico.
  const canonico = `${e.provider}|${e.transacao}|${e.status}`;
  return `fp:${createHash("sha256").update(canonico).digest("hex")}`;
}

/** Hash do corpo cru, para evidência sem guardar o payload sensível. */
export function hashDoCorpo(corpoCru: string): string {
  return createHash("sha256").update(corpoCru).digest("hex");
}
