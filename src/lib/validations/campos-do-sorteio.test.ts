import { describe, expect, it } from "vitest";

import { mensagemDeCamposInvalidos } from "./campos-do-sorteio";

describe("mensagemDeCamposInvalidos", () => {
  it("nomeia o campo em vez de dizer só 'dados inválidos'", () => {
    // O caso real: a pessoa salva, a frase antiga dizia "Dados inválidos", e
    // ela ficava olhando para sete abas sem saber por onde começar.
    expect(
      mensagemDeCamposInvalidos({ shortDescription: ["Obrigatório"] }),
    ).toBe("Confira este campo: Breve descrição.");
  });

  it("junta até três campos", () => {
    expect(
      mensagemDeCamposInvalidos({
        title: ["x"],
        pricePerNumber: ["x"],
        totalNumbers: ["x"],
      }),
    ).toBe("Confira estes campos: Título, Preço da cota, Quantidade de cotas.");
  });

  it("acima de três, conta o resto", () => {
    const r = mensagemDeCamposInvalidos({
      title: ["x"],
      slug: ["x"],
      pricePerNumber: ["x"],
      totalNumbers: ["x"],
      drawDate: ["x"],
    });
    expect(r).toMatch(/e mais 2\.$/);
  });

  it("campo sem nome na tabela aparece pela chave, em vez de sumir", () => {
    expect(mensagemDeCamposInvalidos({ campoNovo: ["x"] })).toBe(
      "Confira este campo: campoNovo.",
    );
  });

  it("ignora campo listado sem erro nenhum", () => {
    expect(mensagemDeCamposInvalidos({ title: [], slug: undefined })).toBe(
      "Dados inválidos. Confira os campos do sorteio.",
    );
  });
});
