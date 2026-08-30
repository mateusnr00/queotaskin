// Quantas colunas a grade dos cards de quantidade usa.
//
// Era três, fixo. Com QUATRO cards isso dá três em cima e um sozinho embaixo,
// e o órfão puxa o olho para o canto errado: o último da fila parece um card
// diferente dos outros, quando é só o quarto de quatro.
//
// A regra é evitar a linha de um só. Quatro cards viram dois e dois; um ou
// dois cards ocupam a largura que têm; o resto continua em três, que é o que
// cabe sem apertar o texto do preço.

/** O número de colunas para uma quantidade de cards. */
export function colunasDosCards(quantos: number): 1 | 2 | 3 {
  if (quantos <= 1) return 1;
  if (quantos === 2) return 2;
  // Dois e dois, em vez de três mais um sozinho.
  if (quantos === 4) return 2;
  return 3;
}

/**
 * A classe do Tailwind para essa contagem.
 *
 * Literais, e não `grid-cols-${n}`: o Tailwind lê as classes no código-fonte,
 * e nome montado em tempo de execução não entra no CSS gerado. A grade
 * simplesmente não existiria.
 */
export const CLASSE_DE_COLUNAS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};
