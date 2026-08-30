import { describe, expect, it } from "vitest";

import { lerReais } from "@/lib/dinheiro";

describe("lerReais", () => {
  it("lê o formato brasileiro", () => {
    expect(lerReais("1.234,56")).toBe(1234.56);
    expect(lerReais("1234,56")).toBe(1234.56);
    expect(lerReais("0,99")).toBe(0.99);
  });

  it("lê o formato com ponto decimal", () => {
    expect(lerReais("1234.56")).toBe(1234.56);
    // O caso que um "tem vírgula?" erraria: aqui a vírgula é MILHAR.
    expect(lerReais("1,234.56")).toBe(1234.56);
  });

  it("ignora o cifrão e o espaço, que vêm de colagem", () => {
    expect(lerReais("R$ 1.234,56")).toBe(1234.56);
    expect(lerReais("  89,90 ")).toBe(89.9);
  });

  it("número inteiro sem separador nenhum", () => {
    expect(lerReais("250")).toBe(250);
  });

  it("vazio é nulo, e não zero", () => {
    // Zero e "não anotei" são coisas diferentes: uma diz que a skin saiu de
    // graça, a outra que ninguém preencheu ainda.
    expect(lerReais("")).toBeNull();
    expect(lerReais("   ")).toBeNull();
    expect(lerReais("R$")).toBeNull();
  });

  it("texto sem número nenhum é nulo", () => {
    expect(lerReais("abc")).toBeNull();
  });
});
