// A cotação de mercado do yuan e do dólar, vinda da AwesomeAPI.
//
// POR QUE ELA NÃO SUBSTITUI A TAXA CADASTRADA
//
// A taxa que o painel grava é a que converte custo de skin em real no relatório
// financeiro. Se o relatório usasse a cotação do momento em que a página é
// aberta, o mesmo período fechado mudaria de valor todo dia, ao sabor do
// câmbio: o gasto de julho valeria uma coisa hoje e outra amanhã, sem ninguém
// ter mexido em nada. Números de fechamento precisam ser estáveis.
//
// Então a cotação entra como SUGESTÃO: ela preenche o campo, mostra o quanto a
// taxa salva já se distanciou do mercado, e quem opera decide. Some o trabalho
// de digitar, sem tirar de quem comprou a palavra final sobre a que taxa
// comprou, que costuma ter spread e tarifa em cima do câmbio de tela.

export interface Cotacao {
  /** Quantos reais vale 1 yuan. Nulo quando a fonte não trouxe o par. */
  cnyToBrl: number | null;
  /** Quantos reais vale 1 dólar. Nulo quando a fonte não trouxe o par. */
  usdToBrl: number | null;
  /** Quando a fonte gerou o número, não quando nós buscamos. */
  atualizadaEm: Date | null;
}

/**
 * Teto de sanidade, o mesmo que a ação de salvar aplica.
 *
 * Serve para não gravar lixo com cara de taxa: um "bid" que voltasse como
 * "1.234.567" viraria custo de skin na casa dos milhões no relatório, e
 * ninguém desconfiaria do número, só do próprio negócio.
 */
const TETO = 1000;

/** Lê um número que veio como texto, recusando o que não é taxa plausível. */
function lerNumero(bruto: unknown): number | null {
  if (typeof bruto === "number") {
    return Number.isFinite(bruto) && bruto > 0 && bruto <= TETO ? bruto : null;
  }
  if (typeof bruto !== "string") return null;
  const n = Number(bruto.trim());
  // Number("") é 0 e Number(" ") também: sem este corte, campo vazio viraria
  // taxa zero, que é divisão por zero na conversão.
  if (!bruto.trim() || !Number.isFinite(n) || n <= 0 || n > TETO) return null;
  return n;
}

/** O par vem com timestamp em segundos, como texto. */
function lerInstante(bruto: unknown): Date | null {
  const s = typeof bruto === "string" ? Number(bruto.trim()) : bruto;
  if (typeof s !== "number" || !Number.isFinite(s) || s <= 0) return null;
  const d = new Date(s * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function par(bruto: Record<string, unknown>, chave: string) {
  const item = bruto[chave];
  if (!item || typeof item !== "object") return { valor: null, quando: null };
  const o = item as Record<string, unknown>;
  // "bid" é a cotação de compra, que é o número que a AwesomeAPI publica como
  // a cotação do par. "ask" existe e é um pouco maior; a diferença entre os
  // dois é ruído perto do spread que o fornecedor cobra, e quem opera ajusta.
  return { valor: lerNumero(o.bid), quando: lerInstante(o.timestamp) };
}

/**
 * Lê a resposta da AwesomeAPI.
 *
 * Nunca lança: resposta estranha vira cotação vazia, e a tela diz que não
 * conseguiu buscar. Um erro aqui derrubaria o diálogo inteiro de taxas, que
 * continua funcionando na mão sem cotação nenhuma.
 */
export function lerCotacao(bruto: unknown): Cotacao {
  if (!bruto || typeof bruto !== "object") {
    return { cnyToBrl: null, usdToBrl: null, atualizadaEm: null };
  }
  const o = bruto as Record<string, unknown>;
  const cny = par(o, "CNYBRL");
  const usd = par(o, "USDBRL");
  // A mais recente das duas: são dois pares negociados em horários próprios, e
  // mostrar a mais velha faria a cotação parecer mais defasada do que está.
  const instantes = [cny.quando, usd.quando].filter(
    (d): d is Date => d != null,
  );
  const atualizadaEm = instantes.length
    ? new Date(Math.max(...instantes.map((d) => d.getTime())))
    : null;
  return { cnyToBrl: cny.valor, usdToBrl: usd.valor, atualizadaEm };
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
