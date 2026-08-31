// Quanto o gateway fica de cada pagamento.
//
// A taxa não é cobrada pela plataforma: ela já saiu antes de o dinheiro cair
// na conta. O que este arquivo faz é o relatório parar de contar como receita
// um dinheiro que nunca chegou, e o número da campanha dizer quanto sobrou de
// verdade.
//
// Por FAIXA de valor, porque é assim que eles cobram: até cem reais um fixo,
// acima disso um percentual mais outro fixo. Um par único de percentual e
// fixo erraria justamente nas compras grandes, que são as que pesam.

/** Uma faixa: a partir de tanto, cobra tanto por cento mais tanto fixo. */
export interface FaixaDeTaxa {
  /** A partir de qual valor de compra, em reais. Zero é a faixa base. */
  apartirDe: number;
  /** Percentual sobre o valor da compra. 2 significa 2%. */
  percentual: number;
  /** Valor fixo somado, em reais. */
  fixo: number;
}

/** Centavos, sempre. Meio centavo sobe, que é como o gateway arredonda. */
function emCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * A faixa que vale para uma compra deste valor.
 *
 * A maior `apartirDe` que ainda cabe no valor. Sem faixa nenhuma que caiba,
 * devolve null, e quem chama entende como "não sei a taxa deste gateway", que
 * é diferente de "a taxa é zero": um relatório que assume zero mente com a
 * mesma cara com que mostraria o número certo.
 */
export function faixaParaValor(
  valor: number,
  faixas: FaixaDeTaxa[],
): FaixaDeTaxa | null {
  let escolhida: FaixaDeTaxa | null = null;
  for (const faixa of faixas) {
    if (valor < faixa.apartirDe) continue;
    if (!escolhida || faixa.apartirDe > escolhida.apartirDe) escolhida = faixa;
  }
  return escolhida;
}

/**
 * Quanto o gateway fica desta compra.
 *
 * Zero quando não há faixa que caiba, e o valor nunca passa do total: uma
 * faixa mal cadastrada (fixo de R$ 50 numa compra de R$ 10) faria o líquido
 * ficar negativo e o relatório mostrar prejuízo onde houve venda.
 */
export function taxaDaCompra(valor: number, faixas: FaixaDeTaxa[]): number {
  if (!(valor > 0)) return 0;
  const faixa = faixaParaValor(valor, faixas);
  if (!faixa) return 0;
  const bruta = (valor * faixa.percentual) / 100 + faixa.fixo;
  return Math.min(emCentavos(valor), Math.max(0, emCentavos(bruta)));
}

/** Uma compra que já foi aprovada, do jeito que o relatório a enxerga. */
export interface CompraComTaxa {
  valor: number;
  /** O gateway que processou. Nulo quando não passou por gateway nenhum. */
  provider: string | null;
}

/**
 * A soma das taxas de várias compras.
 *
 * Compra sem gateway (campanha gratuita, aprovação no painel) não paga taxa:
 * não houve gateway para cobrar. Gateway sem faixa cadastrada também soma
 * zero, e `semTaxa` conta quantas foram, para a tela poder dizer que o número
 * está incompleto em vez de apresentá-lo como final.
 */
export function taxaTotal(
  compras: CompraComTaxa[],
  faixasPorProvider: Map<string, FaixaDeTaxa[]>,
): { total: number; semTaxa: number } {
  let total = 0;
  let semTaxa = 0;
  for (const compra of compras) {
    if (!compra.provider) continue;
    const faixas = faixasPorProvider.get(compra.provider);
    if (!faixas || faixas.length === 0) {
      semTaxa++;
      continue;
    }
    total += taxaDaCompra(compra.valor, faixas);
  }
  return { total: emCentavos(total), semTaxa };
}

/**
 * Como a faixa é escrita numa linha.
 *
 * "R$ 0,45 por pix" e "2% + R$ 0,65 acima de R$ 100,00" dizem a regra inteira
 * sem obrigar ninguém a montar a frase de cabeça a partir de três campos.
 */
export function descreverFaixa(
  faixa: FaixaDeTaxa,
  formatarBRL: (v: number) => string,
): string {
  const partes: string[] = [];
  if (faixa.percentual > 0) {
    partes.push(`${String(faixa.percentual).replace(".", ",")}%`);
  }
  if (faixa.fixo > 0 || partes.length === 0) {
    partes.push(formatarBRL(faixa.fixo));
  }
  const cobranca = partes.join(" + ");
  return faixa.apartirDe > 0
    ? `${cobranca} acima de ${formatarBRL(faixa.apartirDe)}`
    : `${cobranca} por pagamento`;
}
