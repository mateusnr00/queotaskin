import { describe, expect, it } from "vitest";

import { camposObrigatoriosCoerentes } from "@/lib/validations/raffle";

// Nome, telefone e CPF são sempre pedidos, e as três camadas concordavam em
// nada: o painel mostrava ligado e travado, a edição lia false, o banco
// gravava false e a página pública obedecia ao false. Esta função é a resposta
// única, e roda na leitura e na gravação.

describe("camposObrigatoriosCoerentes", () => {
  it("liga nome, telefone e CPF mesmo quando o banco diz o contrário", () => {
    expect(
      camposObrigatoriosCoerentes({
        name: false,
        phone: false,
        cpf: false,
        email: false,
        socialName: false,
        birthDate: false,
      }),
    ).toMatchObject({ name: true, phone: true, cpf: true });
  });

  it("campanha antiga, sem o JSON, também sai coerente", () => {
    expect(camposObrigatoriosCoerentes(null)).toEqual({
      name: true,
      phone: true,
      cpf: true,
      email: false,
      socialName: false,
      birthDate: false,
    });
  });

  it("preserva o que o admin realmente escolhe", () => {
    expect(
      camposObrigatoriosCoerentes({
        email: true,
        socialName: false,
        birthDate: true,
      }),
    ).toMatchObject({ email: true, socialName: false, birthDate: true });
  });

  it("o que o navegador mandar para os três travados é ignorado", () => {
    // O formulário público não manda isto, mas uma requisição montada à mão
    // manda. Desligar o pedido de identidade pela rede não pode funcionar.
    expect(
      camposObrigatoriosCoerentes({ name: false, phone: false, cpf: false }),
    ).toMatchObject({ name: true, phone: true, cpf: true });
  });
});
