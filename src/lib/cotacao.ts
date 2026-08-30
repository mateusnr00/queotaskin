// A cotação do yuan e do dólar como a tela a usa.
//
// A leitura da resposta do Banco Central está em src/lib/ptax.ts. Aqui fica o
// formato que a tela consome e a comparação entre o que está salvo e o que o
// boletim diz.
//
// POR QUE A COTAÇÃO NÃO SUBSTITUI SOZINHA O CAMPO
//
// Cada entrega guarda o PTAX do dia em que ela saiu (Raffle.deliveryFxRate), e
// é essa taxa que o relatório usa. A taxa global do painel virou rede de
// segurança: vale para as entregas que não têm boletim próprio, e para o dia em
// que o Olinda estiver fora do ar.
//
// No diálogo de taxas a cotação entra como sugestão, com a distância entre o
// que está no campo e o boletim de hoje.

export interface Cotacao {
  /** Quantos reais vale 1 yuan. Nulo quando a fonte não trouxe o par. */
  cnyToBrl: number | null;
  /** Quantos reais vale 1 dólar. Nulo quando a fonte não trouxe o par. */
  usdToBrl: number | null;
  /** Quando a fonte gerou o número, não quando nós buscamos. */
  atualizadaEm: Date | null;
}

/**
 * O quanto a taxa salva se afastou do mercado, em porcento.
 *
 * Positivo quer dizer que a salva está ACIMA do mercado. Nulo quando falta um
 * dos dois lados: sem taxa salva não há distância, e inventar zero diria
 * "está em dia" para quem nunca cadastrou nada.
 */
export function distanciaDoMercado(
  salva: number | null,
  mercado: number | null,
): number | null {
  if (salva == null || mercado == null || mercado <= 0) return null;
  return ((salva - mercado) / mercado) * 100;
}

/** Acima disto a diferença deixa de ser oscilação e vira taxa esquecida. */
export const DISTANCIA_DE_ALERTA = 3;

export function taxaDesatualizada(
  salva: number | null,
  mercado: number | null,
): boolean {
  const d = distanciaDoMercado(salva, mercado);
  return d != null && Math.abs(d) >= DISTANCIA_DE_ALERTA;
}
