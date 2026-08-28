import { describe, expect, it } from "vitest";

import { nomeCurto } from "./nome-curto";

describe("nomeCurto", () => {
  it("mantém o nome único", () => {
    expect(nomeCurto("Lucas")).toBe("Lucas");
  });

  it("corta no segundo nome", () => {
    expect(nomeCurto("Joao Vitor de Alencar")).toBe("Joao Vitor");
    expect(nomeCurto("Ediano Rodrigues")).toBe("Ediano Rodrigues");
  });

  // "Maria da" não é jeito de chamar ninguém.
  it("pula a partícula e fica só no primeiro", () => {
    expect(nomeCurto("Maria da Silva")).toBe("Maria");
    expect(nomeCurto("Pedro de Souza Lima")).toBe("Pedro");
    expect(nomeCurto("Ana E Silva")).toBe("Ana");
  });

  it("aguenta espaço sobrando e string vazia", () => {
    expect(nomeCurto("  Rafael   Costa  ")).toBe("Rafael Costa");
    expect(nomeCurto("   ")).toBe("");
  });
});
