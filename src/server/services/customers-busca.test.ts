import { describe, expect, it } from "vitest";

import { interpretarBusca, whatsappLink } from "./customers";

describe("interpretarBusca", () => {
  it("arroba é e-mail", () => {
    expect(interpretarBusca("mateus@gmail.com")).toEqual({
      tipo: "email",
      valor: "mateus@gmail.com",
    });
    expect(interpretarBusca("@gmail")).toEqual({ tipo: "email", valor: "@gmail" });
  });

  it("só dígitos é documento, com ou sem máscara", () => {
    expect(interpretarBusca("043.503.771-40")).toEqual({
      tipo: "documento",
      valor: "04350377140",
    });
    expect(interpretarBusca("(62) 99808-0613")).toEqual({
      tipo: "documento",
      valor: "62998080613",
    });
    // Pedaço de número também: quem lembra só do começo continua achando.
    expect(interpretarBusca("62998")).toEqual({ tipo: "documento", valor: "62998" });
  });

  it("texto é nome, mesmo com número no meio", () => {
    expect(interpretarBusca("Mateus")).toEqual({ tipo: "nome", valor: "Mateus" });
    // Nome com dígito não vira documento: "Visitante Teste 1838" existe.
    expect(interpretarBusca("Visitante 1838")).toEqual({
      tipo: "nome",
      valor: "Visitante 1838",
    });
    // Acento não pode ser confundido com dígito.
    expect(interpretarBusca("André")).toEqual({ tipo: "nome", valor: "André" });
  });

  it("um ou dois dígitos ainda é nome, não documento", () => {
    // Buscar "11" como documento traria toda a base com 11 em qualquer
    // posição do CPF ou do telefone, que é ruído, não resultado.
    expect(interpretarBusca("11").tipo).toBe("nome");
  });
});

describe("whatsappLink", () => {
  it("usa o DDI do país cadastrado", () => {
    expect(whatsappLink("62998080613", "BR")).toBe("https://wa.me/5562998080613");
    expect(whatsappLink("912345678", "PT")).toBe("https://wa.me/351912345678");
  });

  it("valida o tamanho pela regra do país", () => {
    // Nove dígitos: número inteiro em Portugal, pela metade no Brasil.
    expect(whatsappLink("912345678", "PT")).not.toBeNull();
    expect(whatsappLink("912345678", "BR")).toBeNull();
  });

  it("sem telefone, sem link", () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("")).toBeNull();
  });

  it("país sem DDI conhecido manda o número como está", () => {
    expect(whatsappLink("123456789", "XX")).toBe("https://wa.me/123456789");
  });
});
