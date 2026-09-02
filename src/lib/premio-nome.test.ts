import { describe, expect, it } from "vitest";

import type { SkinRarity } from "@prisma/client";

import {
  chaveDoNome,
  desgasteCurto,
  imagemDoPremio,
  raridadeDoPremio,
  separarDesgaste,
} from "./premio-nome";

describe("separarDesgaste", () => {
  it("separa o desgaste em inglês, como a Steam escreve", () => {
    expect(separarDesgaste("AK-47 | Vulcan (Field-Tested)")).toEqual({
      nome: "AK-47 | Vulcan",
      desgaste: "Field-Tested",
    });
    expect(separarDesgaste("★ Flip Knife | Autotronic (Factory New)")).toEqual({
      nome: "★ Flip Knife | Autotronic",
      desgaste: "Factory New",
    });
  });

  it("separa o desgaste traduzido, que é como a página pública escreve", () => {
    expect(separarDesgaste("AWP | Dragon Lore (Testada em Campo)")).toEqual({
      nome: "AWP | Dragon Lore",
      desgaste: "Testada em Campo",
    });
  });

  // O motivo de existir a lista de desgastes conhecidos em vez de simplesmente
  // cortar o último parêntese. Prêmio é texto livre digitado no painel, e
  // "(2 unidades)" faz parte do nome.
  it("não corta parêntese que não é desgaste", () => {
    expect(separarDesgaste("Faca borboleta (2 unidades)")).toEqual({
      nome: "Faca borboleta (2 unidades)",
      desgaste: null,
    });
    expect(separarDesgaste("R$ 500 no Pix")).toEqual({
      nome: "R$ 500 no Pix",
      desgaste: null,
    });
  });

  it("aceita caixa diferente e espaço sobrando", () => {
    expect(separarDesgaste("Desert Eagle | Blaze  (field-tested)  ")).toEqual({
      nome: "Desert Eagle | Blaze",
      desgaste: "field-tested",
    });
  });

  it("com dois parênteses, o desgaste é o do fim", () => {
    expect(separarDesgaste("Skin (rara) (Minimal Wear)")).toEqual({
      nome: "Skin (rara)",
      desgaste: "Minimal Wear",
    });
  });
});

describe("raridadeDoPremio", () => {
  const catalogo = new Map<string, SkinRarity | null>([
    [chaveDoNome("AK-47 | Vulcan"), "COVERT"],
    [chaveDoNome("Glock-18 | Moonrise"), "MIL_SPEC"],
    [chaveDoNome("Agente sem raridade"), null],
  ]);

  it("acha a raridade ignorando o desgaste", () => {
    expect(raridadeDoPremio("AK-47 | Vulcan (Field-Tested)", catalogo)).toBe(
      "COVERT",
    );
    expect(raridadeDoPremio("AK-47 | Vulcan", catalogo)).toBe("COVERT");
  });

  it("ignora caixa e espaço sobrando", () => {
    expect(raridadeDoPremio("  glock-18 |  moonrise  ", catalogo)).toBe(
      "MIL_SPEC",
    );
  });

  // O caso normal: título premiado que não é skin.
  it("devolve null para prêmio fora do catálogo", () => {
    expect(raridadeDoPremio("R$ 500 no Pix", catalogo)).toBeNull();
  });

  // A comparação ignora pontuação de propósito. Exigir "AK-47 | Vulcan" com
  // a barra fazia quem escrevia do jeito natural não achar nada e salvar um
  // prêmio sem cor, sem ser avisado.
  it("aceita o nome sem a barra e sem o hífen", () => {
    expect(raridadeDoPremio("AK47 Vulcan", catalogo)).toBe("COVERT");
    expect(raridadeDoPremio("ak-47 vulcan", catalogo)).toBe("COVERT");
    expect(raridadeDoPremio("AK 47 | Vulcan (Field-Tested)", catalogo)).toBe(
      "COVERT",
    );
  });

  it("continua sem casar nome que é outra coisa", () => {
    expect(raridadeDoPremio("AK-47 | Redline", catalogo)).toBeNull();
    expect(raridadeDoPremio("Vulcan", catalogo)).toBeNull();
  });

  it("skin cadastrada sem raridade não inventa cor", () => {
    expect(raridadeDoPremio("Agente sem raridade", catalogo)).toBeNull();
  });
});

describe("imagemDoPremio", () => {
  const fotos = new Map<string, string | null>([
    [chaveDoNome("AK-47 | Vulcan"), "https://steam/vulcan.png"],
    [chaveDoNome("★ Karambit | Doppler"), "https://steam/karambit.png"],
    [chaveDoNome("Agente sem foto"), null],
  ]);

  it("acha a foto ignorando o desgaste, como a raridade faz", () => {
    expect(imagemDoPremio("AK-47 | Vulcan (Field-Tested)", fotos)).toBe(
      "https://steam/vulcan.png",
    );
  });

  it("acha a faca com e sem a estrela no texto do prêmio", () => {
    expect(imagemDoPremio("★ Karambit | Doppler (Factory New)", fotos)).toBe(
      "https://steam/karambit.png",
    );
    expect(imagemDoPremio("karambit doppler", fotos)).toBe(
      "https://steam/karambit.png",
    );
  });

  it("prêmio que não é skin fica sem foto, e isso é o caso normal", () => {
    expect(imagemDoPremio("R$ 500 no Pix", fotos)).toBeNull();
  });

  it("skin no catálogo sem foto devolve null, e não undefined", () => {
    // A tela testa `imagem ?? null`, e undefined vazando daqui viraria um
    // terceiro estado silencioso.
    expect(imagemDoPremio("Agente sem foto", fotos)).toBeNull();
  });
});

describe("desgasteCurto", () => {
  it("traduz os cinco desgastes para sigla", () => {
    // A janela da raspadinha tem uns dois centímetros: "(Field-Tested)" por
    // extenso come metade dela e quebra o nome da skin em três linhas.
    expect(desgasteCurto("Factory New")).toBe("FN");
    expect(desgasteCurto("Minimal Wear")).toBe("MW");
    expect(desgasteCurto("Field-Tested")).toBe("FT");
    expect(desgasteCurto("Well-Worn")).toBe("WW");
    expect(desgasteCurto("Battle-Scarred")).toBe("BS");
  });

  it("aceita o nome em português, que também aparece no cadastro", () => {
    expect(desgasteCurto("Testada em Campo")).toBe("FT");
    expect(desgasteCurto("Nova de Fábrica")).toBe("FN");
  });

  it("não liga para caixa nem para espaço em volta", () => {
    expect(desgasteCurto("  field-tested ")).toBe("FT");
  });

  it("o que não é desgaste devolve nulo", () => {
    // Quem chama mostra o texto como está: cortar seria inventar.
    expect(desgasteCurto("2 unidades")).toBeNull();
    expect(desgasteCurto(null)).toBeNull();
    expect(desgasteCurto("")).toBeNull();
  });
});
