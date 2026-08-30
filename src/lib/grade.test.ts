import { describe, expect, it } from "vitest";

import { CLASSE_DE_COLUNAS, colunasDosCards } from "@/lib/grade";

describe("colunasDosCards", () => {
  it("quatro cards ficam dois e dois", () => {
    // O pedido, e a razão dele: em três colunas, o quarto card ficava sozinho
    // na segunda linha e parecia um card de outra natureza.
    expect(colunasDosCards(4)).toBe(2);
  });

  it("um ou dois cards ocupam a largura que têm", () => {
    // Um card em três colunas ficaria com um terço da largura e dois buracos
    // do lado.
    expect(colunasDosCards(1)).toBe(1);
    expect(colunasDosCards(2)).toBe(2);
  });

  it("o resto segue em três, que é o que cabe sem apertar o preço", () => {
    expect(colunasDosCards(3)).toBe(3);
    expect(colunasDosCards(5)).toBe(3);
    expect(colunasDosCards(6)).toBe(3);
  });

  it("nenhuma contagem sai da faixa que o Tailwind conhece", () => {
    // Classe montada em tempo de execução não entra no CSS gerado, então a
    // função só pode devolver o que o mapa tem.
    for (let n = 0; n <= 12; n++) {
      expect(CLASSE_DE_COLUNAS[colunasDosCards(n)]).toBeTruthy();
    }
  });

  it("zero não quebra", () => {
    expect(colunasDosCards(0)).toBe(1);
  });
});
