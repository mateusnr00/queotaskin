// A cotação PTAX, do Banco Central.
//
// POR QUE PTAX E NÃO COTAÇÃO DE MERCADO
//
// PTAX é a taxa oficial, e é a que a Receita espera para converter transação em
// moeda estrangeira. O custo da skin é despesa em yuan: se um dia ele entrar em
// livro, o número tem que ser este.
//
// E, ao contrário de uma cotação de mercado, PTAX tem HISTÓRICO. É isso que
// permite cada entrega guardar o câmbio do dia em que ela saiu, em vez de todo
// o histórico ser reconvertido pela taxa de hoje toda vez que alguém a atualiza.
//
// AS TRÊS ARMADILHAS
//
// 1. A data vai em MM-DD-YYYY. Formato americano, em API do governo brasileiro.
// 2. Não há boletim em fim de semana nem feriado, e a resposta vem vazia.
// 3. Há mais de um boletim por dia (abertura, intermediário, fechamento). O que
//    vale é o de fechamento.

/** Reais por unidade da moeda, no boletim de fechamento de um dia. */
export interface CotacaoPtax {
  /** A taxa usada: a de VENDA. Ver escolhaDaTaxa, abaixo. */
  taxa: number;
  cotacaoCompra: number;
  cotacaoVenda: number;
  /** O dia do boletim, que pode ser anterior ao pedido: fim de semana recua. */
  dataDoBoletim: Date;
}

/**
 * Compra ou venda?
 *
 * Despesa em moeda estrangeira converte pela taxa de VENDA: é a ponta em que
 * se compra a moeda para pagar. Compra é a ponta do outro lado, de quem recebe.
 * Comprar a skin do fornecedor é despesa, então é venda.
 *
 * Os dois ficam gravados na resposta, então trocar de ideia não exige buscar
 * tudo de novo.
 */
export const TAXA_USADA = "cotacaoVenda" as const;

/** Quantos dias para trás procurar boletim antes de desistir. */
export const JANELA_EM_DIAS = 12;

/**
 * A data no formato que o PTAX aceita: MM-DD-YYYY.
 *
 * Calculada no fuso de São Paulo, e não em UTC. PTAX é boletim brasileiro de
 * fechamento: uma entrega das 22h de Brasília é 01h UTC do dia seguinte, e em
 * UTC ela pediria o boletim de um dia que ainda não aconteceu.
 */
export function dataParaPtax(d: Date): string {
  const [ano, mes, dia] = emSaoPaulo(d).split("-");
  return `${mes}-${dia}-${ano}`;
}

/** AAAA-MM-DD no fuso de São Paulo. */
export function emSaoPaulo(d: Date): string {
  // en-CA formata como AAAA-MM-DD, que é o que se quer fatiar.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** O começo da janela de busca: JANELA_EM_DIAS antes da data pedida. */
export function inicioDaJanela(fim: Date): Date {
  const d = new Date(fim);
  d.setUTCDate(d.getUTCDate() - JANELA_EM_DIAS);
  return d;
}

function numero(bruto: unknown): number | null {
  const n = typeof bruto === "string" ? Number(bruto.trim()) : bruto;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 1000) {
    return null;
  }
  return n;
}

/**
 * "2026-08-28 13:09:02.148" vira Date.
 *
 * O texto vem sem fuso e é horário de Brasília. Sem o offset explícito, o
 * Node interpretaria como horário local do servidor, que na Vercel é UTC: o
 * boletim das 13h de Brasília viraria 13h UTC, três horas antes do que foi.
 * Isso desloca o dia do boletim nas pontas.
 */
export function lerInstanteDoBoletim(bruto: unknown): Date | null {
  if (typeof bruto !== "string") return null;
  const m = bruto
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(
    `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000-03:00`,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lê a resposta do PTAX e devolve o boletim de FECHAMENTO mais recente.
 *
 * Nunca lança: resposta estranha vira nulo, e quem chamou decide o que dizer.
 * Vazio é resposta legítima, não erro: fim de semana e feriado não têm boletim.
 */
export function lerPeriodoPtax(bruto: unknown): CotacaoPtax | null {
  const lista = (bruto as { value?: unknown })?.value;
  if (!Array.isArray(lista) || lista.length === 0) return null;

  let melhor: CotacaoPtax | null = null;
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    // Abertura e intermediário existem no mesmo dia e valem menos: o número
    // oficial do dia é o de fechamento. Quando o campo não vem, aceita, porque
    // o endpoint de período costuma devolver só fechamento.
    const boletim = o.tipoBoletim;
    if (typeof boletim === "string" && !/fechamento/i.test(boletim)) continue;

    const compra = numero(o.cotacaoCompra);
    const venda = numero(o.cotacaoVenda);
    const quando = lerInstanteDoBoletim(o.dataHoraCotacao);
    if (compra == null || venda == null || quando == null) continue;

    const c: CotacaoPtax = {
      taxa: TAXA_USADA === "cotacaoVenda" ? venda : compra,
      cotacaoCompra: compra,
      cotacaoVenda: venda,
      dataDoBoletim: quando,
    };
    // A lista costuma vir em ordem, mas "costuma" não é garantia de contrato.
    if (!melhor || c.dataDoBoletim > melhor.dataDoBoletim) melhor = c;
  }
  return melhor;
}
