// Os limites de quantidade de uma compra, num lugar só.
//
// O formulário aparava o valor com uma regra escrita dentro dele, e o seletor
// precisa da MESMA regra para saber quando desabilitar o "-" e o "+". Escrita
// duas vezes, ela vira um botão que continua clicável num valor que o
// formulário já recusa, ou pior, um botão desabilitado antes do limite.

export interface LimitesDaQuantidade {
  min: number;
  max: number;
}

/**
 * O piso e o teto efetivos de uma campanha.
 *
 * O piso nunca é zero: comprar nenhuma cota não é uma compra. O teto, quando
 * a campanha não define um, é o mesmo limite de sempre do formulário.
 */
export function limitesDaQuantidade(
  minPurchase: number,
  maxPurchase?: number | null,
): LimitesDaQuantidade {
  const min = Math.max(1, Math.floor(minPurchase) || 1);
  const max = maxPurchase != null && maxPurchase > 0 ? Math.floor(maxPurchase) : 10_000;
  // Campanha configurada com teto abaixo do piso não existe, mas se
  // existisse o piso ganha: recusar tudo seria pior que vender o mínimo.
  return { min, max: Math.max(min, max) };
}

/** O valor dentro dos limites. */
export function aparaQuantidade(
  valor: number,
  limites: LimitesDaQuantidade,
): number {
  if (!Number.isFinite(valor)) return limites.min;
  return Math.max(limites.min, Math.min(limites.max, Math.floor(valor)));
}
