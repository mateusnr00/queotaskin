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
