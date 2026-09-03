/**
 * Lê um valor em reais digitado por gente.
 *
 * Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56", porque é isso que
 * sai de um teclado brasileiro, de uma colagem do banco ou de uma planilha, e
 * exigir um formato só transformaria digitar um preço em adivinhar o formato.
 *
 * A regra que desfaz a ambiguidade: o ÚLTIMO separador manda. Em "1.234,56" a
 * vírgula é decimal e o ponto é milhar; em "1234.56" o ponto é decimal. Só
 * olhar "tem vírgula?" erraria em "1,234.56", que é como um sistema em inglês
 * escreve o mesmo número.
 */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, "").trim();
  if (limpo === "") return null;

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
  const milhar = decimal === "," ? "." : ",";

  const normalizado = limpo
    .split(milhar)
    .join("")
    .replace(decimal, ".");

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/**
 * O preço de cada número, a partir do valor da skin.
 *
 * Arredonda o centavo para cima de propósito. Para baixo, cem números a
 * R$ 12,3456 arrecadariam menos do que a skin custa, e a rifa nasceria no
 * prejuízo por causa de um arredondamento. Para cima, a sobra é de no máximo
 * um centavo por número.
 */
export function precoPorNumero(
  valorDaSkin: number,
  totalDeNumeros: number,
): number | null {
  if (!(valorDaSkin > 0) || !(totalDeNumeros > 0)) return null;
  return Math.ceil((valorDaSkin / totalDeNumeros) * 100) / 100;
}

/**
 * A divisão sem arredondar, para a tela mostrar a conta.
 *
 * R$ 1.249,00 em 10.000 números dá R$ 0,1249, e o que se cobra é R$ 0,13.
 * Mostrar só o cobrado esconde de onde ele veio; mostrar os dois deixa quem
 * cria conferir se o arredondamento vale a pena naquele tamanho de campanha.
 *
 * É número de TELA. O banco guarda `pricePerNumber` com duas casas, porque
 * cobrar fração de centavo não existe.
 */
export function precoExatoPorNumero(
  valorDaSkin: number,
  totalDeNumeros: number,
): number | null {
  if (!(valorDaSkin > 0) || !(totalDeNumeros > 0)) return null;
  return valorDaSkin / totalDeNumeros;
}

/**
 * Quanto a campanha arrecada se vender tudo pelo preço da cota.
 *
 * Sempre maior ou igual ao valor da skin, porque a cota arredonda para cima.
 * A diferença é a margem, e ela precisa estar à vista: em campanha grande o
 * arredondamento de um centavo por número vira centenas de reais.
 */
export function arrecadacaoPrevista(
  precoPorNumeroEmReais: number,
  totalDeNumeros: number,
): number | null {
  if (!(precoPorNumeroEmReais > 0) || !(totalDeNumeros > 0)) return null;
  return Math.round(precoPorNumeroEmReais * totalDeNumeros * 100) / 100;
}
