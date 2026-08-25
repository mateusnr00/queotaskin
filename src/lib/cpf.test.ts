import { describe, expect, it } from "vitest";

import { formatCpf, formatPhone, isValidCpf, onlyDigits } from "@/lib/cpf";

describe("onlyDigits", () => {
  it("remove tudo que não é dígito", () => {
    expect(onlyDigits("123.456.789-09")).toBe("12345678909");
    expect(onlyDigits("(11) 99999-9999")).toBe("11999999999");
    expect(onlyDigits("abc")).toBe("");
  });
});

describe("isValidCpf", () => {
  it("aceita CPFs válidos", () => {
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("111.444.777-35")).toBe(true);
  });

  it("rejeita CPFs inválidos", () => {
    expect(isValidCpf("11111111111")).toBe(false); // todos iguais
    expect(isValidCpf("12345678900")).toBe(false); // DV errado
    expect(isValidCpf("123")).toBe(false); // muito curto
    expect(isValidCpf("")).toBe(false);
  });
});

describe("formatCpf", () => {
  it("formata 11 dígitos", () => {
    expect(formatCpf("11144477735")).toBe("111.444.777-35");
  });

  it("retorna dígitos sem formatação se incompleto", () => {
    expect(formatCpf("123")).toBe("123");
  });
});

describe("formatPhone", () => {
  it("formata celular (11 dígitos)", () => {
    expect(formatPhone("11999998888")).toBe("(11) 99999-8888");
  });

  it("formata fixo (10 dígitos)", () => {
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });
});
