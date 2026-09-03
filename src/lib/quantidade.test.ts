import { describe, expect, it } from "vitest";

import { aparaQuantidade, limitesDaQuantidade } from "./quantidade";

describe("limites da quantidade", () => {
  it("o piso nunca é zero, porque comprar nada não é comprar", () => {
    expect(limitesDaQuantidade(0).min).toBe(1);
    expect(limitesDaQuantidade(-5).min).toBe(1);
    expect(limitesDaQuantidade(1).min).toBe(1);
  });

  it("o mínimo da campanha manda quando é maior que um", () => {
    expect(limitesDaQuantidade(10).min).toBe(10);
  });

  it("sem teto configurado, vale o de sempre do formulário", () => {
    expect(limitesDaQuantidade(1).max).toBe(10_000);
    expect(limitesDaQuantidade(1, null).max).toBe(10_000);
  });

  it("com teto configurado, é ele", () => {
    expect(limitesDaQuantidade(1, 50).max).toBe(50);
  });

  it("teto abaixo do piso não recusa tudo: o piso ganha", () => {
    expect(limitesDaQuantidade(10, 5)).toEqual({ min: 10, max: 10 });
  });
});

describe("aparar a quantidade", () => {
  const limites = limitesDaQuantidade(2, 50);

  it("respeita o mínimo", () => {
    expect(aparaQuantidade(1, limites)).toBe(2);
    expect(aparaQuantidade(0, limites)).toBe(2);
    expect(aparaQuantidade(-99, limites)).toBe(2);
  });

  it("respeita o máximo", () => {
    expect(aparaQuantidade(51, limites)).toBe(50);
    expect(aparaQuantidade(999_999, limites)).toBe(50);
  });

  it("deixa passar o que está dentro", () => {
    for (const v of [2, 3, 25, 49, 50]) {
      expect(aparaQuantidade(v, limites)).toBe(v);
    }
  });

  it("valor quebrado ou inválido não vira quantidade quebrada", () => {
    expect(aparaQuantidade(3.7, limites)).toBe(3);
    // Nem NaN nem infinito são quantidade: caem no piso, e não no teto.
    // Cair no teto faria um valor sem sentido virar a maior compra possível.
    expect(aparaQuantidade(NaN, limites)).toBe(2);
    expect(aparaQuantidade(Infinity, limites)).toBe(2);
    expect(aparaQuantidade(-Infinity, limites)).toBe(2);
  });

  // O que o "-" e o "+" fazem, e por que eles ficam desabilitados na ponta.
  it("mais e menos andam de um em um e param nas pontas", () => {
    let q = 2;
    q = aparaQuantidade(q + 1, limites);
    expect(q).toBe(3);
    q = aparaQuantidade(q - 1, limites);
    expect(q).toBe(2);
    // No piso, "-" está desabilitado; se fosse clicado, não passaria daqui.
    expect(aparaQuantidade(q - 1, limites)).toBe(2);
    expect(aparaQuantidade(50 + 1, limites)).toBe(50);
  });

  it("o total segue a quantidade aparada, e não a digitada", () => {
    const preco = 2.5;
    expect(aparaQuantidade(999, limites) * preco).toBe(125);
    expect(aparaQuantidade(0, limites) * preco).toBe(5);
  });
});
