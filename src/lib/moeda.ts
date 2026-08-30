// As três moedas do custo da entrega.
//
// O que fica GRAVADO é sempre yuan: é a moeda em que a skin é comprada do
// fornecedor, e é o único número que existiu de verdade. Real e dólar são
// leituras, calculadas com as taxas que o painel cadastra.
//
// Guardar só a moeda paga e converter na leitura é o que impede o histórico de
// mentir: se guardássemos os três, a linha de seis meses atrás continuaria
// mostrando o real de hoje aplicado a uma compra antiga.

export type Moeda = "CNY" | "BRL" | "USD";

/** A ordem do clique: yuan, real, dólar, e volta. */
export const MOEDAS: readonly Moeda[] = ["CNY", "BRL", "USD"];

export const SIMBOLO: Record<Moeda, string> = {
  CNY: "¥",
  BRL: "R$",
  USD: "$",
};

export interface Taxas {
  /** Quantos reais vale 1 yuan. Nulo = não cadastrada. */
  cnyToBrl: number | null;
  /** Quantos reais vale 1 dólar. Nulo = não cadastrada. */
  usdToBrl: number | null;
}

/** A próxima moeda do ciclo. */
export function proximaMoeda(atual: Moeda): Moeda {
  return MOEDAS[(MOEDAS.indexOf(atual) + 1) % MOEDAS.length];
}

/**
 * Converte um valor em yuan para a moeda pedida.
 *
 * Devolve nulo quando falta a taxa, e não zero: zero diria que a skin custou
 * nada, e o que se quer dizer é que a conversão não é possível ainda.
 */
export function deYuan(
  valorEmYuan: number,
  para: Moeda,
  taxas: Taxas,
): number | null {
  if (para === "CNY") return valorEmYuan;
  if (taxas.cnyToBrl == null || taxas.cnyToBrl <= 0) return null;
  const emReais = valorEmYuan * taxas.cnyToBrl;
  if (para === "BRL") return emReais;
  if (taxas.usdToBrl == null || taxas.usdToBrl <= 0) return null;
  return emReais / taxas.usdToBrl;
}

/** O caminho de volta: o que foi digitado numa moeda vira yuan para gravar. */
export function paraYuan(
  valor: number,
  de: Moeda,
  taxas: Taxas,
): number | null {
  if (de === "CNY") return valor;
  if (taxas.cnyToBrl == null || taxas.cnyToBrl <= 0) return null;
  if (de === "BRL") return valor / taxas.cnyToBrl;
  if (taxas.usdToBrl == null || taxas.usdToBrl <= 0) return null;
  return (valor * taxas.usdToBrl) / taxas.cnyToBrl;
}

/**
 * As taxas que valem para UMA entrega.
 *
 * O câmbio gravado na linha manda: ele é o boletim do dia em que aquela skin
 * saiu, e é o que impede o histórico de ser reconvertido pelo câmbio de hoje.
 * A taxa do painel é rede de segurança, para as linhas sem boletim próprio.
 *
 * O dólar continua vindo do painel: ele é leitura de conveniência na tela, não
 * entra em relatório, e guardar um segundo boletim por linha só para isso seria
 * pagar caro por pouco.
 */
export function taxasDaEntrega(
  globais: Taxas,
  cambioDaLinha: number | null,
): Taxas {
  return {
    cnyToBrl:
      cambioDaLinha != null && cambioDaLinha > 0
        ? cambioDaLinha
        : globais.cnyToBrl,
    usdToBrl: globais.usdToBrl,
  };
}

/** Formata com o símbolo da moeda e duas casas, no padrão brasileiro. */
export function formatarMoeda(valor: number, moeda: Moeda): string {
  const n = valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${SIMBOLO[moeda]} ${n}`;
}
