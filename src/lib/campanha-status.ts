// Selo da campanha: o texto laranja no canto do card.
//
// Ele acompanha a venda, e as quatro faixas são automáticas.
//
// A faixa inicial também. Antes ela usava um texto digitado por campanha, e
// isso deixava o selo mentir na direção contrária: alguém escreveu "corre que
// está acabando" no campo e a frase apareceu numa campanha com zero vendido.
// Urgência é conclusão sobre o estado da venda, e conclusão o sistema tira,
// não quem digita.
//
// A ordem é do fim para o começo de propósito: esgotado vence quase no fim,
// que vence metade, que vence o início. Quem está em 95% precisa ler
// "últimos números".

export interface ConfiguracaoDeStatus {
  earlyText: string | null;
  halfwayText: string | null;
  almostGoneText: string | null;
  soldOutText: string | null;
  halfwayPercent: number;
  almostGonePercent: number;
}

/** Usados quando o tenant não personalizou o texto. */
export const STATUS_PADRAO = {
  early: "Adquira já!",
  /** O mesmo degrau, na campanha gratuita: não se adquire o que é de graça. */
  earlyGratuita: "Participe já!",
  halfway: "Mais da metade vendida",
  almostGone: "Últimos números!",
  soldOut: "Aguardando sorteio",
} as const;

export const CONFIGURACAO_PADRAO: ConfiguracaoDeStatus = {
  earlyText: null,
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
 */
export function statusDaCampanha(
  vendidos: number,
  total: number,
  config: ConfiguracaoDeStatus = CONFIGURACAO_PADRAO,
  gratuita = false
): string {
  // O texto do painel manda, quando existe: quem escreveu sabe o que quis
  // dizer. Só o padrão troca, porque "Adquira já!" numa campanha que não
  // cobra nada contradiz o resto da página.
  const inicio =
    config.earlyText?.trim() ||
    (gratuita ? STATUS_PADRAO.earlyGratuita : STATUS_PADRAO.early);

  // Campanha sem números configurados não tem percentual que faça sentido:
  // dividir por zero daria Infinity e prenderia o selo em "esgotado".
  if (total <= 0) return inicio;

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

  return inicio;
}
