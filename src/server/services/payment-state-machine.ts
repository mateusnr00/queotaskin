// A MÁQUINA DE ESTADOS DE PAGAMENTO. Única escritora de Payment.status.
//
// Depois desta camada, nenhuma rota de webhook escreve status direto. Toda
// transição passa por `transitionPaymentState`, que:
//   - recusa transições impossíveis (APPROVED->PENDING, REFUNDED->APPROVED);
//   - trata APPROVED->APPROVED como no-op idempotente;
//   - exige prova de verificação para chegar a APPROVED;
//   - faz compare-and-set (updateMany + rowcount) para fechar corrida;
//   - registra evento estruturado, sem payload sensível.
//
// Estados: os que JÁ existem no enum PaymentStatus. Não inventa novos.

import type { Prisma, PaymentStatus } from "@prisma/client";

export type ResultadoDaTransicao =
  | { ok: true; de: PaymentStatus; para: PaymentStatus; noop: boolean }
  | { ok: false; motivo: "TRANSICAO_INVALIDA" | "SEM_VERIFICACAO" | "PAGAMENTO_SUMIU"; de?: PaymentStatus; para: PaymentStatus };

// Transições permitidas. Ausência = proibido. APPROVED só entra por caminho
// verificado (checado à parte). O destino igual à origem é no-op idempotente.
const PERMITIDAS: Record<PaymentStatus, Set<PaymentStatus>> = {
  PENDING: new Set<PaymentStatus>(["APPROVED", "REJECTED", "CANCELLED", "REFUNDED"]),
  APPROVED: new Set<PaymentStatus>(["REFUNDED"]), // estorno formal; nunca volta a PENDING/REJECTED sozinho
  REJECTED: new Set<PaymentStatus>([]),
  CANCELLED: new Set<PaymentStatus>([]),
  REFUNDED: new Set<PaymentStatus>([]),
};

export interface EntradaDaTransicao {
  paymentId: string;
  para: PaymentStatus;
  motivo: string;
  /** Só APPROVED exige. `true` quando o gateway confirmou server-to-server. */
  verificado?: boolean;
}

/**
 * Aplica a transição dentro de uma transação Prisma, com compare-and-set.
 * NUNCA escreve status fora daqui.
 */
export async function transitionPaymentState(
  tx: Prisma.TransactionClient,
  entrada: EntradaDaTransicao,
): Promise<ResultadoDaTransicao> {
  const atual = await tx.payment.findUnique({
    where: { id: entrada.paymentId },
    select: { status: true },
  });
  if (!atual) return { ok: false, motivo: "PAGAMENTO_SUMIU", para: entrada.para };

  const de = atual.status;
  const para = entrada.para;

  // Idempotência: mesmo estado = no-op, sem erro.
  if (de === para) return { ok: true, de, para, noop: true };

  // APPROVED exige prova. Webhook sozinho nunca aprova (regra central do P0).
  if (para === "APPROVED" && !entrada.verificado) {
    logSeguranca("PAYMENT_STATE_TRANSITION_BLOCKED", entrada.paymentId, de, para, "sem verificação");
    return { ok: false, motivo: "SEM_VERIFICACAO", de, para };
  }

  if (!PERMITIDAS[de].has(para)) {
    logSeguranca("PAYMENT_STATE_TRANSITION_BLOCKED", entrada.paymentId, de, para, "transição inválida");
    return { ok: false, motivo: "TRANSICAO_INVALIDA", de, para };
  }

  // ESCRITA AUTORITATIVA VIA FUNCAO SECURITY DEFINER. Em producao a app_runtime
  // nao tem UPDATE(status) direto: esta funcao (dona = migration_role) e o unico
  // caminho de escrita de status, e reforca a matriz e a compare-and-set no
  // proprio banco. O guard financeiro continua no seu trigger (fail-closed).
  const linhas = await tx.$queryRawUnsafe<{ r: string }[]>(
    `SELECT "fin_transicao_pagamento"($1, $2, $3) AS r`,
    entrada.paymentId,
    para,
    para === "APPROVED" ? (entrada.verificado ?? false) : true,
  );
  const r = linhas[0]?.r ?? "SUMIU";

  if (r === "OK") {
    logSeguranca("PAYMENT_STATE_TRANSITION", entrada.paymentId, de, para, entrada.motivo);
    return { ok: true, de, para, noop: false };
  }
  if (r === "NOOP" || r === "CORRIDA") {
    const relido = await tx.payment.findUnique({ where: { id: entrada.paymentId }, select: { status: true } });
    if (relido?.status === para) return { ok: true, de, para, noop: true };
    return { ok: false, motivo: "TRANSICAO_INVALIDA", de: relido?.status, para };
  }
  if (r === "SEM_VERIFICACAO") return { ok: false, motivo: "SEM_VERIFICACAO", de, para };
  if (r === "SUMIU") return { ok: false, motivo: "PAGAMENTO_SUMIU", para };
  // INVALIDA
  logSeguranca("PAYMENT_STATE_TRANSITION_BLOCKED", entrada.paymentId, de, para, "transição inválida (fn)");
  return { ok: false, motivo: "TRANSICAO_INVALIDA", de, para };
}

/** Log estruturado sem payload sensível (ETAPA 10). */
function logSeguranca(
  evento: string,
  paymentId: string,
  de: PaymentStatus | undefined,
  para: PaymentStatus,
  detalhe: string,
): void {
  console.info(JSON.stringify({ evento, paymentId, de, para, detalhe, ts: new Date().toISOString() }));
}
