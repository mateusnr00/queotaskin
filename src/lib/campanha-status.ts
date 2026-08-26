// Selo da campanha: o texto laranja no canto do card.
//
// Antes ele era digitado por campanha e ficava congelado. "Adquira já"
// continuava lá com 95% vendido, e campanha esgotada seguia chamando para
// comprar número que não existe mais. Agora a urgência acompanha a venda
// sozinha, e o texto digitado só vale enquanto nenhuma faixa foi atingida.
//
// A ordem é do fim para o começo de propósito: esgotado vence quase no fim,
// que vence metade, que vence o texto do admin. Quem está em 95% precisa ler
// "últimos números", não "exclusiva VIP".

export interface ConfiguracaoDeStatus {
  halfwayText: string | null;
  almostGoneText: string | null;
  soldOutText: string | null;
  halfwayPercent: number;
  almostGonePercent: number;
}

/** Usados quando o tenant não personalizou o texto. */
export const STATUS_PADRAO = {
  halfway: "Mais da metade vendida",
  almostGone: "Últimos números!",
  soldOut: "Aguardando sorteio",
  manual: "Adquira já!",
} as const;

export const CONFIGURACAO_PADRAO: ConfiguracaoDeStatus = {
  halfwayText: null,
  almostGoneText: null,
  soldOutText: null,
  halfwayPercent: 50,
  almostGonePercent: 80,
};

/**
 * Texto do selo para uma campanha.
 *
 * @param vendidos  números já vendidos
 * @param total     números da campanha
 * @param textoManual  o que o admin digitou em Status, se digitou
 */
export function statusDaCampanha(
  vendidos: number,
  total: number,
  textoManual: string | null | undefined,
  config: ConfiguracaoDeStatus = CONFIGURACAO_PADRAO
): string {
  const manual = textoManual?.trim() || STATUS_PADRAO.manual;

  // Campanha sem números configurados não tem percentual que faça sentido:
  // dividir por zero daria Infinity e prenderia o selo em "esgotado".
  if (total <= 0) return manual;

  const percentual = (vendidos / total) * 100;

  // Esgotado é por número, não por percentual arredondado: com 10 mil
  // números, 9.999 vendidos dão 99,99%, que arredondado vira 100 e anunciaria
  // esgotado com número ainda à venda.
  if (vendidos >= total) {
    return config.soldOutText?.trim() || STATUS_PADRAO.soldOut;
  }

  if (percentual >= config.almostGonePercent) {
    return config.almostGoneText?.trim() || STATUS_PADRAO.almostGone;
  }

  if (percentual >= config.halfwayPercent) {
    return config.halfwayText?.trim() || STATUS_PADRAO.halfway;
  }

  return manual;
}
