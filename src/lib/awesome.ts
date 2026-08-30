// A AwesomeAPI, usada como RETAGUARDA do PTAX.
//
// PTAX é a taxa oficial e continua sendo a primeira escolha: é a que a Receita
// espera para converter transação em moeda estrangeira. Mas o Banco Central não
// publica toda moeda, e nem sempre está no ar. Quando ele não responde por um
// dia, a alternativa não pode ser deixar a entrega sem câmbio para sempre.
//
// O endpoint /json/daily aceita start_date e end_date, então ela também
// responde pelo passado. É isso que a torna utilizável aqui: uma fonte só de
// "agora" não serviria para gravar o câmbio do dia em que a skin saiu.
//
// DUAS PEGADINHAS DO FORMATO
//
// 1. O timestamp vem em SEGUNDOS num endpoint e em MILISSEGUNDOS no outro. A
//    própria documentação mostra os dois. Ler o de milissegundo como segundo
//    joga a data para o ano 50 mil.
// 2. Só o PRIMEIRO item do array traz code, codein e create_date. Os demais
//    vêm sem, então nada pode depender desses campos.

/** Uma cotação de fechamento de um dia. */
export interface DiaAwesome {
  /** A taxa usada: ask, que é a de VENDA. Ver a nota abaixo. */
  taxa: number;
  compra: number;
  venda: number;
  quando: Date;
}

/**
 * bid é COMPRA e ask é VENDA, conforme a legenda da própria API.
 *
 * Despesa em moeda estrangeira converte pela venda, que é a ponta em que se
 * compra a moeda para pagar. É a mesma escolha feita no PTAX, e ela precisa ser
 * a mesma nas duas fontes: se uma usasse compra e a outra venda, entregas
 * vizinhas teriam custos diferentes por causa de qual serviço respondeu.
 */
const CAMPO_DE_VENDA = "ask" as const;

/**
 * Segundos ou milissegundos, o mesmo instante.
 *
 * Acima de 1e11 só pode ser milissegundo: como segundo, isso seria o ano 5138.
 */
function lerInstante(bruto: unknown): Date | null {
  const n = typeof bruto === "string" ? Number(bruto.trim()) : bruto;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n > 1e11 ? n : n * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numero(bruto: unknown): number | null {
  const n = typeof bruto === "string" ? Number(bruto.trim()) : bruto;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 1000) {
    return null;
  }
  return n;
}

/**
 * Lê a resposta de /json/daily e devolve os dias em ordem, do mais antigo ao
 * mais recente.
 *
 * Nunca lança: resposta estranha vira lista vazia. Item corrompido é descartado
 * sozinho, sem levar os dias bons junto.
 */
export function lerDiarioAwesome(bruto: unknown): DiaAwesome[] {
  if (!Array.isArray(bruto)) return [];
  const dias: DiaAwesome[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const compra = numero(o.bid);
    const venda = numero(o[CAMPO_DE_VENDA]);
    const quando = lerInstante(o.timestamp);
    if (compra == null || venda == null || quando == null) continue;
    dias.push({ taxa: venda, compra, venda, quando });
  }
  return dias.sort((a, b) => a.quando.getTime() - b.quando.getTime());
}

/**
 * O fechamento mais recente que não seja DEPOIS do dia pedido.
 *
 * O mesmo recuo que o PTAX faz por período: fim de semana não tem fechamento, e
 * o que vale é o último dia útil antes dele. Nunca olha para a frente: usar o
 * fechamento de segunda para uma compra de sábado seria gravar um câmbio que
 * ainda não existia quando o dinheiro saiu.
 */
export function fechamentoAte(
  dias: DiaAwesome[],
  limite: Date,
): DiaAwesome | null {
  // Fim do DIA pedido em São Paulo, para que o próprio dia conte: o fechamento
  // sai à tarde, e comparar com o instante recebido descartaria o fechamento de
  // quem pergunta de manhã. Somar 24h ao instante seria pior: às 12h isso
  // alcançaria o meio-dia seguinte e traria um fechamento do futuro.
  const teto = new Date(`${emSaoPaulo(limite)}T23:59:59.999-03:00`).getTime();
  let melhor: DiaAwesome | null = null;
  for (const d of dias) {
    if (d.quando.getTime() > teto) continue;
    if (!melhor || d.quando > melhor.quando) melhor = d;
  }
  return melhor;
}

/**
 * Lê a resposta de /json/last, que é a cotação de AGORA.
 *
 * Endpoint diferente do /json/daily e formato diferente: aqui vem um OBJETO
 * com uma chave por par, sem hífen ("CNYBRL"), e não uma lista. Usar o daily
 * para perguntar o câmbio de hoje traz o fechamento de ontem, porque o de hoje
 * ainda não existe.
 */
export function lerUltimaAwesome(
  bruto: unknown,
  par: string,
): DiaAwesome | null {
  if (!bruto || typeof bruto !== "object") return null;
  const item = (bruto as Record<string, unknown>)[par.replace("-", "")];
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const compra = numero(o.bid);
  const venda = numero(o[CAMPO_DE_VENDA]);
  const quando = lerInstante(o.timestamp);
  if (compra == null || venda == null || quando == null) return null;
  return { taxa: venda, compra, venda, quando };
}

/** AAAA-MM-DD no fuso de São Paulo. */
function emSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** AAAAMMDD, que é o formato que start_date e end_date pedem. */
export function dataParaAwesome(d: Date): string {
  return emSaoPaulo(d).replace(/-/g, "");
}
