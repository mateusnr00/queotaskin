// Dinheiro em CENTAVOS INTEIROS. Nunca comparar valor financeiro com float.
//
// A API da NexusPag devolve `amount` como number em reais (ex.: 100.01). O
// float não é confiável para igualdade (0.1 + 0.2 != 0.3), então o valor é
// convertido para centavos inteiros no instante em que entra, e toda
// comparação financeira acontece sobre inteiros.

export type CentavosResultado =
  | { ok: true; centavos: number }
  | { ok: false; motivo: string };

/**
 * Converte um valor em reais (number) para centavos inteiros, de forma
 * ESTRITA. Só aceita number finito e >= 0. String, null, undefined, NaN,
 * Infinity, objeto, array, negativo: recusa. A documentação da NexusPag diz
 * `number`, então não somos permissivos com strings.
 */
export function normalizeBRLToCents(valor: unknown): CentavosResultado {
  if (typeof valor !== "number") {
    return { ok: false, motivo: `valor não é number (${typeof valor})` };
  }
  if (!Number.isFinite(valor)) {
    return { ok: false, motivo: "valor não finito (NaN/Infinity)" };
  }
  if (valor < 0) {
    return { ok: false, motivo: "valor negativo" };
  }
  // Arredonda ao centavo: 100.005 é ruído de float, não meio-centavo.
  const centavos = Math.round(valor * 100);
  if (!Number.isSafeInteger(centavos)) {
    return { ok: false, motivo: "valor fora do intervalo seguro" };
  }
  return { ok: true, centavos };
}

/** Reais (Prisma Decimal já vem como number-compatível) para centavos, confiável (valor interno). */
export function reaisParaCentavos(valor: number): number {
  return Math.round(valor * 100);
}
