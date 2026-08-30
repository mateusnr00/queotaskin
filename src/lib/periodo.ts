// Cálculos puros de período para o painel de estatísticas.
//
// Tudo aqui é função pura, sem banco e sem relógio: recebe datas, devolve
// datas/números. É o que o funil, a série de vendas e o comparativo usam para
// falar a mesma língua de "período", e o que os testes cobrem sem precisar de
// Prisma.
//
// Os buckets são calculados em UTC, como a página de relatórios já fazia, para
// o resultado ser determinístico. O deslocamento de 3h em relação a Brasília é
// irrelevante num agregado por dia/semana/mês.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Teto do período que o painel aceita puxar de uma vez. */
export const MAX_DIAS_PERIODO = 180;

export type Granularidade = "dia" | "semana" | "mes";

/** Dias inteiros entre duas datas (arredonda para o dia mais próximo). */
export function diasEntre(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_POR_DIA);
}

/**
 * Prende o intervalo ao teto, encolhendo o começo e preservando o fim: quem
 * pede "últimos 500 dias" recebe os últimos 180 terminando na mesma data.
 */
export function limitarIntervalo(
  from: Date,
  to: Date,
  maxDias: number = MAX_DIAS_PERIODO,
): { from: Date; to: Date } {
  if (diasEntre(from, to) <= maxDias) return { from, to };
  return { from: new Date(to.getTime() - maxDias * MS_POR_DIA), to };
}

/**
 * A granularidade que mantém o eixo legível: dia até ~45 dias, semana até
 * ~120, mês além disso. Sem isso, 180 dias por dia viram 180 colunas
 * ilegíveis.
 */
export function escolherGranularidade(from: Date, to: Date): Granularidade {
  const dias = diasEntre(from, to);
  if (dias <= 45) return "dia";
  if (dias <= 120) return "semana";
  return "mes";
}

/**
 * A janela de mesmo tamanho imediatamente anterior, para o comparativo
 * "vs período anterior". Termina 1ms antes do começo do período atual, então
 * as duas não se sobrepõem.
 */
export function periodoAnterior(from: Date, to: Date): { from: Date; to: Date } {
  const duracao = to.getTime() - from.getTime();
  const anteriorTo = new Date(from.getTime() - 1);
  const anteriorFrom = new Date(anteriorTo.getTime() - duracao);
  return { from: anteriorFrom, to: anteriorTo };
}

/**
 * Variação percentual arredondada de `anterior` para `atual`. Devolve null
 * quando o anterior é zero: dividir por zero na tela é pior que não dizer nada,
 * e o primeiro período de vida do site mostraria um aumento infinito.
 */
export function variacaoPercentual(
  atual: number,
  anterior: number,
): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** A segunda-feira (ISO) da semana de uma data, em UTC, como "YYYY-MM-DD". */
function segundaDaSemana(d: Date): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const diaDaSemana = date.getUTCDay() || 7; // domingo (0) vira 7
  date.setUTCDate(date.getUTCDate() - diaDaSemana + 1);
  return date.toISOString().slice(0, 10);
}

/** A chave do bucket a que uma data pertence, na granularidade dada. */
export function chaveDoBucket(d: Date, g: Granularidade): string {
  if (g === "mes") return d.toISOString().slice(0, 7); // YYYY-MM
  if (g === "semana") return segundaDaSemana(d);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** O rótulo em pt-BR de uma chave de bucket, para o eixo e a tabela. */
export function rotuloDoBucket(chave: string, g: Granularidade): string {
  if (g === "mes") {
    const [y, m] = chave.split("-");
    const data = new Date(Number(y), Number(m) - 1, 1);
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(data);
  }
  const data = new Date(`${chave}T00:00:00Z`);
  if (g === "semana") {
    return "Sem. de " + new Intl.DateTimeFormat("pt-BR").format(data);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(data);
}
